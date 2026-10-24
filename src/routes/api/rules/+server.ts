import { createRule, listRules } from '#lib/server/rules.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => listRules(locals.deps);
export const POST: RequestHandler = ({ request, locals }) => createRule(request, locals.deps);
