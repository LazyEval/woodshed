import { reopenSourceChart } from '#lib/server/tunes.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params, locals }) =>
	reopenSourceChart(locals.deps, params.id);
