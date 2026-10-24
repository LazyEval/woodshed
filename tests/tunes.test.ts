import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
	createTune,
	deleteTune,
	getTune,
	listTunes,
	markChartVerified,
	reopenSourceChart,
	saveSourceChart,
	updateTune
} from '#lib/server/tunes.js';
import type { Chart } from '#lib/chart.js';
import { createTestApp, jsonRequest } from './support/app';

interface TuneJson {
	id: string;
	title: string;
	composer: string | null;
	key: string | null;
	sourceChart: Chart;
	sourceChartStatus: 'draft' | 'verified';
	error?: string;
}

const validChart: Chart = {
	sections: [
		{
			label: 'A',
			bars: [
				{
					chords: [
						{ beat: 1, symbol: 'Dm7' },
						{ beat: 3, symbol: 'G7' }
					]
				},
				{ chords: [{ beat: 1, symbol: 'Cmaj7' }] },
				{ chords: [{ beat: 1, symbol: 'N.C.' }] },
				{
					chords: [
						{ beat: 1, symbol: 'C/E' },
						{ beat: 2, symbol: 'Bb7#11' }
					]
				}
			]
		},
		{ label: 'Coda', bars: [{ chords: [] }] }
	]
};

async function newTune(app = createTestApp(), body: object = { title: 'Autumn Leaves' }) {
	const response = await createTune(jsonRequest('/api/tunes', 'POST', body), app.deps);
	return { app, response, tune: (await response.json()) as TuneJson };
}

beforeEach(async () => {
	await env.DB.exec('DELETE FROM tunes');
});

describe('tunes', () => {
	it('creates a tune with title, composer and key, starting with an empty Draft Source Chart', async () => {
		const { response, tune } = await newTune(createTestApp(), {
			title: 'Autumn Leaves',
			composer: 'Joseph Kosma',
			key: 'Gm'
		});

		expect(response.status).toBe(201);
		expect(tune).toMatchObject({
			title: 'Autumn Leaves',
			composer: 'Joseph Kosma',
			key: 'Gm',
			sourceChartStatus: 'draft'
		});
		expect(tune.sourceChart.sections.length).toBeGreaterThan(0);
		expect(tune.id).toBeTruthy();
	});

	it('requires a title and a valid key', async () => {
		const app = createTestApp();

		const noTitle = await newTune(app, { title: '  ' });
		const badKey = await newTune(app, { title: 'X', key: 'H' });

		expect(noTitle.response.status).toBe(400);
		expect(noTitle.tune.error).toMatch(/title/i);
		expect(badKey.response.status).toBe(400);
		expect(badKey.tune.error).toMatch(/key/i);
	});

	it('gets a tune by id and 404s for an unknown one', async () => {
		const { app, tune } = await newTune();

		const found = await getTune(app.deps, tune.id);
		const missing = await getTune(app.deps, 'nope');

		expect(found.status).toBe(200);
		expect(((await found.json()) as TuneJson).title).toBe('Autumn Leaves');
		expect(missing.status).toBe(404);
	});

	it('edits title, composer and key', async () => {
		const { app, tune } = await newTune();

		const response = await updateTune(
			jsonRequest(`/api/tunes/${tune.id}`, 'PATCH', { title: 'Les Feuilles mortes', key: 'Em' }),
			app.deps,
			tune.id
		);

		expect(response.status).toBe(200);
		const updated = (await getTune(app.deps, tune.id).then((r) => r.json())) as TuneJson;
		expect(updated).toMatchObject({ title: 'Les Feuilles mortes', key: 'Em' });
	});

	it('lists tunes by title, searchable case-insensitively', async () => {
		const app = createTestApp();
		await newTune(app, { title: 'Autumn Leaves' });
		await newTune(app, { title: 'All The Things You Are' });
		await newTune(app, { title: 'Blue Bossa' });

		const all = (await (
			await listTunes(new Request('https://woodshed.test/api/tunes'), app.deps)
		).json()) as TuneJson[];
		const found = (await (
			await listTunes(new Request('https://woodshed.test/api/tunes?q=aLL'), app.deps)
		).json()) as TuneJson[];
		const percent = (await (
			await listTunes(new Request('https://woodshed.test/api/tunes?q=%25'), app.deps)
		).json()) as TuneJson[];

		expect(all.map((t) => t.title)).toEqual([
			'All The Things You Are',
			'Autumn Leaves',
			'Blue Bossa'
		]);
		expect(found.map((t) => t.title)).toEqual(['All The Things You Are']);
		expect(percent).toEqual([]);
		expect(all[0]).not.toHaveProperty('sourceChart');
	});

	it('deletes a tune', async () => {
		const { app, tune } = await newTune();

		const response = await deleteTune(app.deps, tune.id);

		expect(response.status).toBe(204);
		expect((await getTune(app.deps, tune.id)).status).toBe(404);
		expect((await deleteTune(app.deps, tune.id)).status).toBe(404);
	});
});

