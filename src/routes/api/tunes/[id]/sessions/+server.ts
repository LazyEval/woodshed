import { listPracticeSessions, logPracticeSession } from '#lib/server/rotation.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals }) =>
	listPracticeSessions(locals.deps, params.id);
export const POST: RequestHandler = ({ request, params, locals }) =>
	logPracticeSession(request, locals.deps, params.id);
