import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import type { Chart } from '#lib/chart.js';
import { deleteTune, getTune, markChartVerified } from '#lib/server/tunes.js';
import { getScanPage, importTune, reextractChart } from '#lib/server/scans.js';
import { createTestApp, jsonRequest } from './support/app';

interface TuneJson {
	id: string;
	title: string;
	composer: string | null;
	key: string | null;
	sourceChart: Chart;
	sourceChartStatus: 'draft' | 'verified';
	scanPageCount: number;
	error?: string;
}

const extracted = {
	title: 'Autumn Leaves',
	composer: 'Joseph Kosma',
	key: 'Gm',
	chart: {
		sections: [
			{
				label: 'A',
				bars: [{ chords: [{ beat: 1, symbol: 'Cm7' }] }, { chords: [{ beat: 1, symbol: 'F7' }] }]
			}
		],
		keyCenters: [{ startBar: 1, endBar: 2, tonic: 'Bb', mode: 'major' }]
	}
};

const invalidChord = {
	...extracted,
	chart: { sections: [{ label: 'A', bars: [{ chords: [{ beat: 1, symbol: 'H#?' }] }] }] }
};

function page(content: string, type = 'image/jpeg'): File {
	return new File([content], 'page', { type });
}

function importRequest(pages: File[], fields: Record<string, string> = {}): Request {
	const form = new FormData();
	for (const file of pages) form.append('pages', file);
	for (const [name, value] of Object.entries(fields)) form.append(name, value);
	return new Request('https://woodshed.test/api/tunes/import', { method: 'POST', body: form });
}

async function tuneCount(): Promise<number> {
	const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM tunes').first<{ n: number }>();
	return row!.n;
}

async function scanObjectCount(): Promise<number> {
	return (await env.SCANS.list()).objects.length;
}

async function pageText(app: ReturnType<typeof createTestApp>, id: string, index: number) {
	const response = await getScanPage(app.deps, id, String(index));
	return {
		status: response.status,
		text: new TextDecoder().decode(await response.arrayBuffer()),
		response
	};
}

beforeEach(async () => {
	await env.DB.exec('DELETE FROM tunes');
	const { objects } = await env.SCANS.list();
	if (objects.length) await env.SCANS.delete(objects.map((o) => o.key));
});

describe('importing a tune from a scan', () => {
	it('creates a Tune with a Draft Source Chart, pre-filled metadata and proposed Key Centers', async () => {
		const app = createTestApp();
		app.ai.willExtract(extracted);

		const response = await importTune(importRequest([page('one')]), app.deps);

		expect(response.status).toBe(201);
		const tune = (await response.json()) as TuneJson;
		expect(tune).toMatchObject({
			title: 'Autumn Leaves',
			composer: 'Joseph Kosma',
			key: 'Gm',
			sourceChartStatus: 'draft',
			scanPageCount: 1
		});
		expect(tune.sourceChart.keyCenters).toEqual(extracted.chart.keyCenters);
		expect(tune.sourceChart.sections[0].bars).toHaveLength(2);
	});

	it('sends the pages to the AI in the order uploaded and stores them in that order', async () => {
		const app = createTestApp();
		app.ai.willExtract(extracted);

		const response = await importTune(
			importRequest([page('first'), page('second', 'image/png'), page('third')]),
			app.deps
		);
		const tune = (await response.json()) as TuneJson;

		const sent = app.ai.extractRequests[0].images.map((image) =>
			new TextDecoder().decode(image.bytes)
		);
		expect(sent).toEqual(['first', 'second', 'third']);
		expect(tune.scanPageCount).toBe(3);
		expect((await pageText(app, tune.id, 0)).text).toBe('first');
		const second = await pageText(app, tune.id, 1);
		expect(second.text).toBe('second');
		expect(second.response.headers.get('content-type')).toBe('image/png');
		expect((await pageText(app, tune.id, 2)).text).toBe('third');
		expect((await pageText(app, tune.id, 3)).status).toBe(404);
	});

	it('extracts with Sonnet by default and with Opus on request', async () => {
		const app = createTestApp();
		app.ai.willExtract(extracted);

		await importTune(importRequest([page('x')]), app.deps);
		await importTune(importRequest([page('x')], { model: 'opus' }), app.deps);

		expect(app.ai.extractRequests.map((r) => r.model)).toEqual(['sonnet', 'opus']);
	});

	it('retries once when the output is invalid, telling the AI what was wrong', async () => {
		const app = createTestApp();
		app.ai.willExtract(invalidChord, extracted);

		const response = await importTune(importRequest([page('x')]), app.deps);

		expect(response.status).toBe(201);
		expect(app.ai.extractRequests).toHaveLength(2);
		expect(app.ai.extractRequests[0].previousProblem).toBeUndefined();
		expect(app.ai.extractRequests[1].previousProblem).toMatch(/invalid chord symbol/);
	});

	it('retries once when the output is not even an object', async () => {
		const app = createTestApp();
		app.ai.willExtract('Output was not valid JSON.', extracted);

		const response = await importTune(importRequest([page('x')]), app.deps);

		expect(response.status).toBe(201);
		expect(app.ai.extractRequests).toHaveLength(2);
	});

	it('retries once on invalid structure then surfaces an error and persists nothing', async () => {
		const app = createTestApp();
		const badStructure = {
			...extracted,
			chart: { sections: [{ label: 'A', bars: [{ chords: [], repeatEnd: true }] }] }
		};
		app.ai.willExtract(badStructure);

		const response = await importTune(importRequest([page('x')]), app.deps);

		expect(response.status).toBe(422);
		expect(((await response.json()) as TuneJson).error).toMatch(/repeat end/);
		expect(app.ai.extractRequests).toHaveLength(2);
		expect(await tuneCount()).toBe(0);
		expect(await scanObjectCount()).toBe(0);
	});

	it('persists nothing when the AI call fails', async () => {
		const app = createTestApp();
		app.ai.willExtract(new Error('upstream down'));

		const response = await importTune(importRequest([page('x')]), app.deps);

		expect(response.status).toBe(502);
		expect(await tuneCount()).toBe(0);
		expect(await scanObjectCount()).toBe(0);
	});

	it('keeps suggestions lenient: invalid key dropped, missing title becomes Untitled', async () => {
		const app = createTestApp();
		app.ai.willExtract({ chart: extracted.chart, key: 'H major', title: '  ' });

		const tune = (await (
			await importTune(importRequest([page('x')]), app.deps)
		).json()) as TuneJson;

		expect(tune).toMatchObject({ title: 'Untitled', key: null, composer: null });
	});

	it('rejects missing, non-image and oversized pages and unknown models', async () => {
		const app = createTestApp();
		app.ai.willExtract(extracted);

		const none = await importTune(importRequest([]), app.deps);
		const pdf = await importTune(importRequest([page('x', 'application/pdf')]), app.deps);
		const huge = await importTune(
			importRequest([new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'p', { type: 'image/jpeg' })]),
			app.deps
		);
		const badModel = await importTune(importRequest([page('x')], { model: 'gpt' }), app.deps);

		expect([none.status, pdf.status, huge.status, badModel.status]).toEqual([400, 400, 413, 400]);
		expect(app.ai.extractRequests).toHaveLength(0);
		expect(await tuneCount()).toBe(0);
	});

	it('falls back to a manual Tune: keeps the Scan, empty chart, no AI call', async () => {
		const app = createTestApp();

		const response = await importTune(
			importRequest([page('scan')], { mode: 'manual', title: 'Blue Bossa' }),
			app.deps
		);

		const tune = (await response.json()) as TuneJson;
		expect(response.status).toBe(201);
		expect(tune).toMatchObject({
			title: 'Blue Bossa',
			scanPageCount: 1,
			sourceChartStatus: 'draft'
		});
		expect(app.ai.extractRequests).toHaveLength(0);
		expect((await pageText(app, tune.id, 0)).text).toBe('scan');
	});
});

