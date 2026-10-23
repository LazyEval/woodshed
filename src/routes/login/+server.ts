import { login } from '#lib/server/auth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => login(request, locals.deps);
