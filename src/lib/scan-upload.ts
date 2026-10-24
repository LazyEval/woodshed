import { resizeToJpeg } from '#lib/image.js';

export type UploadResult =
	| { ok: true; body: { id: string } }
	| { ok: false; body: { error?: string; simplifiedCharts?: string[] } | null };

export async function uploadScan(
	url: string,
	pages: File[],
	fields: Record<string, string>
): Promise<UploadResult> {
	const form = new FormData();
	for (const [i, file] of pages.entries()) {
		form.append('pages', await resizeToJpeg(file), `page-${i + 1}.jpg`);
	}
	for (const [name, value] of Object.entries(fields)) form.append(name, value);
	const response = await fetch(url, { method: 'POST', body: form });
	const text = await response.text();
	const body = text ? JSON.parse(text) : null;
	return response.ok ? { ok: true, body } : { ok: false, body };
}
