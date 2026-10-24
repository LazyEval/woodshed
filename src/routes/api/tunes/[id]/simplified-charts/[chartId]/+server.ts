import { deleteSimplifiedChart, updateSimplifiedChart } from '#lib/server/simplified-charts.js';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, params, locals }) =>
	updateSimplifiedChart(request, locals.deps, params.id, params.chartId);
export const DELETE: RequestHandler = ({ params, locals }) =>
	deleteSimplifiedChart(locals.deps, params.id, params.chartId);
