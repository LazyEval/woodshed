import { shelveTune } from '#lib/server/rotation.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params, locals }) => shelveTune(locals.deps, params.id);