describe('source chart', () => {
	async function save(app: ReturnType<typeof createTestApp>, id: string, chart: unknown) {
		return saveSourceChart(jsonRequest(`/api/tunes/${id}/chart`, 'PUT', { chart }), app.deps, id);
	}

	it('saves sections, bars and chords placed on beats, including slash bass and N.C.', async () => {
		const { app, tune } = await newTune();

		const response = await save(app, tune.id, validChart);

		expect(response.status).toBe(200);
		const stored = (await getTune(app.deps, tune.id).then((r) => r.json())) as TuneJson;
		expect(stored.sourceChart).toEqual(validChart);
	});

	it('sorts chords by beat within a bar', async () => {
		const { app, tune } = await newTune();
		const chart = {
			sections: [
				{
					label: 'A',
					bars: [
						{
							chords: [
								{ beat: 3, symbol: 'G7' },
								{ beat: 1, symbol: 'Dm7' }
							]
						}
					]
				}
			]
		};

		await save(app, tune.id, chart);

		const stored = (await getTune(app.deps, tune.id).then((r) => r.json())) as TuneJson;
		expect(stored.sourceChart.sections[0].bars[0].chords.map((c) => c.beat)).toEqual([1, 3]);
	});

	it.each([
		'C',
		'Dm7',
		'G7alt',
		'Bb7#11',
		'F#m7b5',
		'Ebmaj7',
		'C6/9',
		'C-7',
		'CΔ7',
		'Co7',
		'Cm(maj7)',
		'C7(#9,b13)',
		'C7sus4',
		'Csus',
		'C13b9',
		'Bbmaj7/Ab',
		'C/E'
	])('accepts chord symbol %j', async (symbol) => {
		const { app, tune } = await newTune();
		const chart = { sections: [{ label: 'A', bars: [{ chords: [{ beat: 1, symbol }] }] }] };

		expect((await save(app, tune.id, chart)).status).toBe(200);
	});

	it('normalizes NC to N.C.', async () => {
		const { app, tune } = await newTune();
		const chart = { sections: [{ label: 'A', bars: [{ chords: [{ beat: 1, symbol: 'NC' }] }] }] };

		await save(app, tune.id, chart);

		const stored = (await getTune(app.deps, tune.id).then((r) => r.json())) as TuneJson;
		expect(stored.sourceChart.sections[0].bars[0].chords[0].symbol).toBe('N.C.');
	});

	it.each([
		['H7', /invalid chord symbol "H7"/],
		['C/', /invalid chord symbol "C\/"/],
		['Cx7', /invalid chord symbol/],
		['', /invalid chord symbol/],
		['N.C./E', /invalid chord symbol/],
		['Cmm', /invalid chord symbol/],
		['C(((', /invalid chord symbol/],
		['C,,,', /invalid chord symbol/],
		['Cmaj-+^', /invalid chord symbol/],
		['C/9', /invalid chord symbol/]
	])('rejects chord symbol %j with a clear message', async (symbol, message) => {
		const { app, tune } = await newTune();
		const chart = { sections: [{ label: 'A', bars: [{ chords: [{ beat: 1, symbol }] }] }] };

		const response = await save(app, tune.id, chart);

		expect(response.status).toBe(400);
		expect(((await response.json()) as TuneJson).error).toMatch(message);
	});

	it.each([
		['beat 0', { chords: [{ beat: 0, symbol: 'C' }] }],
		['beat 5', { chords: [{ beat: 5, symbol: 'C' }] }],
		['fractional beat', { chords: [{ beat: 1.5, symbol: 'C' }] }],
		[
			'two chords on a beat',
			{
				chords: [
					{ beat: 1, symbol: 'C' },
					{ beat: 1, symbol: 'D' }
				]
			}
		]
	])('rejects %s', async (_name, bar) => {
		const { app, tune } = await newTune();

		const response = await save(app, tune.id, { sections: [{ label: 'A', bars: [bar] }] });

		expect(response.status).toBe(400);
	});

	it('rejects structurally broken charts and leaves the stored chart untouched', async () => {
		const { app, tune } = await newTune();
		await save(app, tune.id, validChart);

		const noLabel = await save(app, tune.id, {
			sections: [{ label: ' ', bars: [{ chords: [] }] }]
		});
		const noBars = await save(app, tune.id, { sections: [{ label: 'A', bars: [] }] });
		const notAChart = await save(app, tune.id, 'hello');

		expect([noLabel.status, noBars.status, notAChart.status]).toEqual([400, 400, 400]);
		const stored = (await getTune(app.deps, tune.id).then((r) => r.json())) as TuneJson;
		expect(stored.sourceChart).toEqual(validChart);
	});

	it('names the section and bar of an invalid chord', async () => {
		const { app, tune } = await newTune();
		const chart = {
			sections: [
				{ label: 'A', bars: [{ chords: [] }] },
				{ label: 'B', bars: [{ chords: [] }, { chords: [{ beat: 1, symbol: 'Zm' }] }] }
			]
		};

		const response = await save(app, tune.id, chart);

		expect(((await response.json()) as TuneJson).error).toMatch(/Section 2 \(B\), bar 2/);
	});

	it('rejects a chart with no sections', async () => {
		const { app, tune } = await newTune();

		expect((await save(app, tune.id, { sections: [] })).status).toBe(400);
	});

	it('names the accepted format in the invalid chord message', async () => {
		const { app, tune } = await newTune();
		const chart = { sections: [{ label: 'A', bars: [{ chords: [{ beat: 1, symbol: 'Zm' }] }] }] };

		const response = await save(app, tune.id, chart);

		expect(((await response.json()) as TuneJson).error).toMatch(/e\.g\./);
	});

	it('404s when saving a chart for an unknown tune', async () => {
		const app = createTestApp();

		expect((await save(app, 'nope', validChart)).status).toBe(404);
	});

	it('can be marked Verified, after which it is locked against edits', async () => {
		const { app, tune } = await newTune();
		await save(app, tune.id, validChart);

		const verified = await markChartVerified(app.deps, tune.id);
		const edit = await save(app, tune.id, { sections: [{ label: 'B', bars: [{ chords: [] }] }] });

		expect(verified.status).toBe(200);
		const stored = (await getTune(app.deps, tune.id).then((r) => r.json())) as TuneJson;
		expect(stored.sourceChartStatus).toBe('verified');
		expect(stored.sourceChart).toEqual(validChart);
		expect(edit.status).toBe(409);
	});

	it('404s when verifying an unknown tune', async () => {
		expect((await markChartVerified(createTestApp().deps, 'nope')).status).toBe(404);
	});

	it('does not touch a chart that is already Verified when verifying again', async () => {
		const { app, tune } = await newTune();
		await markChartVerified(app.deps, tune.id);
		const before = (await getTune(app.deps, tune.id).then((r) => r.json())) as TuneJson & {
			updatedAt: number;
		};

		app.clock.advance(60_000);
		const again = await markChartVerified(app.deps, tune.id);

		expect(again.status).toBe(200);
		const after = (await getTune(app.deps, tune.id).then((r) => r.json())) as typeof before;
		expect(after.updatedAt).toBe(before.updatedAt);
	});

	it('can be reopened for edits after being Verified', async () => {
		const { app, tune } = await newTune();
		await save(app, tune.id, validChart);
		await markChartVerified(app.deps, tune.id);

		const reopened = await reopenSourceChart(app.deps, tune.id);
		const edit = await save(app, tune.id, { sections: [{ label: 'B', bars: [{ chords: [] }] }] });

		expect(reopened.status).toBe(200);
		expect(edit.status).toBe(200);
		const stored = (await getTune(app.deps, tune.id).then((r) => r.json())) as TuneJson;
		expect(stored.sourceChartStatus).toBe('draft');
	});

	it('404s when reopening an unknown tune', async () => {
		expect((await reopenSourceChart(createTestApp().deps, 'nope')).status).toBe(404);
	});
});

