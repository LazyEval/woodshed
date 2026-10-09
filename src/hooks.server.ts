import { env } from 'cloudflare:workers';
import type { Handle } from '@sveltejs/kit/hooks';
import { guard } from '#lib/server/auth.js';
import { createDeps } from '#lib/server/deps.js';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.deps = createDeps(env);
	const rejection = await guard(event.request, event.locals.deps);
	if (rejection) return rejection;
	return resolve(event);
};
