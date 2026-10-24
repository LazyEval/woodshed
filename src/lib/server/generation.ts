import { eq } from 'drizzle-orm';
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
import { simplifiedCharts, tunes } from '#lib/server/db/schema.js';
import { jsonError, readBody, tuneNotFound } from '#lib/server/http.js';
import { snapshotRules } from '#lib/server/rules.js';
import { parseName } from '#lib/server/validation.js';

const GENERATION_ATTEMPTS = 2;
const MAX_NOTE_LENGTH = 1000;
const MAX_REASON_LENGTH = 300;
const DEFAULT_NAME = 'Generated';

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
		value: [...reasons]
			.sort(([a], [b]) => a - b)
			.map(([barIndex, reason]) => ({ barIndex, reason }))
	};
}

function readGenerated(raw: unknown, source: Chart): Result<Generated> {
	if (typeof raw === 'string') return { error: raw };
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
		value: { chart, reasons: reasons.value.filter(({ barIndex }) => changed.has(barIndex)) }
	};
}

async function parseRequest(request: Request, deps: Deps): Promise<Result<GenerationInput>> {
	const body = await readBody(request);
	if ('error' in body) return body;

	const note = typeof body.value.note === 'string' ? body.value.note.trim() : '';
	if (note.length > MAX_NOTE_LENGTH) return { error: 'Note is too long.' };

	const ruleIds = body.value.ruleIds ?? [];
	if (!Array.isArray(ruleIds) || ruleIds.some((id) => typeof id !== 'string')) {
		return { error: 'ruleIds must be a list of Rule ids.' };
	}
	const uniqueIds = [...new Set(ruleIds as string[])];
	if (uniqueIds.length === 0 && !note) return { error: 'Pick at least one Rule or add a note.' };

	const snapshot = await snapshotRules(deps, uniqueIds);
	if ('error' in snapshot) return snapshot;

	const hasName = typeof body.value.name === 'string' && body.value.name.trim() !== '';
	const name = hasName ? parseName(body.value.name) : { value: DEFAULT_NAME };
	if ('error' in name) return name;

	return { value: { rules: snapshot.value, note: note || null, name: name.value } };
}

export async function generateSimplifiedChart(
	request: Request,
	deps: Deps,
	tuneId: string
): Promise<Response> {
	const parsed = await parseRequest(request, deps);
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
