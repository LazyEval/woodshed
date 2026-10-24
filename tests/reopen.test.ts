import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import type { Chart } from '#lib/chart.js';
import {
	clearBarFlag,
	createSimplifiedChart,
	deleteSimplifiedChart,
	updateSimplifiedChart
} from '#lib/server/simplified-charts.js';
import {
	createTune,
	getTune,
	markChartVerified,
	reopenSourceChart,
	saveSourceChart
} from '#lib/server/tunes.js';
import { createTestApp, jsonRequest, type TestApp } from './support/app';

interface SimplifiedChartJson {
	id: string;
	name: string;
	chart: Chart;
	flaggedBars: number[];
	archivedAt: number | null;
}

interface TuneJson {
	sourceChartStatus: string;
	sourceChart: Chart;
	simplifiedCharts: SimplifiedChartJson[];
}

const sourceChart: Chart = {
	sections: [
		{
			label: 'A',
			bars: [
				{ chords: [{ beat: 1, symbol: 'Dm7' }], repeatStart: true },
				{ chords: [{ beat: 1, symbol: 'G7' }] },
				{ chords: [{ beat: 1, symbol: 'Cmaj7' }] },
				{ chords: [{ beat: 1, symbol: 'Cmaj7' }], repeatEnd: true }
			]
		}
	]
};

function withChord(chart: Chart, bar: number, symbol: string): Chart {
	const copy = structuredClone(chart);
	copy.sections[0].bars[bar].chords = [{ beat: 1, symbol }];
	return copy;
}

function withExtraBar(chart: Chart): Chart {
	const copy = structuredClone(chart);
	copy.sections[0].bars.push({ chords: [{ beat: 1, symbol: 'Dm7' }] });
	copy.sections[0].bars[3].repeatEnd = undefined;
	copy.sections[0].bars[4].repeatEnd = true;
	return copy;
}

async function tuneWithSimplifiedCharts(app: TestApp, names: string[]) {
	const created = await createTune(
		jsonRequest('/api/tunes', 'POST', { title: 'Autumn Leaves' }),
		app.deps
	);
	const { id } = (await created.json()) as { id: string };
	await save(app, id, sourceChart);
	await markChartVerified(app.deps, id);
	for (const name of names) {
		await createSimplifiedChart(
			jsonRequest(`/api/tunes/${id}/simplified-charts`, 'POST', { name }),
			app.deps,
			id
		);
		app.clock.advance(1000);
	}
	return id;
}

function save(app: TestApp, tuneId: string, chart: Chart) {
	return saveSourceChart(
		jsonRequest(`/api/tunes/${tuneId}/chart`, 'PUT', { chart }),
		app.deps,
		tuneId
	);
}

async function tuneOf(app: TestApp, id: string) {
	return (await getTune(app.deps, id).then((r) => r.json())) as TuneJson;
}

function verifyWith(app: TestApp, tuneId: string, body: Record<string, unknown> = {}) {
	return markChartVerified(app.deps, tuneId, body);
}

beforeEach(async () => {
	await env.DB.exec('DELETE FROM tunes');
});

describe('reopening a Source Chart', () => {
	it('returns a Verified Source Chart to Draft and allows editing again', async () => {
		const app = createTestApp();
		const tuneId = await tuneWithSimplifiedCharts(app, []);

		const reopened = await reopenSourceChart(app.deps, tuneId);
		const saved = await save(app, tuneId, withChord(sourceChart, 0, 'Em7'));

		expect(((await reopened.json()) as TuneJson).sourceChartStatus).toBe('draft');
		expect(saved.status).toBe(200);
	});

	it('leaves Simplified Charts untouched until re-verification', async () => {
		const app = createTestApp();
		const tuneId = await tuneWithSimplifiedCharts(app, ['Shells']);

		await reopenSourceChart(app.deps, tuneId);
		await save(app, tuneId, withChord(sourceChart, 1, 'Bb7'));

		const [chart] = (await tuneOf(app, tuneId)).simplifiedCharts;
		expect(chart.flaggedBars).toEqual([]);
		expect(chart.archivedAt).toBeNull();
		expect(chart.chart).toEqual(sourceChart);
	});
});

