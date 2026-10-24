import { deleteRule, updateRule } from '#lib/server/rules.js';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = ({ request, params, locals }) =>
	updateRule(request, locals.deps, params.id);
export const DELETE: RequestHandler = ({ params, locals }) => deleteRule(locals.deps, params.id);
