import { env } from 'cloudflare:workers';
import { createDeps, type Deps } from '#lib/server/deps.js';
import { fakeClock, type FakeClock } from './fake-clock';
import { FakeAiClient } from './fake-ai';

export interface TestApp {
	deps: Deps;
	clock: FakeClock;
	ai: FakeAiClient;
}

export function createTestApp(overrides: Partial<Deps> = {}): TestApp {
	const clock = fakeClock();
	const ai = new FakeAiClient();
	return { deps: createDeps(env, { clock, ai, timeZone: 'UTC', ...overrides }), clock, ai };
}

export const APP_PASSWORD = env.APP_PASSWORD;

export function loginRequest(password: string, ip: string | null = '203.0.113.7'): Request {
	const headers = new Headers({ 'content-type': 'application/x-www-form-urlencoded' });
	if (ip) headers.set('cf-connecting-ip', ip);
	return new Request('https://woodshed.test/login/submit', {
		method: 'POST',
		headers,
		body: new URLSearchParams({ password })
	});
}

export function requestWithCookie(
	path: string,
	cookie: string | null,
	init: RequestInit = {}
): Request {
	const headers = new Headers(init.headers);
	if (cookie) headers.set('cookie', cookie);
	return new Request(`https://woodshed.test${path}`, { ...init, headers });
}

export function sessionCookieFrom(response: Response): string {
	const setCookie = response.headers.get('set-cookie');
	if (!setCookie) throw new Error('response has no Set-Cookie');
	return setCookie.split(';')[0];
}

export function jsonRequest(path: string, method: string, body?: unknown): Request {
	return new Request(`https://woodshed.test${path}`, {
		method,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
}
