import { describe, expect, it } from 'vitest';
import { guard, login, logout } from '#lib/server/auth.js';
import {
	APP_PASSWORD,
	createTestApp,
	loginRequest,
	requestWithCookie,
	sessionCookieFrom
} from './support/app';

const DAY_MS = 24 * 60 * 60 * 1000;

async function loggedInCookie(app = createTestApp()) {
	const response = await login(loginRequest(APP_PASSWORD), app.deps);
	return { app, cookie: sessionCookieFrom(response) };
}

describe('login', () => {
	it('rejects a wrong password without issuing a session', async () => {
		const { deps } = createTestApp();

		const response = await login(loginRequest('wrong'), deps);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/login?error=invalid');
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	it('accepts the correct password and sets a persistent HttpOnly session cookie', async () => {
		const { deps } = createTestApp();

		const response = await login(loginRequest(APP_PASSWORD), deps);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/');
		const setCookie = response.headers.get('set-cookie')!;
		expect(setCookie).toContain('HttpOnly');
		expect(setCookie).toContain('Secure');
		expect(setCookie).toContain('SameSite=Lax');
		const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie)?.[1]);
		expect(maxAge).toBeGreaterThanOrEqual(30 * 24 * 60 * 60);
	});

	it('rate limits repeated failures, even for the correct password', async () => {
		const { deps } = createTestApp();
		for (let i = 0; i < 5; i++) await login(loginRequest('wrong'), deps);

		const response = await login(loginRequest(APP_PASSWORD), deps);

		expect(response.headers.get('location')).toBe('/login?error=rate-limited');
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	it('rate limits per client', async () => {
		const { deps } = createTestApp();
		for (let i = 0; i < 5; i++) await login(loginRequest('wrong', '198.51.100.1'), deps);

		const response = await login(loginRequest(APP_PASSWORD, '198.51.100.2'), deps);

		expect(response.headers.get('location')).toBe('/');
	});

	it('lets a client try again once the rate limit window has passed', async () => {
		const { deps, clock } = createTestApp();
		for (let i = 0; i < 5; i++) await login(loginRequest('wrong'), deps);

		clock.advance(16 * 60 * 1000);
		const response = await login(loginRequest(APP_PASSWORD), deps);

		expect(response.headers.get('location')).toBe('/');
	});
});

describe('guard', () => {
	it('redirects unauthenticated page requests to the login page', async () => {
		const { deps } = createTestApp();

		for (const path of ['/', '/tunes', '/anything/else']) {
			const response = await guard(requestWithCookie(path, null), deps);
			expect(response?.status).toBe(303);
			expect(response?.headers.get('location')).toBe('/login');
		}
	});

	it('rejects unauthenticated non-GET requests with 401', async () => {
		const { deps } = createTestApp();

		const response = await guard(requestWithCookie('/api/tunes', null, { method: 'POST' }), deps);

		expect(response?.status).toBe(401);
	});

	it('leaves the login page open', async () => {
		const { deps } = createTestApp();

		expect(await guard(requestWithCookie('/login', null), deps)).toBeNull();
		expect(
			await guard(requestWithCookie('/login/submit', null, { method: 'POST' }), deps)
		).toBeNull();
	});

	it('lets a logged-in request through', async () => {
		const { app, cookie } = await loggedInCookie();

		expect(await guard(requestWithCookie('/', cookie), app.deps)).toBeNull();
	});

	it('keeps the session alive across a long time away, until it expires', async () => {
		const { app, cookie } = await loggedInCookie();

		app.clock.advance(29 * DAY_MS);
		expect(await guard(requestWithCookie('/', cookie), app.deps)).toBeNull();

		app.clock.advance(400 * DAY_MS);
		expect((await guard(requestWithCookie('/', cookie), app.deps))?.status).toBe(303);
	});

	it('rejects a tampered session cookie', async () => {
		const { app, cookie } = await loggedInCookie();
		const tampered = cookie.slice(0, -2) + (cookie.endsWith('AA') ? 'BB' : 'AA');

		expect((await guard(requestWithCookie('/', tampered), app.deps))?.status).toBe(303);
	});

	it('rejects a cookie signed with a different session key', async () => {
		const { cookie } = await loggedInCookie();
		const other = createTestApp({ sessionKey: 'a-completely-different-key-000000' });

		expect((await guard(requestWithCookie('/', cookie), other.deps))?.status).toBe(303);
	});
});

describe('logout', () => {
	it('ends the session, even if the old cookie is replayed', async () => {
		const { app, cookie } = await loggedInCookie();

		const response = await logout(
			requestWithCookie('/logout', cookie, { method: 'POST' }),
			app.deps
		);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/login');
		expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
		expect((await guard(requestWithCookie('/', cookie), app.deps))?.status).toBe(303);
	});
});
