import { unshelveTune } from '#lib/server/tunes.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params, locals }) => unshelveTune(locals.deps, params.id);
