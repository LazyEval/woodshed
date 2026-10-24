import { eq, inArray } from 'drizzle-orm';
import {
	countBars,
	differingBars,
	isRecord,
	sameBarGrid,
	validateChart,
	type BarReason,
	type Chart,
	type RuleSnapshot
} from '#lib/chart.js';
import type { Result } from '#lib/result.js';
import type { Deps } from '#lib/server/deps.js';
import { rules, simplifiedCharts, tunes } from '#lib/server/db/schema.js';
import { jsonError, readBody, tuneNotFound } from '#lib/server/http.js';

const GENERATION_ATTEMPTS = 2;
const MAX_NOTE_LENGTH = 1000;
const MAX_REASON_LENGTH = 300;
const DEFAULT_NAME = 'Generated';
const MAX_NAME_LENGTH = 100;

interface Generated {
	chart: Chart;
	reasons: BarReason[];
}

interface GenerationInput {
	rules: RuleSnapshot[];
	note: string | null;
	name: string;
}

function readReasons(raw: unknown, barCount: number): Result<BarReason[]> {
	if (!Array.isArray(raw)) return { error: 'changes must be a list.' };
	const reasons = new Map<number, string>();
	for (const item of raw) {
		if (!isRecord(item) || typeof item.reason !== 'string' || !item.reason.trim()) {
			return { error: 'each change needs a bar number and a reason.' };
		}
		const bar = item.bar;
		if (typeof bar !== 'number' || !Number.isInteger(bar) || bar < 1 || bar > barCount) {
			return { error: `change bar must be a whole number from 1 to ${barCount}.` };
		}
		reasons.set(bar - 1, item.reason.trim().slice(0, MAX_REASON_LENGTH));
	}
	return {
		value: [...reasons].sort(([a], [b]) => a - b).map(([bar, reason]) => ({ bar, reason }))
	};
}

function readGenerated(raw: unknown, source: Chart): Result<Generated> {
	if (!isRecord(raw)) return { error: 'Output must be an object.' };
	const validated = validateChart(isRecord(raw.chart) ? { sections: raw.chart.sections } : null);
	if ('error' in validated) return validated;
	if (!sameBarGrid(source, validated.value)) {
		return { error: 'The bar grid differs from the Source Chart; only chords may change.' };
	}
	const reasons = readReasons(raw.changes, countBars(source));
	if ('error' in reasons) return reasons;
	const changed = new Set(differingBars(source, validated.value));
	const chart = {
		...validated.value,
		...(source.keyCenters && { keyCenters: source.keyCenters })
	};
	return {
		value: { chart, reasons: reasons.value.filter(({ bar }) => changed.has(bar)) }
	};
}

async function parseRequest(
	request: Request,
	deps: Deps
): Promise<Result<GenerationInput> | { failure: Response }> {
	const body = await readBody(request);
	if ('error' in body) return { failure: jsonError(body.error, 400) };

	const note = typeof body.value.note === 'string' ? body.value.note.trim() : '';
	if (note.length > MAX_NOTE_LENGTH) return { failure: jsonError('Note is too long.', 400) };

	const ruleIds = body.value.ruleIds ?? [];
	if (!Array.isArray(ruleIds) || ruleIds.some((id) => typeof id !== 'string')) {
		return { failure: jsonError('ruleIds must be a list of Rule ids.', 400) };
	}
	const uniqueIds = [...new Set(ruleIds as string[])];
	if (uniqueIds.length === 0 && !note) {
		return { failure: jsonError('Pick at least one Rule or add a note.', 400) };
	}

	const found = uniqueIds.length
		? await deps.db.select().from(rules).where(inArray(rules.id, uniqueIds))
		: [];
	if (found.length !== uniqueIds.length) {
		return { failure: jsonError('One or more Rules no longer exist.', 400) };
	}
	const byId = new Map(found.map((rule) => [rule.id, rule]));

	const name = typeof body.value.name === 'string' ? body.value.name.trim() : '';
	if (name.length > MAX_NAME_LENGTH) return { failure: jsonError('Name is too long.', 400) };

	return {
		value: {
			rules: uniqueIds.map((id) => {
				const { name, text } = byId.get(id)!;
				return { name, text };
			}),
			note: note || null,
			name: name || DEFAULT_NAME
		}
	};
}

export async function generateSimplifiedChart(
	request: Request,
	deps: Deps,
	tuneId: string
): Promise<Response> {
	const parsed = await parseRequest(request, deps);
	if ('failure' in parsed) return parsed.failure;
	if ('error' in parsed) return jsonError(parsed.error, 400);
	const { rules: snapshot, note, name } = parsed.value;

	const tune = await deps.db.query.tunes.findFirst({ where: eq(tunes.id, tuneId) });
	if (!tune) return tuneNotFound();
	if (tune.sourceChartStatus !== 'verified') {
		return jsonError('Source Chart must be Verified before a Generation.', 409);
	}

	let previousProblem: string | undefined;
	for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
		let raw: unknown;
		try {
			raw = await deps.ai.generate({
				source: tune.sourceChart,
				rules: snapshot,
				note,
				...(previousProblem && { previousProblem })
			});
		} catch {
			return jsonError('Generation failed. Try again.', 502);
		}
		const generated = readGenerated(raw, tune.sourceChart);
		if ('error' in generated) {
			previousProblem = generated.error;
			continue;
		}
		const now = deps.clock.now().getTime();
		const [created] = await deps.db
			.insert(simplifiedCharts)
			.values({
				id: crypto.randomUUID(),
				tuneId,
				name,
				origin: 'generated',
				chart: generated.value.chart,
				generation: { rules: snapshot, note, reasons: generated.value.reasons },
				createdAt: now,
				updatedAt: now
			})
			.returning();
		return Response.json(created, { status: 201 });
	}
	return jsonError(`Generation produced an invalid chart: ${previousProblem}`, 422);
}
