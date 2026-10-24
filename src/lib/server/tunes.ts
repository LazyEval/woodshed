import { and, asc, eq, sql } from 'drizzle-orm';
import { emptyChart, isValidKey, validateChart } from '#lib/chart.js';
import type { Deps } from '#lib/server/deps.js';
import { tunes } from '#lib/server/db/schema.js';

const MAX_TEXT_LENGTH = 200;

interface TuneFields {
	title: string;
	composer: string | null;
	key: string | null;
}

type Parsed<T> = { value: T } | { error: string };

function jsonError(error: string, status: number): Response {
	return Response.json({ error }, { status });
}

const notFound = () => jsonError('Tune not found.', 404);

async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}

function optionalText(value: unknown, name: string): Parsed<string | null> {
	if (value === undefined || value === null) return { value: null };
	if (typeof value !== 'string') return { error: `${name} must be text.` };
	const trimmed = value.trim();
	if (trimmed.length > MAX_TEXT_LENGTH) return { error: `${name} is too long.` };
	return { value: trimmed || null };
}

function parseFields(body: Record<string, unknown>): Parsed<TuneFields> {
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

function asRecord(body: unknown): Record<string, unknown> | null {
	return typeof body === 'object' && body !== null && !Array.isArray(body)
		? (body as Record<string, unknown>)
		: null;
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
			sourceChartStatus: tunes.sourceChartStatus
		})
		.from(tunes)
		.where(pattern ? sql`${tunes.title} LIKE ${pattern} ESCAPE '\\'` : undefined)
		.orderBy(asc(sql`lower(${tunes.title})`));
	return Response.json(rows);
}

export async function createTune(request: Request, deps: Deps): Promise<Response> {
	const body = asRecord(await readJson(request));
	if (!body) return jsonError('Request body must be a JSON object.', 400);
	const fields = parseFields(body);
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
	const tune = await deps.db.query.tunes.findFirst({ where: eq(tunes.id, id) });
	return tune ? Response.json(tune) : notFound();
}

export async function updateTune(request: Request, deps: Deps, id: string): Promise<Response> {
	const body = asRecord(await readJson(request));
	if (!body) return jsonError('Request body must be a JSON object.', 400);
	const existing = await deps.db.query.tunes.findFirst({ where: eq(tunes.id, id) });
	if (!existing) return notFound();

	const fields = parseFields({ ...existing, ...body });
	if ('error' in fields) return jsonError(fields.error, 400);

	const [tune] = await deps.db
		.update(tunes)
		.set({ ...fields.value, updatedAt: deps.clock.now().getTime() })
		.where(eq(tunes.id, id))
		.returning();
	return Response.json(tune);
}

export async function saveSourceChart(request: Request, deps: Deps, id: string): Promise<Response> {
	const body = asRecord(await readJson(request));
	if (!body) return jsonError('Request body must be a JSON object.', 400);
	const tune = await deps.db.query.tunes.findFirst({ where: eq(tunes.id, id) });
	if (!tune) return notFound();
	if (tune.sourceChartStatus === 'verified') {
		return jsonError('Source Chart is Verified and cannot be edited.', 409);
	}

	const validated = validateChart(body.chart);
	if ('error' in validated) return jsonError(validated.error, 400);

	const [saved] = await deps.db
		.update(tunes)
		.set({ sourceChart: validated.chart, updatedAt: deps.clock.now().getTime() })
		.where(and(eq(tunes.id, id), eq(tunes.sourceChartStatus, 'draft')))
		.returning();
	return saved
		? Response.json(saved)
		: jsonError('Source Chart is Verified and cannot be edited.', 409);
}

export async function markChartVerified(deps: Deps, id: string): Promise<Response> {
	const [tune] = await deps.db
		.update(tunes)
		.set({ sourceChartStatus: 'verified', updatedAt: deps.clock.now().getTime() })
		.where(eq(tunes.id, id))
		.returning();
	return tune ? Response.json(tune) : notFound();
}

export async function deleteTune(deps: Deps, id: string): Promise<Response> {
	const deleted = await deps.db.delete(tunes).where(eq(tunes.id, id)).returning({ id: tunes.id });
	return deleted.length ? new Response(null, { status: 204 }) : notFound();
}