describe('source chart structure', () => {
	const bar = (extra: object = {}) => ({ chords: [{ beat: 1, symbol: 'C' }], ...extra });

	async function save(app: ReturnType<typeof createTestApp>, id: string, chart: unknown) {
		return saveSourceChart(jsonRequest(`/api/tunes/${id}/chart`, 'PUT', { chart }), app.deps, id);
	}

	async function storedChart(app: ReturnType<typeof createTestApp>, id: string) {
		const stored = (await getTune(app.deps, id).then((r) => r.json())) as TuneJson;
		return stored.sourceChart;
	}

	it('round-trips repeats, 1st/2nd endings and time signatures', async () => {
		const { app, tune } = await newTune();
		const chart = {
			sections: [
				{
					label: 'A',
					bars: [
						bar({ repeatStart: true, timeSignature: { beats: 3, unit: 4 } }),
						bar(),
						bar({ ending: 1, repeatEnd: true }),
						bar({ ending: 2, timeSignature: { beats: 4, unit: 4 } })
					]
				},
				{ label: 'B', bars: [bar({ repeatStart: true, repeatEnd: true })] }
			]
		};

		const response = await save(app, tune.id, chart);

		expect(response.status).toBe(200);
		expect(await storedChart(app, tune.id)).toEqual(chart);
	});

	it('accepts a repeat spanning several sections', async () => {
		const { app, tune } = await newTune();
		const chart = {
			sections: [
				{ label: 'A', bars: [bar({ repeatStart: true })] },
				{ label: 'B', bars: [bar({ repeatEnd: true })] }
			]
		};

		expect((await save(app, tune.id, chart)).status).toBe(200);
	});

	it.each([
		['an unmatched repeat end', [bar(), bar({ repeatEnd: true })]],
		['an unclosed repeat start', [bar({ repeatStart: true }), bar()]],
		[
			'nested repeats',
			[bar({ repeatStart: true }), bar({ repeatStart: true }), bar({ repeatEnd: true })]
		],
		['an ending without a repeat', [bar({ ending: 1 }), bar({ ending: 2 })]],
		[
			'a 1st ending without a 2nd',
			[bar({ repeatStart: true }), bar({ ending: 1, repeatEnd: true }), bar()]
		],
		[
			'a 1st ending at the end of the chart',
			[bar({ repeatStart: true }), bar({ ending: 1, repeatEnd: true })]
		],
		[
			'a 2nd ending without a 1st',
			[bar({ repeatStart: true }), bar({ repeatEnd: true }), bar({ ending: 2 })]
		],
		[
			'a 1st ending that does not close the repeat',
			[bar({ repeatStart: true }), bar({ ending: 1 }), bar({ ending: 2 })]
		],
		[
			'a repeat end in the middle of a 1st ending',
			[
				bar({ repeatStart: true }),
				bar({ ending: 1, repeatEnd: true }),
				bar({ ending: 1, repeatEnd: true }),
				bar({ ending: 2 })
			]
		],
		[
			'a repeat end on a 2nd ending',
			[
				bar({ repeatStart: true }),
				bar({ ending: 1, repeatEnd: true }),
				bar({ ending: 2, repeatEnd: true })
			]
		],
		[
			'a repeat start on an ending',
			[
				bar({ repeatStart: true }),
				bar({ ending: 1, repeatEnd: true }),
				bar({ ending: 2, repeatStart: true })
			]
		],
		['an unknown ending number', [bar({ repeatStart: true }), bar({ ending: 3, repeatEnd: true })]],
		['a non-boolean repeat flag', [bar({ repeatStart: 'yes' })]]
	])('rejects %s and leaves the stored chart untouched', async (_name, bars) => {
		const { app, tune } = await newTune();
		await save(app, tune.id, validChart);

		const response = await save(app, tune.id, { sections: [{ label: 'A', bars }] });

		expect(response.status).toBe(400);
		expect(((await response.json()) as TuneJson).error).toBeTruthy();
		expect(await storedChart(app, tune.id)).toEqual(validChart);
	});

	it('lets bars inherit a time signature across sections and validates beats against it', async () => {
		const { app, tune } = await newTune();
		const threeFour = { beats: 3, unit: 4 };
		const waltz = (beat: number) => ({
			sections: [
				{ label: 'A', bars: [bar({ timeSignature: threeFour })] },
				{ label: 'B', bars: [{ chords: [{ beat, symbol: 'G7' }] }] }
			]
		});

		const onBeatThree = await save(app, tune.id, waltz(3));
		const onBeatFour = await save(app, tune.id, waltz(4));

		expect(onBeatThree.status).toBe(200);
		expect(onBeatFour.status).toBe(400);
		expect(((await onBeatFour.json()) as TuneJson).error).toMatch(/Section 2 \(B\), bar 1.*beat/);
	});

	it('returns to 4/4 beat range when no time signature is set', async () => {
		const { app, tune } = await newTune();
		const chart = { sections: [{ label: 'A', bars: [{ chords: [{ beat: 4, symbol: 'C' }] }] }] };

		expect((await save(app, tune.id, chart)).status).toBe(200);
	});

	it.each([
		['zero beats', { beats: 0, unit: 4 }],
		['too many beats', { beats: 13, unit: 4 }],
		['fractional beats', { beats: 2.5, unit: 4 }],
		['an unsupported unit', { beats: 4, unit: 3 }],
		['a non-object', '4/4']
	])('rejects a time signature with %s', async (_name, timeSignature) => {
		const { app, tune } = await newTune();

		const response = await save(app, tune.id, {
			sections: [{ label: 'A', bars: [bar({ timeSignature })] }]
		});

		expect(response.status).toBe(400);
	});

	it('reorders and removes bars and sections by saving the new arrangement', async () => {
		const { app, tune } = await newTune();
		await save(app, tune.id, validChart);
		const reordered = {
			sections: [
				{ label: 'Coda', bars: [bar()] },
				{ label: 'A', bars: [validChart.sections[0].bars[2], validChart.sections[0].bars[0]] }
			]
		};

		const response = await save(app, tune.id, reordered);

		expect(response.status).toBe(200);
		expect(await storedChart(app, tune.id)).toEqual(reordered);
	});
});

