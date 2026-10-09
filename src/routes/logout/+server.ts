import { logout } from '#lib/server/auth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, locals }) => logout(request, locals.deps);
