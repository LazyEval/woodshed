import { and, eq } from 'drizzle-orm';
import { isRecord, sameBarGrid, validateChart, type Chart } from '#lib/chart.js';
import type { Result } from '#lib/result.js';
import type { Deps } from '#lib/server/deps.js';
import { simplifiedCharts, tunes } from '#lib/server/db/schema.js';
import { jsonError, readBody, tuneNotFound } from '#lib/server/http.js';

const MAX_NAME_LENGTH = 100;

const chartNotFound = () => jsonError('Simplified Chart not found.', 404);

function parseName(value: unknown): Result<string> {
	if (typeof value !== 'string' || !value.trim()) return { error: 'Name is required.' };
	if (value.trim().length > MAX_NAME_LENGTH) return { error: 'Name is too long.' };
	return { value: value.trim() };
}

function withoutKeyCenters({ sections }: Chart): Chart {
	return { sections };
}

export function listSimplifiedCharts(deps: Deps, tuneId: string) {
	return deps.db
		.select()
		.from(simplifiedCharts)
		.where(eq(simplifiedCharts.tuneId, tuneId))
		.orderBy(simplifiedCharts.createdAt, simplifiedCharts.id);
}

export async function createSimplifiedChart(
	request: Request,
	deps: Deps,
	tuneId: string
): Promise<Response> {
	const body = await readBody(request);
	if ('error' in body) return jsonError(body.error, 400);
	const name = parseName(body.value.name);
	if ('error' in name) return jsonError(name.error, 400);

	const tune = await deps.db.query.tunes.findFirst({ where: eq(tunes.id, tuneId) });
	if (!tune) return tuneNotFound();
	if (tune.sourceChartStatus !== 'verified') {
		return jsonError('Source Chart must be Verified before creating a Simplified Chart.', 409);
	}

	const now = deps.clock.now().getTime();
	const [created] = await deps.db
		.insert(simplifiedCharts)
		.values({
			id: crypto.randomUUID(),
			tuneId,
			name: name.value,
			origin: 'manual',
			chart: withoutKeyCenters(tune.sourceChart),
			createdAt: now,
			updatedAt: now
		})
		.returning();
	return Response.json(created, { status: 201 });
}

export async function updateSimplifiedChart(
	request: Request,
	deps: Deps,
	tuneId: string,
	chartId: string
): Promise<Response> {
	const body = await readBody(request);
	if ('error' in body) return jsonError(body.error, 400);

	const changes: Partial<typeof simplifiedCharts.$inferInsert> = {};
	if (body.value.name !== undefined) {
		const name = parseName(body.value.name);
		if ('error' in name) return jsonError(name.error, 400);
		changes.name = name.value;
	}

	const [existing, tune] = await Promise.all([
		deps.db.query.simplifiedCharts.findFirst({
			where: and(eq(simplifiedCharts.id, chartId), eq(simplifiedCharts.tuneId, tuneId))
		}),
		deps.db.query.tunes.findFirst({ where: eq(tunes.id, tuneId) })
	]);
	if (!existing || !tune) return chartNotFound();

	if (body.value.chart !== undefined) {
		const validated = validateChart(
			isRecord(body.value.chart) ? { sections: body.value.chart.sections } : body.value.chart
		);
		if ('error' in validated) return jsonError(validated.error, 400);
		if (!sameBarGrid(tune.sourceChart, validated.value)) {
			return jsonError(
				'A Simplified Chart shares the Source Chart bar grid; only chords can change.',
				400
			);
		}
		changes.chart = withoutKeyCenters(validated.value);
	}

	const [saved] = await deps.db
		.update(simplifiedCharts)
		.set({ ...changes, updatedAt: deps.clock.now().getTime() })
		.where(eq(simplifiedCharts.id, chartId))
		.returning();
	return Response.json(saved);
}

export async function deleteSimplifiedChart(
	deps: Deps,
	tuneId: string,
	chartId: string
): Promise<Response> {
	const deleted = await deps.db
		.delete(simplifiedCharts)
		.where(and(eq(simplifiedCharts.id, chartId), eq(simplifiedCharts.tuneId, tuneId)))
		.returning({ id: simplifiedCharts.id });
	return deleted.length ? new Response(null, { status: 204 }) : chartNotFound();
}
