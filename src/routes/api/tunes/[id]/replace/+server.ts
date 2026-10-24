import { replaceSourceChart } from '#lib/server/scans.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals, params }) =>
	replaceSourceChart(request, locals.deps, params.id);
