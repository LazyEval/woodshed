import { isRecord } from '#lib/chart.js';
import type { Result } from '#lib/result.js';

export function jsonError(error: string, status: number): Response {
	return Response.json({ error }, { status });
}

export const tuneNotFound = () => jsonError('Tune not found.', 404);

async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}

export async function readBody(request: Request): Promise<Result<Record<string, unknown>>> {
	const body = await readJson(request);
	return isRecord(body) ? { value: body } : { error: 'Request body must be a JSON object.' };
}

export async function readOptionalBody(request: Request): Promise<Record<string, unknown>> {
	const body = await readJson(request);
	return isRecord(body) ? body : {};
}
