import { importTune } from '#lib/server/scans.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => importTune(request, locals.deps);