describe('key centers', () => {
	const bars = (count: number) => Array.from({ length: count }, () => ({ chords: [] }));

	async function save(app: ReturnType<typeof createTestApp>, id: string, chart: unknown) {
		return saveSourceChart(jsonRequest(`/api/tunes/${id}/chart`, 'PUT', { chart }), app.deps, id);
	}

	async function storedChart(app: ReturnType<typeof createTestApp>, id: string) {
		const stored = (await getTune(app.deps, id).then((r) => r.json())) as TuneJson;
		return stored.sourceChart;
	}

	const chartWith = (keyCenters: unknown) => ({
		sections: [
			{ label: 'A', bars: bars(4) },
			{ label: 'B', bars: bars(4) }
		],
		keyCenters
	});

	it('round-trips key centers, spanning sections, with gaps allowed', async () => {
		const { app, tune } = await newTune();
		const chart = chartWith([
			{ startBar: 1, endBar: 3, tonic: 'C', mode: 'major' },
			{ startBar: 6, endBar: 8, tonic: 'F#', mode: 'minor' }
		]);

		const response = await save(app, tune.id, chart);

		expect(response.status).toBe(200);
		expect(await storedChart(app, tune.id)).toEqual(chart);
	});

	it('sorts key centers by start bar', async () => {
		const { app, tune } = await newTune();

		await save(
			app,
			tune.id,
			chartWith([
				{ startBar: 5, endBar: 8, tonic: 'Bb', mode: 'major' },
				{ startBar: 1, endBar: 4, tonic: 'G', mode: 'minor' }
			])
		);

		const stored = await storedChart(app, tune.id);
		expect(stored.keyCenters?.map((k) => k.tonic)).toEqual(['G', 'Bb']);
	});

	it('accepts a chart without key centers and omits an empty list', async () => {
		const { app, tune } = await newTune();

		expect((await save(app, tune.id, chartWith([]))).status).toBe(200);

		expect((await storedChart(app, tune.id)).keyCenters).toBeUndefined();
	});

	it.each([
		[
			'overlapping spans',
			[
				{ startBar: 1, endBar: 4, tonic: 'C', mode: 'major' },
				{ startBar: 4, endBar: 6, tonic: 'G', mode: 'major' }
			]
		],
		['a span past the last bar', [{ startBar: 5, endBar: 9, tonic: 'C', mode: 'major' }]],
		['a span starting before bar 1', [{ startBar: 0, endBar: 2, tonic: 'C', mode: 'major' }]],
		['an end before the start', [{ startBar: 4, endBar: 2, tonic: 'C', mode: 'major' }]],
		['a fractional bar', [{ startBar: 1.5, endBar: 2, tonic: 'C', mode: 'major' }]],
		['an invalid tonic', [{ startBar: 1, endBar: 2, tonic: 'H', mode: 'major' }]],
		['a minor-suffixed tonic', [{ startBar: 1, endBar: 2, tonic: 'Am', mode: 'minor' }]],
		['an unknown mode', [{ startBar: 1, endBar: 2, tonic: 'C', mode: 'dorian' }]],
		['a non-list', { startBar: 1, endBar: 2, tonic: 'C', mode: 'major' }]
	])('rejects %s and leaves the stored chart untouched', async (_name, keyCenters) => {
		const { app, tune } = await newTune();
		await save(app, tune.id, validChart);

		const response = await save(app, tune.id, chartWith(keyCenters));

		expect(response.status).toBe(400);
		expect(((await response.json()) as TuneJson).error).toBeTruthy();
		expect(await storedChart(app, tune.id)).toEqual(validChart);
	});

	it('rejects removing bars that leave a key center out of range', async () => {
		const { app, tune } = await newTune();
		const full = chartWith([{ startBar: 5, endBar: 8, tonic: 'C', mode: 'major' }]);
		await save(app, tune.id, full);

		const shorter = { ...full, sections: [{ label: 'A', bars: bars(4) }] };

		expect((await save(app, tune.id, shorter)).status).toBe(400);
		expect(await storedChart(app, tune.id)).toEqual(full);
	});

	it('cannot be changed while Verified', async () => {
		const { app, tune } = await newTune();
		const chart = chartWith([{ startBar: 1, endBar: 4, tonic: 'C', mode: 'major' }]);
		await save(app, tune.id, chart);
		await markChartVerified(app.deps, tune.id);

		const response = await save(app, tune.id, chartWith([]));

		expect(response.status).toBe(409);
		expect(await storedChart(app, tune.id)).toEqual(chart);
	});
});
