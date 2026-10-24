import { generateSimplifiedChart } from '#lib/server/generation.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, params, locals }) =>
	generateSimplifiedChart(request, locals.deps, params.id);