describe('re-extracting from the stored scan', () => {
	async function importedTune(app: ReturnType<typeof createTestApp>) {
		app.ai.willExtract(extracted);
		const tune = (await (
			await importTune(importRequest([page('stored')]), app.deps)
		).json()) as TuneJson;
		app.ai.extractRequests.length = 0;
		return tune;
	}

	const better = {
		...extracted,
		chart: { sections: [{ label: 'A', bars: [{ chords: [{ beat: 1, symbol: 'Am7b5' }] }] }] }
	};

	it('replaces the Draft chart using Opus on the stored pages', async () => {
		const app = createTestApp();
		const tune = await importedTune(app);
		app.ai.extractions = [better];

		const response = await reextractChart(
			jsonRequest(`/api/tunes/${tune.id}/extract`, 'POST', { model: 'opus' }),
			app.deps,
			tune.id
		);

		expect(response.status).toBe(200);
		const request = app.ai.extractRequests[0];
		expect(request.model).toBe('opus');
		expect(new TextDecoder().decode(request.images[0].bytes)).toBe('stored');
		const saved = (await (await getTune(app.deps, tune.id)).json()) as TuneJson;
		expect(saved.sourceChart.sections[0].bars[0].chords[0].symbol).toBe('Am7b5');
	});

	it('keeps the existing chart when extraction fails', async () => {
		const app = createTestApp();
		const tune = await importedTune(app);
		app.ai.extractions = [invalidChord];

		const response = await reextractChart(
			jsonRequest(`/api/tunes/${tune.id}/extract`, 'POST', { model: 'opus' }),
			app.deps,
			tune.id
		);

		expect(response.status).toBe(422);
		const saved = (await (await getTune(app.deps, tune.id)).json()) as TuneJson;
		expect(saved.sourceChart.sections[0].bars).toHaveLength(2);
	});

	it('refuses a Verified Source Chart, a missing Tune, and a Tune without a Scan', async () => {
		const app = createTestApp();
		const tune = await importedTune(app);
		const handBuilt = (await (
			await importTune(importRequest([page('x')], { mode: 'manual' }), app.deps)
		).json()) as TuneJson;
		await env.DB.exec(`UPDATE tunes SET scan_page_count = 0 WHERE id = '${handBuilt.id}'`);
		await markChartVerified(app.deps, tune.id);
		const call = (id: string) =>
			reextractChart(jsonRequest(`/api/tunes/${id}/extract`, 'POST', {}), app.deps, id);

		expect((await call(tune.id)).status).toBe(409);
		expect((await call('nope')).status).toBe(404);
		expect((await call(handBuilt.id)).status).toBe(409);
		expect(app.ai.extractRequests).toHaveLength(0);
	});
});

describe('scan lifecycle', () => {
	it('deletes the Scan with the Tune', async () => {
		const app = createTestApp();
		app.ai.willExtract(extracted);
		const tune = (await (
			await importTune(importRequest([page('a'), page('b')]), app.deps)
		).json()) as TuneJson;
		expect(await scanObjectCount()).toBe(2);

		await deleteTune(app.deps, tune.id);

		expect(await scanObjectCount()).toBe(0);
	});
});
