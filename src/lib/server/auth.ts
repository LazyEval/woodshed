import type { Deps } from '#lib/server/deps.js';
import { secretsMatch } from '#lib/server/auth/crypto.js';
import { clearFailures, isRateLimited, recordFailure } from '#lib/server/auth/rate-limit.js';
import {
	clearedSessionCookie,
	createSession,
	destroySession,
	isValidSession,
	readSessionCookie,
	sessionCookie
} from '#lib/server/auth/session.js';

const PUBLIC_PATHS = new Set(['/login', '/login/submit']);

function redirect(location: string, setCookie?: string): Response {
	const headers = new Headers({ location });
	if (setCookie) headers.set('set-cookie', setCookie);
	return new Response(null, { status: 303, headers });
}

function rateLimitKey(request: Request): string {
	const ip = request.headers.get('cf-connecting-ip');
	return ip ? `ip:${ip}` : 'no-ip';
}

export async function login(request: Request, deps: Deps): Promise<Response> {
	const client = rateLimitKey(request);
	const now = deps.clock.now();

	if (await isRateLimited(deps.db, client, now)) {
		return redirect('/login?error=rate-limited');
	}

	const form = await request.formData();
	const password = form.get('password');
	const correct =
		typeof password === 'string' &&
		(await secretsMatch(deps.sessionKey, password, deps.appPassword));

	if (!correct) {
		await recordFailure(deps.db, client, now);
		return redirect('/login?error=invalid');
	}

	await clearFailures(deps.db, client);
	return redirect('/', sessionCookie(await createSession(deps)));
}

export async function logout(request: Request, deps: Deps): Promise<Response> {
	const cookie = readSessionCookie(request);
	if (cookie) await destroySession(deps, cookie);
	return redirect('/login', clearedSessionCookie());
}

export async function guard(request: Request, deps: Deps): Promise<Response | null> {
	if (PUBLIC_PATHS.has(new URL(request.url).pathname)) return null;

	const cookie = readSessionCookie(request);
	if (cookie && (await isValidSession(deps, cookie))) return null;

	if (request.method === 'GET' || request.method === 'HEAD') return redirect('/login');
	return new Response('Unauthorized', { status: 401 });
}
