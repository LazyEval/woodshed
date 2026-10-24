import { deletePracticeSession } from '#lib/server/rotation.js';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ params, locals }) =>
	deletePracticeSession(locals.deps, params.id, params.sessionId);
