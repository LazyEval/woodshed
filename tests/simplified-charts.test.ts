import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
	createSimplifiedChart,
	deleteSimplifiedChart,
	updateSimplifiedChart
} from '#lib/server/simplified-charts.js';
import {
	createTune,
	deleteTune,
	getTune,
	markChartVerified,
	saveSourceChart
} from '#lib/server/tunes.js';
import type { Chart } from '#lib/chart.js';
import { createTestApp, jsonRequest, type TestApp } from './support/app';

interface SimplifiedChartJson {
	id: string;
	name: string;
	origin: string;
	chart: Chart;
	error?: string;
}

interface TuneJson {
	sourceChart: Chart;
	simplifiedCharts: SimplifiedChartJson[];
}

const sourceChart: Chart = {
	sections: [
		{
			label: 'A',
			bars: [
				{
					chords: [
						{ beat: 1, symbol: 'Dm7' },
						{ beat: 3, symbol: 'G7' }
					],
					repeatStart: true
				},
				{ chords: [{ beat: 1, symbol: 'Cmaj7' }], repeatEnd: true }
			]
		}
	],
	keyCenters: [{ startBar: 1, endBar: 2, tonic: 'C', mode: 'major' }]
};

async function verifiedTune(app: TestApp) {
	const created = await createTune(
		jsonRequest('/api/tunes', 'POST', { title: 'Autumn Leaves' }),
		app.deps
	);
	const { id } = (await created.json()) as { id: string };
	await saveSourceChart(
		jsonRequest(`/api/tunes/${id}/chart`, 'PUT', { chart: sourceChart }),
		app.deps,
		id
	);
	await markChartVerified(app.deps, id);
	return id;
}

async function simplified(app: TestApp, tuneId: string, name = 'Shell voicings') {
	const response = await createSimplifiedChart(
		jsonRequest(`/api/tunes/${tuneId}/simplified-charts`, 'POST', { name }),
		app.deps,
		tuneId
	);
	return { response, chart: (await response.json()) as SimplifiedChartJson };
}

async function tuneOf(app: TestApp, id: string) {
	return (await getTune(app.deps, id).then((r) => r.json())) as TuneJson;
}

function update(app: TestApp, tuneId: string, chartId: string, body: object) {
	return updateSimplifiedChart(
		jsonRequest(`/api/tunes/${tuneId}/simplified-charts/${chartId}`, 'PUT', body),
		app.deps,
		tuneId,
		chartId
	);
}

function editedChords(chords: Chart['sections'][number]['bars'][number]['chords']): Chart {
	const chart = structuredClone(sourceChart);
	chart.sections[0].bars[0].chords = chords;
	return chart;
}

beforeEach(async () => {
	await env.DB.exec('DELETE FROM tunes');
});

