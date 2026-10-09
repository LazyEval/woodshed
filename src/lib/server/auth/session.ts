import { eq, lte } from 'drizzle-orm';
import type { Deps } from '../deps';
import { sessions } from '../db/schema';
import { hmacSha256, randomToken, sha256Hex, timingSafeEqual, toBase64Url } from './crypto';

export const COOKIE_NAME = '__Host-session';
export const SESSION_TTL_SECONDS = 180 * 24 * 60 * 60;

async function sign(sessionKey: string, token: string): Promise<string> {
	return toBase64Url(await hmacSha256(sessionKey, token));
}

export async function createSession(deps: Deps): Promise<string> {
	const now = deps.clock.now().getTime();
	const token = randomToken();
	await deps.db.delete(sessions).where(lte(sessions.expiresAt, now));
	await deps.db.insert(sessions).values({
		tokenHash: await sha256Hex(token),
		expiresAt: now + SESSION_TTL_SECONDS * 1000
	});
	return `${token}.${await sign(deps.sessionKey, token)}`;
}

async function verifiedToken(deps: Deps, cookieValue: string): Promise<string | null> {
	const [token, signature, ...rest] = cookieValue.split('.');
	if (!token || !signature || rest.length > 0) return null;
	const encoder = new TextEncoder();
	const expected = encoder.encode(await sign(deps.sessionKey, token));
	return timingSafeEqual(expected, encoder.encode(signature)) ? token : null;
}

export async function isValidSession(deps: Deps, cookieValue: string): Promise<boolean> {
	const token = await verifiedToken(deps, cookieValue);
	if (!token) return false;
	const row = await deps.db.query.sessions.findFirst({
		where: eq(sessions.tokenHash, await sha256Hex(token))
	});
	return row !== undefined && row.expiresAt > deps.clock.now().getTime();
}

export async function destroySession(deps: Deps, cookieValue: string): Promise<void> {
	const token = await verifiedToken(deps, cookieValue);
	if (!token) return;
	await deps.db.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(token)));
}

export function readSessionCookie(request: Request): string | null {
	const header = request.headers.get('cookie');
	if (!header) return null;
	for (const part of header.split(';')) {
		const separator = part.indexOf('=');
		if (separator !== -1 && part.slice(0, separator).trim() === COOKIE_NAME) {
			return part.slice(separator + 1).trim();
		}
	}
	return null;
}

const COOKIE_ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Lax';

export function sessionCookie(value: string): string {
	return `${COOKIE_NAME}=${value}; ${COOKIE_ATTRIBUTES}; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedSessionCookie(): string {
	return `${COOKIE_NAME}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
}
