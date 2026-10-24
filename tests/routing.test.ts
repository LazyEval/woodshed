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
});
