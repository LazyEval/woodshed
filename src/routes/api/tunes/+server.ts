import { createTune, listTunes } from '#lib/server/tunes.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request, locals }) => listTunes(request, locals.deps);
export const POST: RequestHandler = ({ request, locals }) => createTune(request, locals.deps);
