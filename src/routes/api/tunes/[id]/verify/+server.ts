import { readOptionalBody } from '#lib/server/http.js';
import { markChartVerified } from '#lib/server/tunes.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params, locals }) =>
	markChartVerified(locals.deps, params.id, await readOptionalBody(request));
