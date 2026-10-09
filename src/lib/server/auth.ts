import type { Deps } from './deps';
import { secretsMatch } from './auth/crypto';
import { clearFailures, isRateLimited, recordFailure } from './auth/rate-limit';
import {
	clearedSessionCookie,
	createSession,
	destroySession,
	isValidSession,
	readSessionCookie,
	sessionCookie
} from './auth/session';

const PUBLIC_PATHS = new Set(['/login']);

function redirect(location: string, setCookie?: string): Response {
	const headers = new Headers({ location });
	if (setCookie) headers.set('set-cookie', setCookie);
	return new Response(null, { status: 303, headers });
}

function clientId(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

export async function login(request: Request, deps: Deps): Promise<Response> {
	const client = clientId(request);
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
