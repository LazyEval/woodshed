import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import type { Chart } from '#lib/chart.js';
import { getScanPage, importTune, replaceSourceChart } from '#lib/server/scans.js';
import { logPracticeSession } from '#lib/server/rotation.js';
import { createSimplifiedChart } from '#lib/server/simplified-charts.js';
import { getTune, markChartVerified, updateTune } from '#lib/server/tunes.js';
import { createTestApp, jsonRequest, type TestApp } from './support/app';

interface TuneJson {
	id: string;
	title: string;
	key: string | null;
	sourceChart: Chart;
	sourceChartStatus: 'draft' | 'verified';
	verifiedAt: number | null;
	scanPageCount: number;
	simplifiedCharts: { name: string; archivedAt: number | null }[];
	error?: string;
}

const oldExtraction = {
	title: 'Autumn Leaves',
	composer: null,
	key: 'Gm',
	chart: {
		sections: [
			{
				label: 'A',
				bars: [{ chords: [{ beat: 1, symbol: 'Cm7' }] }, { chords: [{ beat: 1, symbol: 'F7' }] }]
			}
		]
	}
};

const newExtraction = {
	title: 'Ignored Title',
	chart: {
		sections: [
			{
				label: 'A',
				bars: [
					{ chords: [{ beat: 1, symbol: 'Am7b5' }] },
					{ chords: [{ beat: 1, symbol: 'D7' }] },
					{ chords: [{ beat: 1, symbol: 'Gm7' }] }
				]
			}
		]
	}
};

function page(content: string): File {
	return new File([content], 'page', { type: 'image/jpeg' });
}

function pagesRequest(pages: File[], fields: Record<string, string> = {}, path = '/import') {
	const form = new FormData();
	for (const file of pages) form.append('pages', file);
	for (const [name, value] of Object.entries(fields)) form.append(name, value);
	return new Request(`https://woodshed.test/api/tunes${path}`, { method: 'POST', body: form });
}

function replace(app: TestApp, id: string, pages: File[], fields: Record<string, string> = {}) {
	return replaceSourceChart(pagesRequest(pages, fields, `/${id}/replace`), app.deps, id);
}

async function tuneOf(app: TestApp, id: string) {
	return (await getTune(app.deps, id).then((r) => r.json())) as TuneJson;
}

async function verifiedTuneWithCharts(app: TestApp, names: string[]) {
	app.ai.extractions = [oldExtraction];
	const tune = (await importTune(pagesRequest([page('old-1'), page('old-2')]), app.deps).then((r) =>
		r.json()
	)) as TuneJson;
	await markChartVerified(app.deps, tune.id);
	for (const name of names) {
		await createSimplifiedChart(
			jsonRequest(`/api/tunes/${tune.id}/simplified-charts`, 'POST', { name }),
			app.deps,
			tune.id
		);
		app.clock.advance(1000);
	}
	app.ai.extractRequests.length = 0;
	app.ai.extractions = [newExtraction];
	return tune.id;
}

async function pageText(app: TestApp, id: string, index: number) {
	const response = await getScanPage(app.deps, id, String(index));
	return response.status === 200 ? new TextDecoder().decode(await response.arrayBuffer()) : null;
}

beforeEach(async () => {
	await env.DB.exec('DELETE FROM tunes');
	const { objects } = await env.SCANS.list();
	if (objects.length) await env.SCANS.delete(objects.map((o) => o.key));
});

