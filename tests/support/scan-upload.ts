import { env } from 'cloudflare:workers';

export function page(content: string, type = 'image/jpeg'): File {
	return new File([content], 'page', { type });
}

export function uploadRequest(
	pages: File[],
	fields: Record<string, string> = {},
	path = '/import'
): Request {
	const form = new FormData();
	for (const file of pages) form.append('pages', file);
	for (const [name, value] of Object.entries(fields)) form.append(name, value);
	return new Request(`https://woodshed.test/api/tunes${path}`, { method: 'POST', body: form });
}

export async function rowCount(table: string): Promise<number> {
	const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
	return row?.n ?? 0;
}
