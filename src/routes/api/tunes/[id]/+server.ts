import { deleteTune, getTune, updateTune } from '#lib/server/tunes.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals }) => getTune(locals.deps, params.id);
export const PATCH: RequestHandler = ({ request, params, locals }) =>
	updateTune(request, locals.deps, params.id);
export const DELETE: RequestHandler = ({ params, locals }) => deleteTune(locals.deps, params.id);
