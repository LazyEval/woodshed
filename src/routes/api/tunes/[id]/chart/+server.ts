import { saveSourceChart } from '#lib/server/tunes.js';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, params, locals }) =>
	saveSourceChart(request, locals.deps, params.id);
