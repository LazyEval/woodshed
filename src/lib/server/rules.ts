import { desc, eq, inArray } from 'drizzle-orm';
import type { RuleSnapshot } from '#lib/chart.js';
import type { Result } from '#lib/result.js';
import type { Deps } from '#lib/server/deps.js';
import { rules } from '#lib/server/db/schema.js';
import { jsonError, readBody } from '#lib/server/http.js';
import { parseName } from '#lib/server/validation.js';

const MAX_TEXT_LENGTH = 1000;

const ruleNotFound = () => jsonError('Rule not found.', 404);

export function parseRule(body: Record<string, unknown>): Result<{ name: string; text: string }> {
	const name = parseName(body.name);
	if ('error' in name) return name;
	const text = typeof body.text === 'string' ? body.text.trim() : '';
	if (!text) return { error: 'Rule text is required.' };
	if (text.length > MAX_TEXT_LENGTH) return { error: 'Rule text is too long.' };
	return { value: { name: name.value, text } };
}

export async function listRules(deps: Deps): Promise<Response> {
	return Response.json(await deps.db.select().from(rules).orderBy(desc(rules.createdAt), rules.id));
}

export async function createRule(request: Request, deps: Deps): Promise<Response> {
	const body = await readBody(request);
	if ('error' in body) return jsonError(body.error, 400);
	const parsed = parseRule(body.value);
	if ('error' in parsed) return jsonError(parsed.error, 400);

	const now = deps.clock.now().getTime();
	const [created] = await deps.db
		.insert(rules)
		.values({ id: crypto.randomUUID(), ...parsed.value, createdAt: now, updatedAt: now })
		.returning();
	return Response.json(created, { status: 201 });
}

export async function updateRule(request: Request, deps: Deps, id: string): Promise<Response> {
	const body = await readBody(request);
	if ('error' in body) return jsonError(body.error, 400);
	const parsed = parseRule(body.value);
	if ('error' in parsed) return jsonError(parsed.error, 400);

	const [saved] = await deps.db
		.update(rules)
		.set({ ...parsed.value, updatedAt: deps.clock.now().getTime() })
		.where(eq(rules.id, id))
		.returning();
	return saved ? Response.json(saved) : ruleNotFound();
}

export async function deleteRule(deps: Deps, id: string): Promise<Response> {
	const deleted = await deps.db.delete(rules).where(eq(rules.id, id)).returning({ id: rules.id });
	return deleted.length ? new Response(null, { status: 204 }) : ruleNotFound();
}

export async function snapshotRules(deps: Deps, ids: string[]): Promise<Result<RuleSnapshot[]>> {
	if (ids.length === 0) return { value: [] };
	const found = await deps.db.select().from(rules).where(inArray(rules.id, ids));
	const byId = new Map(found.map((rule) => [rule.id, { name: rule.name, text: rule.text }]));
	const snapshots = ids.map((id) => byId.get(id));
	if (snapshots.some((snapshot) => snapshot === undefined)) {
		return { error: 'One or more Rules no longer exist.' };
	}
	return { value: snapshots as RuleSnapshot[] };
}
