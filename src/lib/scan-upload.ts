import { resizeToJpeg } from '#lib/image.js';

interface UploadBody {
	id?: string;
	error?: string;
	simplifiedCharts?: string[];
}

export async function uploadScan(
	url: string,
	pages: File[],
	fields: Record<string, string>
): Promise<{ ok: boolean; body: UploadBody | null }> {
	const form = new FormData();
	for (const [i, file] of pages.entries()) {
		form.append('pages', await resizeToJpeg(file), `page-${i + 1}.jpg`);
	}
	for (const [name, value] of Object.entries(fields)) form.append(name, value);
	const response = await fetch(url, { method: 'POST', body: form });
	const text = await response.text();
	return { ok: response.ok, body: text ? (JSON.parse(text) as UploadBody) : null };
}
