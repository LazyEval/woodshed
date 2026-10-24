import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { APP_PASSWORD } from './support/app';

const browserHeaders = {
	accept: 'text/html,application/xhtml+xml',
	'content-type': 'application/x-www-form-urlencoded',
	origin: 'https://woodshed.test',
	'cf-connecting-ip': '203.0.113.50'
};

describe('routing through the built worker', () => {
	it('delivers a browser-style login form POST to the login handler', async () => {
		const response = await SELF.fetch('https://woodshed.test/login/submit', {
			method: 'POST',
			headers: browserHeaders,
			body: new URLSearchParams({ password: APP_PASSWORD }),
			redirect: 'manual'
		});

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/');
		expect(response.headers.get('set-cookie')).toContain('HttpOnly');
	});

	it('redirects an unauthenticated page request to the login page', async () => {
		const response = await SELF.fetch('https://woodshed.test/', {
			headers: { accept: 'text/html' },
			redirect: 'manual'
		});

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/login');
	});

	it('routes the tune API through the guard to the handlers', async () => {
		const login = await SELF.fetch('https://woodshed.test/login/submit', {
			method: 'POST',
			headers: browserHeaders,
			body: new URLSearchParams({ password: APP_PASSWORD }),
			redirect: 'manual'
		});
		const cookie = login.headers.get('set-cookie')!.split(';')[0];

		const created = await SELF.fetch('https://woodshed.test/api/tunes', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json', origin: 'https://woodshed.test' },
			body: JSON.stringify({ title: 'Routing Blues' })
		});
		const { id } = (await created.json()) as { id: string };
		const page = await SELF.fetch(`https://woodshed.test/tunes/${id}`, {
			headers: { cookie, accept: 'text/html' }
		});

		expect(created.status).toBe(201);
		expect(page.status).toBe(200);
		expect(await page.text()).toContain('Routing Blues');
	});

	it('routes Practice Sessions and the Due list through the guard to the handlers', async () => {
		const login = await SELF.fetch('https://woodshed.test/login/submit', {
			method: 'POST',
			headers: browserHeaders,
			body: new URLSearchParams({ password: APP_PASSWORD }),
			redirect: 'manual'
		});
		const cookie = login.headers.get('set-cookie')!.split(';')[0];
		const api = { cookie, 'content-type': 'application/json', origin: 'https://woodshed.test' };
		const created = await SELF.fetch('https://woodshed.test/api/tunes', {
			method: 'POST',
			headers: api,
			body: JSON.stringify({ title: 'Rotation Waltz' })
		});
		const { id } = (await created.json()) as { id: string };
		await SELF.fetch(`https://woodshed.test/api/tunes/${id}/verify`, {
			method: 'POST',
			headers: api
		});

		const home = await SELF.fetch('https://woodshed.test/', {
			headers: { cookie, accept: 'text/html' }
		});
		const logged = await SELF.fetch(`https://woodshed.test/api/tunes/${id}/sessions`, {
			method: 'POST',
			headers: api,
			body: JSON.stringify({ rating: 'solid' })
		});

		expect(await home.text()).toContain('Rotation Waltz');
		expect(logged.status).toBe(201);
	});

	it('routes a multipart Scan import to the import handler', async () => {
		const login = await SELF.fetch('https://woodshed.test/login/submit', {
			method: 'POST',
			headers: browserHeaders,
			body: new URLSearchParams({ password: APP_PASSWORD }),
			redirect: 'manual'
		});
		const cookie = login.headers.get('set-cookie')!.split(';')[0];
		const form = new FormData();
		form.append('pages', new File(['scan'], 'page-1.jpg', { type: 'image/jpeg' }));
		form.append('mode', 'manual');
		form.append('title', 'Scanned Blues');

		const imported = await SELF.fetch('https://woodshed.test/api/tunes/import', {
			method: 'POST',
			headers: { cookie, origin: 'https://woodshed.test' },
			body: form
		});
		const { id } = (await imported.json()) as { id: string };
		const scan = await SELF.fetch(`https://woodshed.test/api/tunes/${id}/scan/0`, {
			headers: { cookie }
		});

		expect(imported.status).toBe(201);
		expect(scan.status).toBe(200);
		expect(scan.headers.get('content-type')).toBe('image/jpeg');
	});

	it('routes the archive export and import through the guard to the handlers', async () => {
		const login = await SELF.fetch('https://woodshed.test/login/submit', {
			method: 'POST',
			headers: browserHeaders,
			body: new URLSearchParams({ password: APP_PASSWORD }),
			redirect: 'manual'
		});
		const cookie = login.headers.get('set-cookie')!.split(';')[0];
		const headers = { cookie, origin: 'https://woodshed.test' };

		const unauthenticated = await SELF.fetch('https://woodshed.test/api/archive', {
			redirect: 'manual'
		});
		const exported = await SELF.fetch('https://woodshed.test/api/archive', { headers });
		const unconfirmed = await SELF.fetch('https://woodshed.test/api/archive', {
			method: 'PUT',
			headers,
			body: await exported.arrayBuffer()
		});

		expect(unauthenticated.status).toBe(303);
		expect(exported.headers.get('content-type')).toBe('application/zip');
		expect(unconfirmed.status).toBe(409);
	});
});
