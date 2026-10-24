import { listDueTunes } from '#lib/server/rotation.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => listDueTunes(locals.deps);