describe('Replacement of a Source Chart', () => {
	it('stores the new Scan and a fresh Draft, keeping Tune metadata', async () => {
		const app = createTestApp();
		const id = await verifiedTuneWithCharts(app, []);
		await updateTune(jsonRequest(`/api/tunes/${id}`, 'PATCH', { title: 'My Title' }), app.deps, id);

		const response = await replace(app, id, [page('new-1')]);

		expect(response.status).toBe(200);
		const tune = await tuneOf(app, id);
		expect(tune).toMatchObject({
			title: 'My Title',
			key: 'Gm',
			sourceChartStatus: 'draft',
			verifiedAt: null,
			scanPageCount: 1
		});
		expect(tune.sourceChart.sections[0].bars).toHaveLength(3);
		expect(await pageText(app, id, 0)).toBe('new-1');
		expect(await pageText(app, id, 1)).toBeNull();
	});

	it('archives live Simplified Charts only after confirmation naming them', async () => {
		const app = createTestApp();
		const id = await verifiedTuneWithCharts(app, ['Shells', 'Roots']);

		const unconfirmed = await replace(app, id, [page('new')]);

		expect(unconfirmed.status).toBe(409);
		expect(((await unconfirmed.json()) as { simplifiedCharts: string[] }).simplifiedCharts).toEqual(
			['Shells', 'Roots']
		);
		expect(app.ai.extractRequests).toHaveLength(0);
		expect((await tuneOf(app, id)).scanPageCount).toBe(2);

		const confirmed = await replace(app, id, [page('new')], { confirmArchive: 'true' });

		expect(confirmed.status).toBe(200);
		const tune = await tuneOf(app, id);
		expect(tune.simplifiedCharts.map((c) => c.name)).toEqual(['Shells', 'Roots']);
		expect(tune.simplifiedCharts.every((c) => c.archivedAt !== null)).toBe(true);
	});

	it('leaves only the new Scan in storage across repeated Replacements', async () => {
		const app = createTestApp();
		const id = await verifiedTuneWithCharts(app, []);

		await replace(app, id, [page('second-1'), page('second-2'), page('second-3')]);
		await replace(app, id, [page('third-1')]);

		expect((await env.SCANS.list()).objects).toHaveLength(1);
		expect(await pageText(app, id, 0)).toBe('third-1');
	});

	it('needs no confirmation when there are no live Simplified Charts', async () => {
		const app = createTestApp();
		const id = await verifiedTuneWithCharts(app, []);

		expect((await replace(app, id, [page('new')])).status).toBe(200);
	});

	it('changes nothing when extraction fails', async () => {
		const app = createTestApp();
		const id = await verifiedTuneWithCharts(app, ['Shells']);
		app.ai.extractions = [new Error('upstream down')];

		const response = await replace(app, id, [page('new')], { confirmArchive: 'true' });

		expect(response.status).toBe(502);
		const tune = await tuneOf(app, id);
		expect(tune).toMatchObject({ sourceChartStatus: 'verified', scanPageCount: 2 });
		expect(tune.simplifiedCharts[0].archivedAt).toBeNull();
		expect(await pageText(app, id, 0)).toBe('old-1');
		expect(await pageText(app, id, 1)).toBe('old-2');
	});

	it('preserves Practice Sessions', async () => {
		const app = createTestApp();
		const id = await verifiedTuneWithCharts(app, []);
		await logPracticeSession(
			jsonRequest(`/api/tunes/${id}/sessions`, 'POST', { rating: 'ok' }),
			app.deps,
			id
		);

		await replace(app, id, [page('new')]);

		const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM practice_sessions').first<{
			n: number;
		}>();
		expect(row!.n).toBe(1);
	});

	it('rejects bad pages, unknown models and missing Tunes without calling the AI', async () => {
		const app = createTestApp();
		const id = await verifiedTuneWithCharts(app, []);

		const none = await replace(app, id, []);
		const badModel = await replace(app, id, [page('x')], { model: 'gpt' });
		const missing = await replace(app, 'nope', [page('x')]);

		expect([none.status, badModel.status, missing.status]).toEqual([400, 400, 404]);
		expect(app.ai.extractRequests).toHaveLength(0);
	});

	it('extracts with the requested model', async () => {
		const app = createTestApp();
		const id = await verifiedTuneWithCharts(app, []);

		await replace(app, id, [page('x')], { model: 'opus' });

		expect(app.ai.extractRequests[0].model).toBe('opus');
	});
});
