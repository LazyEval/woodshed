export async function sendJson<T = { error: string }>(
	path: string,
	method: string,
	body?: unknown
): Promise<{ ok: boolean; status: number; body: T }> {
	const raw = body instanceof Blob;
	const response = await fetch(path, {
		method,
		headers: raw || body === undefined ? undefined : { 'content-type': 'application/json' },
		body: raw ? body : body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await response.text();
	return { ok: response.ok, status: response.status, body: (text ? JSON.parse(text) : null) as T };
}
