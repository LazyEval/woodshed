import { exportArchive, importArchive } from '#lib/server/archive.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => exportArchive(locals.deps);
export const PUT: RequestHandler = ({ request, locals }) => importArchive(request, locals.deps);
