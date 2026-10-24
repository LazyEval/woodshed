import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { SourceChartStatus } from '#lib/chart.js';
import { emptyChart, isValidKey, validateChart } from '#lib/chart.js';
import type { Result } from '#lib/result.js';
import type { Deps } from '#lib/server/deps.js';
import { tunes } from '#lib/server/db/schema.js';
import { jsonError, readBody, tuneNotFound } from '#lib/server/http.js';
import { tuneDetail } from '#lib/server/rotation.js';

const MAX_TEXT_LENGTH = 200;

interface TuneFields {
	title: string;
	composer: string | null;
	key: string | null;
}

function optionalText(value: unknown, name: string): Result<string | null> {
	if (value === undefined || value === null) return { value: null };
	if (typeof value !== 'string') return { error: `${name} must be text.` };
	const trimmed = value.trim();
	if (trimmed.length > MAX_TEXT_LENGTH) return { error: `${name} is too long.` };
	return { value: trimmed || null };
}

function parseFields(body: Record<string, unknown>): Result<TuneFields> {
	if (typeof body.title !== 'string' || !body.title.trim()) return { error: 'Title is required.' };
	if (body.title.trim().length > MAX_TEXT_LENGTH) return { error: 'Title is too long.' };

	const composer = optionalText(body.composer, 'Composer');
	if ('error' in composer) return composer;

	const key = optionalText(body.key, 'Key');
	if ('error' in key) return key;
	if (key.value !== null && !isValidKey(key.value)) {
		return { error: `Invalid key "${key.value}". Use a root and optional "m", e.g. Bb or F#m.` };
	}

	return { value: { title: body.title.trim(), composer: composer.value, key: key.value } };
}

const VERIFIED_LOCKED = 'Source Chart is Verified and cannot be edited. Reopen it first.';

function findTune(deps: Deps, id: string) {
	return deps.db.query.tunes.findFirst({ where: eq(tunes.id, id) });
}

export async function listTunes(request: Request, deps: Deps): Promise<Response> {
	const query = new URL(request.url).searchParams.get('q')?.trim();
	const pattern = query ? `%${query.replace(/[\\%_]/g, '\\$&')}%` : null;

	const rows = await deps.db
		.select({
			id: tunes.id,
			title: tunes.title,
			composer: tunes.composer,
			key: tunes.key,
			sourceChartStatus: tunes.sourceChartStatus,
			shelved: tunes.shelved
		})
		.from(tunes)
		.where(pattern ? sql`${tunes.title} LIKE ${pattern} ESCAPE '\\'` : undefined)
		.orderBy(asc(sql`lower(${tunes.title})`));
	return Response.json(rows);
}

export async function createTune(request: Request, deps: Deps): Promise<Response> {
	const body = await readBody(request);
	if ('error' in body) return jsonError(body.error, 400);
	const fields = parseFields(body.value);
	if ('error' in fields) return jsonError(fields.error, 400);

	const now = deps.clock.now().getTime();
	const [tune] = await deps.db
		.insert(tunes)
		.values({
			id: crypto.randomUUID(),
			...fields.value,
			sourceChart: emptyChart(),
			createdAt: now,
			updatedAt: now
		})
		.returning();
	return Response.json(tune, { status: 201 });
}

export async function getTune(deps: Deps, id: string): Promise<Response> {
	const tune = await findTune(deps, id);
	return tune ? Response.json(await tuneDetail(deps, tune)) : tuneNotFound();
}

export async function updateTune(request: Request, deps: Deps, id: string): Promise<Response> {
	const body = await readBody(request);
	if ('error' in body) return jsonError(body.error, 400);
	const existing = await findTune(deps, id);
	if (!existing) return tuneNotFound();

	const fields = parseFields({ ...existing, ...body.value });
	if ('error' in fields) return jsonError(fields.error, 400);

	const [tune] = await deps.db
		.update(tunes)
		.set({ ...fields.value, updatedAt: deps.clock.now().getTime() })
		.where(eq(tunes.id, id))
		.returning();
	return Response.json(tune);
}

export async function saveSourceChart(request: Request, deps: Deps, id: string): Promise<Response> {
	const body = await readBody(request);
	if ('error' in body) return jsonError(body.error, 400);
	const tune = await findTune(deps, id);
	if (!tune) return tuneNotFound();
	if (tune.sourceChartStatus === 'verified') {
		return jsonError(VERIFIED_LOCKED, 409);
	}

	const validated = validateChart(body.value.chart);
	if ('error' in validated) return jsonError(validated.error, 400);

	const [saved] = await deps.db
		.update(tunes)
		.set({ sourceChart: validated.value, updatedAt: deps.clock.now().getTime() })
		.where(and(eq(tunes.id, id), eq(tunes.sourceChartStatus, 'draft')))
		.returning();
	return saved ? Response.json(saved) : jsonError(VERIFIED_LOCKED, 409);
}

async function setChartStatus(
	deps: Deps,
	id: string,
	status: SourceChartStatus
): Promise<Response> {
	const now = deps.clock.now().getTime();
	const [changed] = await deps.db
		.update(tunes)
		.set({
			sourceChartStatus: status,
			updatedAt: now,
			...(status === 'verified' && { verifiedAt: sql`coalesce(${tunes.verifiedAt}, ${now})` })
		})
		.where(and(eq(tunes.id, id), ne(tunes.sourceChartStatus, status)))
		.returning();
	if (changed) return Response.json(changed);

	const unchanged = await findTune(deps, id);
	return unchanged ? Response.json(unchanged) : tuneNotFound();
}

export const markChartVerified = (deps: Deps, id: string) => setChartStatus(deps, id, 'verified');

export const reopenSourceChart = (deps: Deps, id: string) => setChartStatus(deps, id, 'draft');

export async function deleteTune(deps: Deps, id: string): Promise<Response> {
	const deleted = await deps.db.delete(tunes).where(eq(tunes.id, id)).returning({ id: tunes.id });
	return deleted.length ? new Response(null, { status: 204 }) : tuneNotFound();
}
