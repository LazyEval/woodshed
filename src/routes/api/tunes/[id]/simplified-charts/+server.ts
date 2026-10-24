import { createSimplifiedChart } from '#lib/server/simplified-charts.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, params, locals }) =>
	createSimplifiedChart(request, locals.deps, params.id);