describe('Correction (same grid)', () => {
	it('flags exactly the changed bars on every Simplified Chart', async () => {
		const app = createTestApp();
		const tuneId = await tuneWithSimplifiedCharts(app, ['Shells', 'Roots']);
		await reopenSourceChart(app.deps, tuneId);
		await save(app, tuneId, withChord(withChord(sourceChart, 1, 'Bb7'), 3, 'Am7'));

		const response = await verifyWith(app, tuneId);

		expect(response.status).toBe(200);
		const tune = await tuneOf(app, tuneId);
		expect(tune.sourceChartStatus).toBe('verified');
		expect(tune.simplifiedCharts.map((c) => c.flaggedBars)).toEqual([
			[1, 3],
			[1, 3]
		]);
		expect(tune.simplifiedCharts.every((c) => c.archivedAt === null)).toBe(true);
	});

	it('flags nothing when the chords are unchanged', async () => {
		const app = createTestApp();
		const tuneId = await tuneWithSimplifiedCharts(app, ['Shells']);
		await reopenSourceChart(app.deps, tuneId);

		await verifyWith(app, tuneId);

		expect((await tuneOf(app, tuneId)).simplifiedCharts[0].flaggedBars).toEqual([]);
	});

	it('flags relative to the last Verified chart across several reopenings', async () => {
		const app = createTestApp();
		const tuneId = await tuneWithSimplifiedCharts(app, ['Shells']);
		await reopenSourceChart(app.deps, tuneId);
		await save(app, tuneId, withChord(sourceChart, 0, 'Em7'));
		await verifyWith(app, tuneId);
		await reopenSourceChart(app.deps, tuneId);
		await save(app, tuneId, withChord(withChord(sourceChart, 0, 'Em7'), 2, 'Fmaj7'));

		await verifyWith(app, tuneId);

		expect((await tuneOf(app, tuneId)).simplifiedCharts[0].flaggedBars).toEqual([0, 2]);
	});

	it('does not flag a bar whose chords changed and changed back', async () => {
		const app = createTestApp();
		const tuneId = await tuneWithSimplifiedCharts(app, ['Shells']);
		await reopenSourceChart(app.deps, tuneId);
		await save(app, tuneId, withChord(sourceChart, 1, 'Bb7'));
		await save(app, tuneId, sourceChart);

		await verifyWith(app, tuneId);

		expect((await tuneOf(app, tuneId)).simplifiedCharts[0].flaggedBars).toEqual([]);
	});

	it('clears a flag per bar and keeps the others', async () => {
		const app = createTestApp();
		const tuneId = await tuneWithSimplifiedCharts(app, ['Shells']);
		await reopenSourceChart(app.deps, tuneId);
		await save(app, tuneId, withChord(withChord(sourceChart, 1, 'Bb7'), 3, 'Am7'));
		await verifyWith(app, tuneId);
		const [{ id: chartId }] = (await tuneOf(app, tuneId)).simplifiedCharts;

		const response = await clearBarFlag(app.deps, tuneId, chartId, 1);
		const unflagged = await clearBarFlag(app.deps, tuneId, chartId, 2);

		expect(response.status).toBe(200);
		expect(unflagged.status).toBe(200);
		expect((await tuneOf(app, tuneId)).simplifiedCharts[0].flaggedBars).toEqual([3]);
	});

	it('404s when clearing a flag on an unknown chart', async () => {
		const app = createTestApp();
		const tuneId = await tuneWithSimplifiedCharts(app, ['Shells']);

		const response = await clearBarFlag(app.deps, tuneId, 'nope', 0);

		expect(response.status).toBe(404);
	});
});

