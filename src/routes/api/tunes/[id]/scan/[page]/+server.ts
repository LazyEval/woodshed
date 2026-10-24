import { getScanPage } from '#lib/server/scans.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params }) =>
	getScanPage(locals.deps, params.id, params.page);
