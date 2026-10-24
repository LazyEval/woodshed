import { reextractChart } from '#lib/server/scans.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals, params }) =>
	reextractChart(request, locals.deps, params.id);