describe('simplified charts', () => {
	it('copies the Source chords on the same grid, named and marked manual', async () => {
		const app = createTestApp();
		const tuneId = await verifiedTune(app);

		const { response, chart } = await simplified(app, tuneId);

		expect(response.status).toBe(201);
		expect(chart).toMatchObject({ name: 'Shell voicings', origin: 'manual' });
		expect(chart.chart.sections).toEqual(sourceChart.sections);
		expect((await tuneOf(app, tuneId)).simplifiedCharts.map((c) => c.id)).toEqual([chart.id]);
	});

	it('refuses to create one from a Draft Source Chart', async () => {
		const app = createTestApp();
		const created = await createTune(jsonRequest('/api/tunes', 'POST', { title: 'X' }), app.deps);
		const { id } = (await created.json()) as { id: string };

		const { response, chart } = await simplified(app, id);

		expect(response.status).toBe(409);
		expect(chart.error).toMatch(/verified/i);
	});

	it('404s for an unknown tune and requires a name', async () => {
		const app = createTestApp();
		const tuneId = await verifiedTune(app);

		const missing = await simplified(app, 'nope');
		const unnamed = await simplified(app, tuneId, '  ');

		expect(missing.response.status).toBe(404);
		expect(unnamed.response.status).toBe(400);
	});

	it('keeps several named charts per tune', async () => {
		const app = createTestApp();
		const tuneId = await verifiedTune(app);

		const first = await simplified(app, tuneId, 'Shells');
		app.clock.advance(1000);
		const second = await simplified(app, tuneId, 'Roots only');

		expect((await tuneOf(app, tuneId)).simplifiedCharts.map((c) => c.name)).toEqual([
			first.chart.name,
			second.chart.name
		]);
	});

	it('accepts chord edits on the same grid', async () => {
		const app = createTestApp();
		const tuneId = await verifiedTune(app);
		const { chart } = await simplified(app, tuneId);

		const response = await update(app, tuneId, chart.id, {
			chart: editedChords([{ beat: 1, symbol: 'G7' }])
		});

		expect(response.status).toBe(200);
		const saved = (await tuneOf(app, tuneId)).simplifiedCharts[0];
		expect(saved.chart.sections[0].bars[0].chords).toEqual([{ beat: 1, symbol: 'G7' }]);
		expect(saved.chart.sections[0].bars[0].repeatStart).toBe(true);
	});

	it('rejects invalid chords', async () => {
		const app = createTestApp();
		const tuneId = await verifiedTune(app);
		const { chart } = await simplified(app, tuneId);

		const response = await update(app, tuneId, chart.id, {
			chart: editedChords([{ beat: 1, symbol: 'H9' }])
		});

		expect(response.status).toBe(400);
	});

	it.each([
		['adding a bar', (c: Chart) => c.sections[0].bars.push({ chords: [] })],
		[
			'removing a bar',
			(c: Chart) => {
				const [first] = c.sections[0].bars;
				c.sections[0].bars = [{ ...first, repeatEnd: true }];
			}
		],
		['renaming a section', (c: Chart) => (c.sections[0].label = 'B')],
		[
			'moving a repeat end',
			(c: Chart) => {
				c.sections[0].bars[0].repeatStart = undefined;
				c.sections[0].bars[1].repeatStart = true;
			}
		],
		[
			'changing a time signature',
			(c: Chart) => (c.sections[0].bars[0].timeSignature = { beats: 3, unit: 4 })
		]
	])('rejects a write that changes the grid by %s', async (_name, mutate) => {
		const app = createTestApp();
		const tuneId = await verifiedTune(app);
		const { chart } = await simplified(app, tuneId);
		const changed = structuredClone(sourceChart);
		mutate(changed);

		const response = await update(app, tuneId, chart.id, { chart: changed });

		expect(response.status).toBe(400);
		expect(((await response.json()) as { error: string }).error).toMatch(/grid/i);
		const saved = (await tuneOf(app, tuneId)).simplifiedCharts[0];
		expect(saved.chart.sections).toEqual(sourceChart.sections);
	});

	it('renames, rejects blank names, and 404s for unknown charts', async () => {
		const app = createTestApp();
		const tuneId = await verifiedTune(app);
		const { chart } = await simplified(app, tuneId);

		const renamed = await update(app, tuneId, chart.id, { name: 'Guide tones' });
		const blank = await update(app, tuneId, chart.id, { name: ' ' });
		const missing = await update(app, tuneId, 'nope', { name: 'X' });

		expect(renamed.status).toBe(200);
		expect(blank.status).toBe(400);
		expect(missing.status).toBe(404);
		expect((await tuneOf(app, tuneId)).simplifiedCharts[0].name).toBe('Guide tones');
	});

	it('deletes one chart and removes all with the tune', async () => {
		const app = createTestApp();
		const tuneId = await verifiedTune(app);
		const first = await simplified(app, tuneId, 'One');
		await simplified(app, tuneId, 'Two');

		const deleted = await deleteSimplifiedChart(app.deps, tuneId, first.chart.id);
		const again = await deleteSimplifiedChart(app.deps, tuneId, first.chart.id);

		expect(deleted.status).toBe(204);
		expect(again.status).toBe(404);
		expect((await tuneOf(app, tuneId)).simplifiedCharts.map((c) => c.name)).toEqual(['Two']);

		await deleteTune(app.deps, tuneId);
		const { results } = await env.DB.prepare('SELECT id FROM simplified_charts').all();
		expect(results).toEqual([]);
	});
});