describe('grid change', () => {
	async function reopenedWithNewGrid(app: TestApp, names: string[]) {
		const tuneId = await tuneWithSimplifiedCharts(app, names);
		await reopenSourceChart(app.deps, tuneId);
		await save(app, tuneId, withExtraBar(sourceChart));
		return tuneId;
	}

	it('rejects re-verification without confirmation, naming the Simplified Charts', async () => {
		const app = createTestApp();
		const tuneId = await reopenedWithNewGrid(app, ['Shells', 'Roots']);

		const response = await verifyWith(app, tuneId);
		const body = (await response.json()) as { error: string; simplifiedCharts: string[] };

		expect(response.status).toBe(409);
		expect(body.simplifiedCharts).toEqual(['Shells', 'Roots']);
		const tune = await tuneOf(app, tuneId);
		expect(tune.sourceChartStatus).toBe('draft');
		expect(tune.simplifiedCharts.every((c) => c.archivedAt === null)).toBe(true);
	});

	it('does not accept a loose confirmation value', async () => {
		const app = createTestApp();
		const tuneId = await reopenedWithNewGrid(app, ['Shells']);

		const response = await verifyWith(app, tuneId, { confirmArchive: 'yes' });

		expect(response.status).toBe(409);
	});

	it('archives all non-archived Simplified Charts once confirmed', async () => {
		const app = createTestApp();
		const tuneId = await reopenedWithNewGrid(app, ['Shells', 'Roots']);
		const now = app.clock.now().getTime();

		const response = await verifyWith(app, tuneId, { confirmArchive: true });

		expect(response.status).toBe(200);
		const tune = await tuneOf(app, tuneId);
		expect(tune.sourceChartStatus).toBe('verified');
		expect(tune.simplifiedCharts.map((c) => c.archivedAt)).toEqual([now, now]);
		expect(tune.simplifiedCharts[0].chart).toEqual(sourceChart);
	});

	it('needs no confirmation when there is nothing to archive', async () => {
		const app = createTestApp();
		const tuneId = await reopenedWithNewGrid(app, []);

		const response = await verifyWith(app, tuneId);

		expect(response.status).toBe(200);
	});

	it('leaves already archived charts alone and does not name them', async () => {
		const app = createTestApp();
		const tuneId = await reopenedWithNewGrid(app, ['Old']);
		await verifyWith(app, tuneId, { confirmArchive: true });
		const archivedAt = (await tuneOf(app, tuneId)).simplifiedCharts[0].archivedAt;
		app.clock.advance(5000);
		await createSimplifiedChart(
			jsonRequest(`/api/tunes/${tuneId}/simplified-charts`, 'POST', { name: 'New' }),
			app.deps,
			tuneId
		);
		await reopenSourceChart(app.deps, tuneId);
		await save(app, tuneId, sourceChart);

		const unconfirmed = await verifyWith(app, tuneId);
		const names = ((await unconfirmed.json()) as { simplifiedCharts: string[] }).simplifiedCharts;
		await verifyWith(app, tuneId, { confirmArchive: true });

		expect(names).toEqual(['New']);
		const charts = (await tuneOf(app, tuneId)).simplifiedCharts;
		expect(charts.find((c) => c.name === 'Old')?.archivedAt).toBe(archivedAt);
	});

	it('does not flag archived charts on a later Correction', async () => {
		const app = createTestApp();
		const tuneId = await reopenedWithNewGrid(app, ['Old']);
		await verifyWith(app, tuneId, { confirmArchive: true });
		await reopenSourceChart(app.deps, tuneId);
		await save(app, tuneId, withChord(withExtraBar(sourceChart), 0, 'Em7'));

		await verifyWith(app, tuneId);

		expect((await tuneOf(app, tuneId)).simplifiedCharts[0].flaggedBars).toEqual([]);
	});
});

describe('Archived Simplified Charts', () => {
	async function archived(app: TestApp) {
		const tuneId = await tuneWithSimplifiedCharts(app, ['Shells']);
		await reopenSourceChart(app.deps, tuneId);
		await save(app, tuneId, withExtraBar(sourceChart));
		await verifyWith(app, tuneId, { confirmArchive: true });
		const [chart] = (await tuneOf(app, tuneId)).simplifiedCharts;
		return { tuneId, chart };
	}

	it('stay viewable with their original chords', async () => {
		const app = createTestApp();
		const { chart } = await archived(app);

		expect(chart.chart).toEqual(sourceChart);
		expect(chart.archivedAt).not.toBeNull();
	});

	it('reject chord edits and renames', async () => {
		const app = createTestApp();
		const { tuneId, chart } = await archived(app);
		const put = (body: object) =>
			updateSimplifiedChart(
				jsonRequest(`/api/tunes/${tuneId}/simplified-charts/${chart.id}`, 'PUT', body),
				app.deps,
				tuneId,
				chart.id
			);

		const chords = await put({ chart: withChord(withExtraBar(sourceChart), 0, 'Em7') });
		const rename = await put({ name: 'Renamed' });

		expect(chords.status).toBe(409);
		expect(rename.status).toBe(409);
		expect(((await chords.json()) as { error: string }).error).toMatch(/archived/i);
		expect((await tuneOf(app, tuneId)).simplifiedCharts[0]).toMatchObject({
			name: 'Shells',
			chart: sourceChart
		});
	});

	it('reject clearing flags', async () => {
		const app = createTestApp();
		const { tuneId, chart } = await archived(app);

		const response = await clearBarFlag(app.deps, tuneId, chart.id, 0);

		expect(response.status).toBe(409);
	});

	it('can still be deleted', async () => {
		const app = createTestApp();
		const { tuneId, chart } = await archived(app);

		const response = await deleteSimplifiedChart(app.deps, tuneId, chart.id);

		expect(response.status).toBe(204);
	});
});
