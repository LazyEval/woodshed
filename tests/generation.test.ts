import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { createRule, updateRule, deleteRule } from '#lib/server/rules.js';
import { generateSimplifiedChart } from '#lib/server/generation.js';
import { updateSimplifiedChart } from '#lib/server/simplified-charts.js';
import { createTune, getTune, markChartVerified, saveSourceChart } from '#lib/server/tunes.js';
import type { Chart, GenerationRecord } from '#lib/chart.js';
import { createTestApp, jsonRequest, type TestApp } from './support/app';

interface GeneratedJson {
	id: string;
	name: string;
	origin: string;
	chart: Chart;
	generation: GenerationRecord | null;
	error?: string;
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

function aiOutput(firstBar: string, reasons = [{ bar: 1, reason: 'Shared II V' }]) {
	const chart = structuredClone(sourceChart);
	chart.sections[0].bars[0].chords = [{ beat: 1, symbol: firstBar }];
	delete chart.keyCenters;
	return { chart, changes: reasons };
}

async function tuneWith(app: TestApp, verified = true) {
	const created = await createTune(
		jsonRequest('/api/tunes', 'POST', { title: 'Leaves' }),
		app.deps
	);
	const { id } = (await created.json()) as { id: string };
	await saveSourceChart(
		jsonRequest(`/api/tunes/${id}/chart`, 'PUT', { chart: sourceChart }),
		app.deps,
		id
	);
	if (verified) await markChartVerified(app.deps, id);
	return id;
}

async function rule(app: TestApp, name = 'Collapse II V', text = 'II V becomes V') {
	const response = await createRule(jsonRequest('/api/rules', 'POST', { name, text }), app.deps);
	return ((await response.json()) as { id: string }).id;
}

async function generate(app: TestApp, tuneId: string, body: object) {
	const response = await generateSimplifiedChart(
		jsonRequest(`/api/tunes/${tuneId}/generate`, 'POST', body),
		app.deps,
		tuneId
	);
	return { response, chart: (await response.json()) as GeneratedJson };
}

async function savedCharts(app: TestApp, tuneId: string) {
	const tune = (await getTune(app.deps, tuneId).then((r) => r.json())) as {
		simplifiedCharts: GeneratedJson[];
	};
	return tune.simplifiedCharts;
}

beforeEach(async () => {
	await env.DB.exec('DELETE FROM tunes');
	await env.DB.exec('DELETE FROM rules');
});

describe('generation', () => {
	it('saves the AI overlay as a new generated Simplified Chart with snapshot and reasons', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);
		const ruleId = await rule(app);
		app.ai.willGenerate(aiOutput('G7'));

		const { response, chart } = await generate(app, tuneId, {
			name: 'Fewer changes',
			ruleIds: [ruleId],
			note: ' keep the turnaround '
		});

		expect(response.status).toBe(201);
		expect(chart).toMatchObject({
			name: 'Fewer changes',
			origin: 'generated',
			generation: {
				rules: [{ name: 'Collapse II V', text: 'II V becomes V' }],
				note: 'keep the turnaround',
				reasons: [{ barIndex: 0, reason: 'Shared II V' }]
			}
		});
		expect(chart.chart.sections[0].bars[0].chords).toEqual([{ beat: 1, symbol: 'G7' }]);
		expect(chart.chart.keyCenters).toEqual(sourceChart.keyCenters);
		expect(await savedCharts(app, tuneId)).toHaveLength(1);
	});

	it('hands the AI the Source Chart with Key Centers, Rule texts and note', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);
		const ruleId = await rule(app);
		app.ai.willGenerate(aiOutput('G7'));

		await generate(app, tuneId, { ruleIds: [ruleId], note: 'go easy' });

