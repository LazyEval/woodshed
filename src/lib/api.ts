export async function sendJson<T = { error: string }>(
	path: string,
	method: string,
	body?: unknown
): Promise<{ ok: boolean; body: T }> {
	const response = await fetch(path, {
		method,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await response.text();
	return { ok: response.ok, body: (text ? JSON.parse(text) : null) as T };
}
