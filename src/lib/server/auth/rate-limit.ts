import { eq, sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/index.js';
import { loginFailures } from '#lib/server/db/schema.js';

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;

export async function isRateLimited(db: Db, clientId: string, now: Date): Promise<boolean> {
	const row = await db.query.loginFailures.findFirst({
		where: eq(loginFailures.clientId, clientId)
	});
	if (!row) return false;
	return now.getTime() - row.windowStart < WINDOW_MS && row.count >= MAX_FAILURES;
}

export async function recordFailure(db: Db, clientId: string, now: Date): Promise<void> {
	const nowMs = now.getTime();
	const windowExpired = sql`${loginFailures.windowStart} <= ${nowMs - WINDOW_MS}`;
	await db
		.insert(loginFailures)
		.values({ clientId, count: 1, windowStart: nowMs })
		.onConflictDoUpdate({
			target: loginFailures.clientId,
			set: {
				count: sql`CASE WHEN ${windowExpired} THEN 1 ELSE ${loginFailures.count} + 1 END`,
				windowStart: sql`CASE WHEN ${windowExpired} THEN ${nowMs} ELSE ${loginFailures.windowStart} END`
			}
		});
}

export async function clearFailures(db: Db, clientId: string): Promise<void> {
	await db.delete(loginFailures).where(eq(loginFailures.clientId, clientId));
}
