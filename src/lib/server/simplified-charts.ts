import { and, eq } from 'drizzle-orm';
import { isRecord, sameBarGrid, validateChart } from '#lib/chart.js';
import { isArchived } from '#lib/tune.js';
import type { Deps } from '#lib/server/deps.js';
import { simplifiedCharts, tunes } from '#lib/server/db/schema.js';
import { jsonError, readBody, tuneNotFound } from '#lib/server/http.js';
import { parseName } from '#lib/server/validation.js';

const chartNotFound = () => jsonError('Simplified Chart not found.', 404);
const archivedReadOnly = () => jsonError('Archived Simplified Charts are read-only.', 409);

export function listSimplifiedCharts(deps: Deps, tuneId: string) {
	return deps.db
		.select()
		.from(simplifiedCharts)
		.where(eq(simplifiedCharts.tuneId, tuneId))
		.orderBy(simplifiedCharts.createdAt, simplifiedCharts.id);
}

type SimplifiedChartRow = typeof simplifiedCharts.$inferSelect;

export async function listLiveSimplifiedCharts(deps: Deps, tuneId: string) {
	return (await listSimplifiedCharts(deps, tuneId)).filter((chart) => !isArchived(chart));
}

export function flagBars(deps: Deps, chart: SimplifiedChartRow, bars: number[]) {
	return deps.db
		.update(simplifiedCharts)
		.set({ flaggedBars: [...new Set([...chart.flaggedBars, ...bars])].sort((a, b) => a - b) })
		.where(eq(simplifiedCharts.id, chart.id));
}

export function archive(deps: Deps, chart: SimplifiedChartRow, archivedAt: number) {
	return deps.db
		.update(simplifiedCharts)
		.set({ archivedAt })
		.where(eq(simplifiedCharts.id, chart.id));
}

function findOwned(deps: Deps, tuneId: string, chartId: string) {
	return deps.db.query.simplifiedCharts.findFirst({
		where: and(eq(simplifiedCharts.id, chartId), eq(simplifiedCharts.tuneId, tuneId))
	});
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
			chart: tune.sourceChart,
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
	if (body.value.name === undefined && body.value.chart === undefined) {
		return jsonError('Nothing to update: send a name or a chart.', 400);
	}

	const changes: Partial<typeof simplifiedCharts.$inferInsert> = {};
	if (body.value.name !== undefined) {
		const name = parseName(body.value.name);
		if ('error' in name) return jsonError(name.error, 400);
		changes.name = name.value;
	}

	const [existing, tune] = await Promise.all([
		findOwned(deps, tuneId, chartId),
		deps.db.query.tunes.findFirst({ where: eq(tunes.id, tuneId) })
	]);
	if (!tune) return tuneNotFound();
	if (!existing) return chartNotFound();
	if (isArchived(existing)) return archivedReadOnly();

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
		changes.chart = {
			...validated.value,
			...(existing.chart.keyCenters && { keyCenters: existing.chart.keyCenters })
		};
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

export async function clearBarFlag(
	deps: Deps,
	tuneId: string,
	chartId: string,
	bar: number
): Promise<Response> {
	const existing = await findOwned(deps, tuneId, chartId);
	if (!existing) return chartNotFound();
	if (isArchived(existing)) return archivedReadOnly();

	const [saved] = await deps.db
		.update(simplifiedCharts)
		.set({ flaggedBars: existing.flaggedBars.filter((flagged) => flagged !== bar) })
		.where(eq(simplifiedCharts.id, chartId))
		.returning();
	return Response.json(saved);
}
