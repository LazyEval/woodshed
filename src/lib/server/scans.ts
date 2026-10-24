import { and, eq } from 'drizzle-orm';
import { emptyChart, isRecord, isValidKey, validateChart, type Chart } from '#lib/chart.js';
import type { ExtractionModel, ScanImage } from '#lib/server/ai.js';
import type { Deps } from '#lib/server/deps.js';
import { tunes } from '#lib/server/db/schema.js';

export const MAX_SCAN_PAGES = 12;
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_LENGTH = 200;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXTRACTION_ATTEMPTS = 2;
const VERIFIED_LOCKED = 'Source Chart is Verified and cannot be edited. Reopen it first.';

interface Extracted {
	title: string;
	composer: string | null;
	key: string | null;
	chart: Chart;
}

type Extraction = { value: Extracted } | { failure: Response };

function jsonError(error: string, status: number): Response {
	return Response.json({ error }, { status });
}

const scanKey = (tuneId: string, page: number) => `scans/${tuneId}/${page}`;

function parseModel(value: unknown): ExtractionModel | null {
	if (value === undefined || value === null || value === '' || value === 'sonnet') return 'sonnet';
	return value === 'opus' ? 'opus' : null;
}

function cleanText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	return value.trim().slice(0, MAX_TEXT_LENGTH) || null;
}

function readExtracted(raw: unknown): { value: Extracted } | { error: string } {
	if (!isRecord(raw)) return { error: 'Extraction result must be an object.' };
	const chart = validateChart(raw.chart);
	if ('error' in chart) return chart;
	const key = cleanText(raw.key);
	return {
		value: {
			title: cleanText(raw.title) ?? 'Untitled',
			composer: cleanText(raw.composer),
			key: key !== null && isValidKey(key) ? key : null,
			chart: chart.value
		}
	};
}

async function extract(
	deps: Deps,
	images: ScanImage[],
	model: ExtractionModel
): Promise<Extraction> {
	let previousProblem: string | undefined;
	for (let attempt = 0; attempt < EXTRACTION_ATTEMPTS; attempt++) {
		let raw: unknown;
		try {
			raw = await deps.ai.extract({ images, model, previousProblem });
		} catch {
			return { failure: jsonError('Extraction failed. Try again.', 502) };
		}
		const extracted = readExtracted(raw);
		if ('value' in extracted) return extracted;
		previousProblem = extracted.error;
	}
	return {
		failure: jsonError(`Extraction produced an invalid chart: ${previousProblem}`, 422)
	};
}

async function readPages(form: FormData): Promise<ScanImage[] | Response> {
	const files = form.getAll('pages').filter((entry) => typeof entry !== 'string');
	if (files.length === 0) return jsonError('Add at least one page.', 400);
	if (files.length > MAX_SCAN_PAGES) {
		return jsonError(`A Scan has at most ${MAX_SCAN_PAGES} pages.`, 400);
	}
	for (const file of files) {
		if (!IMAGE_TYPES.includes(file.type)) return jsonError('Pages must be JPEG, PNG or WebP.', 400);
		if (file.size > MAX_PAGE_BYTES) return jsonError('A page is too large.', 413);
	}
	return Promise.all(
		files.map(async (file) => ({
			bytes: new Uint8Array(await file.arrayBuffer()),
			mediaType: file.type
		}))
	);
}

async function storePages(deps: Deps, tuneId: string, pages: ScanImage[]): Promise<void> {
	await Promise.all(
		pages.map((page, i) =>
			deps.scans.put(scanKey(tuneId, i), page.bytes, {
				httpMetadata: { contentType: page.mediaType }
			})
		)
	);
}

export async function deleteScanPages(deps: Deps, tuneId: string, count: number): Promise<void> {
	if (count === 0) return;
	await deps.scans.delete(Array.from({ length: count }, (_, i) => scanKey(tuneId, i)));
}

async function loadPages(deps: Deps, tuneId: string, count: number): Promise<ScanImage[]> {
	return Promise.all(
		Array.from({ length: count }, async (_, i) => {
			const object = await deps.scans.get(scanKey(tuneId, i));
			if (!object) throw new Error(`Scan page ${i} is missing`);
			return {
				bytes: new Uint8Array(await object.arrayBuffer()),
				mediaType: object.httpMetadata?.contentType ?? 'image/jpeg'
			};
		})
	);
}

export async function importTune(request: Request, deps: Deps): Promise<Response> {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return jsonError('Request body must be form data.', 400);
	}
	const pages = await readPages(form);
	if (pages instanceof Response) return pages;
	const manual = form.get('mode') === 'manual';
	const model = parseModel(form.get('model'));
	if (!model) return jsonError('Model must be sonnet or opus.', 400);

	let fields: Pick<Extracted, 'title' | 'composer' | 'key'> & { chart: Chart } = {
		title: cleanText(form.get('title')) ?? 'Untitled',
		composer: null,
		key: null,
		chart: emptyChart()
	};
	if (!manual) {
		const extraction = await extract(deps, pages, model);
		if ('failure' in extraction) return extraction.failure;
		fields = extraction.value;
	}

	const id = crypto.randomUUID();
	const now = deps.clock.now().getTime();
	try {
		await storePages(deps, id, pages);
		const [tune] = await deps.db
			.insert(tunes)
			.values({
				id,
				title: fields.title,
				composer: fields.composer,
				key: fields.key,
				sourceChart: fields.chart,
				scanPageCount: pages.length,
				createdAt: now,
				updatedAt: now
			})
			.returning();
		return Response.json(tune, { status: 201 });
	} catch (error) {
		await deleteScanPages(deps, id, pages.length).catch(() => undefined);
		throw error;
	}
}

export async function reextractChart(request: Request, deps: Deps, id: string): Promise<Response> {
	const body: unknown = await request.json().catch(() => undefined);
	const model = parseModel(isRecord(body) ? body.model : undefined);
	if (!model) return jsonError('Model must be sonnet or opus.', 400);

	const tune = await deps.db.query.tunes.findFirst({ where: eq(tunes.id, id) });
	if (!tune) return jsonError('Tune not found.', 404);
	if (tune.sourceChartStatus === 'verified') {
		return jsonError(VERIFIED_LOCKED, 409);
	}
	if (tune.scanPageCount === 0) return jsonError('Tune has no Scan to extract from.', 409);

	const extraction = await extract(deps, await loadPages(deps, id, tune.scanPageCount), model);
	if ('failure' in extraction) return extraction.failure;

	const [saved] = await deps.db
		.update(tunes)
		.set({ sourceChart: extraction.value.chart, updatedAt: deps.clock.now().getTime() })
		.where(and(eq(tunes.id, id), eq(tunes.sourceChartStatus, 'draft')))
		.returning();
	return saved ? Response.json(saved) : jsonError(VERIFIED_LOCKED, 409);
}

export async function getScanPage(deps: Deps, id: string, page: string): Promise<Response> {
	const index = Number(page);
	if (!Number.isInteger(index) || index < 0) return jsonError('Page not found.', 404);
	const object = await deps.scans.get(scanKey(id, index));
	if (!object) return jsonError('Page not found.', 404);
	return new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
			'cache-control': 'private, max-age=3600'
		}
	});
}