		expect(app.ai.generateRequests).toEqual([
			{
				source: sourceChart,
				rules: [{ name: 'Collapse II V', text: 'II V becomes V' }],
				note: 'go easy',
				model: 'sonnet'
			}
		]);
	});

	it('passes the chosen model and rejects unknown ones', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);
		app.ai.willGenerate(aiOutput('G7'));

		const chosen = await generate(app, tuneId, { note: 'x', model: 'opus' });
		const unknown = await generate(app, tuneId, { note: 'x', model: 'gpt' });

		expect(chosen.response.status).toBe(201);
		expect(app.ai.generateRequests.map((r) => r.model)).toEqual(['opus']);
		expect(unknown.response.status).toBe(400);
	});

	it('allows a note alone', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);
		app.ai.willGenerate(aiOutput('G7'));

		const { response, chart } = await generate(app, tuneId, { note: 'just thin it out' });

		expect(response.status).toBe(201);
		expect(chart.generation?.rules).toEqual([]);
	});

	it('requires a Verified Source Chart', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app, false);
		const ruleId = await rule(app);

		const { response } = await generate(app, tuneId, { ruleIds: [ruleId] });

		expect(response.status).toBe(409);
		expect(app.ai.generateRequests).toEqual([]);
	});

	it('requires at least one Rule or a note', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);

		const { response } = await generate(app, tuneId, { ruleIds: [], note: '  ' });

		expect(response.status).toBe(400);
		expect(app.ai.generateRequests).toEqual([]);
	});

	it('rejects unknown Rules', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);

		const { response } = await generate(app, tuneId, { ruleIds: ['nope'] });

		expect(response.status).toBe(400);
	});

	it('answers 404 for an unknown Tune', async () => {
		const app = createTestApp();

		const { response } = await generate(app, 'nope', { note: 'x' });

		expect(response.status).toBe(404);
	});

	it('keeps snapshots unchanged when a Rule is later edited or deleted', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);
		const ruleId = await rule(app);
		app.ai.willGenerate(aiOutput('G7'));
		await generate(app, tuneId, { ruleIds: [ruleId] });

		await updateRule(
			jsonRequest(`/api/rules/${ruleId}`, 'PUT', { name: 'Renamed', text: 'changed' }),
			app.deps,
			ruleId
		);
		await deleteRule(app.deps, ruleId);

		const [saved] = await savedCharts(app, tuneId);
		expect(saved.generation?.rules).toEqual([{ name: 'Collapse II V', text: 'II V becomes V' }]);
	});

	it('retries once with the problem when the grid differs, then saves', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);
		const wrongGrid = aiOutput('G7');
		wrongGrid.chart.sections[0].bars.forEach((bar) => {
			delete bar.repeatStart;
			delete bar.repeatEnd;
		});
		app.ai.willGenerate(wrongGrid, aiOutput('G7'));

		const { response } = await generate(app, tuneId, { note: 'x' });

		expect(response.status).toBe(201);
		expect(app.ai.generateRequests).toHaveLength(2);
		expect(app.ai.generateRequests[0].previousProblem).toBeUndefined();
		expect(app.ai.generateRequests[1].previousProblem).toMatch(/grid/i);
	});

	it('retries once on invalid chords, then fails with nothing saved', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);
		app.ai.willGenerate(aiOutput('Hm7'));

		const { response, chart } = await generate(app, tuneId, { note: 'x' });

		expect(response.status).toBe(422);
		expect(chart.error).toMatch(/Hm7/);
		expect(app.ai.generateRequests).toHaveLength(2);
		expect(await savedCharts(app, tuneId)).toEqual([]);
	});

	it('treats malformed reasons as invalid output', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);
		app.ai.willGenerate(aiOutput('G7', [{ bar: 9, reason: 'out of range' }]));

		const { response } = await generate(app, tuneId, { note: 'x' });

		expect(response.status).toBe(422);
		expect(await savedCharts(app, tuneId)).toEqual([]);
	});

	it('surfaces an AI failure without saving or retrying', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);
		app.ai.willGenerate(new Error('boom'));

		const { response } = await generate(app, tuneId, { note: 'x' });

		expect(response.status).toBe(502);
		expect(app.ai.generateRequests).toHaveLength(1);
		expect(await savedCharts(app, tuneId)).toEqual([]);
	});

	it('leaves the generated chart editable by hand', async () => {
		const app = createTestApp();
		const tuneId = await tuneWith(app);
		app.ai.willGenerate(aiOutput('G7'));
		const { chart } = await generate(app, tuneId, { note: 'x' });
		const edited = structuredClone(chart.chart);
		edited.sections[0].bars[1].chords = [{ beat: 1, symbol: 'C6' }];

		const response = await updateSimplifiedChart(
			jsonRequest(`/api/tunes/${tuneId}/simplified-charts/${chart.id}`, 'PUT', { chart: edited }),
			app.deps,
			tuneId,
			chart.id
		);

		expect(response.status).toBe(200);
		const [saved] = await savedCharts(app, tuneId);
		expect(saved.chart.sections[0].bars[1].chords[0].symbol).toBe('C6');
		expect(saved.generation?.reasons).toHaveLength(1);
	});
});
