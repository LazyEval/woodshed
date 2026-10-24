import { jsonError } from '#lib/server/http.js';
import { clearBarFlag } from '#lib/server/simplified-charts.js';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ params, locals }) => {
	const bar = Number(params.bar);
	if (!Number.isInteger(bar) || bar < 0) return jsonError('Bar must be a whole number.', 400);
	return clearBarFlag(locals.deps, params.id, params.chartId, bar);
};
