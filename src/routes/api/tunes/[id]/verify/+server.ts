import { markChartVerified } from '#lib/server/tunes.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params, locals }) =>
	markChartVerified(locals.deps, params.id);
