import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import type { Chart } from '#lib/chart.js';
import { exportArchive, importArchive } from '#lib/server/archive.js';
import { generateSimplifiedChart } from '#lib/server/generation.js';
import { logPracticeSession } from '#lib/server/rotation.js';
import { createRule } from '#lib/server/rules.js';
import { getScanPage, importTune } from '#lib/server/scans.js';
import { createSimplifiedChart } from '#lib/server/simplified-charts.js';
import { markChartVerified, saveSourceChart } from '#lib/server/tunes.js';
import { readZip, writeZip } from '#lib/server/zip.js';
import { createTestApp, jsonRequest, type TestApp } from './support/app';
import { page, rowCount, uploadRequest } from './support/scan-upload';

const chart: Chart = {
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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function json<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

async function seed(app: TestApp, title: string) {
	app.ai.willExtract({ title, composer: 'Kosma', key: 'Gm', chart });
	const { id } = await json<{ id: string }>(
		await importTune(uploadRequest([page(`${title}-0`), page(`${title}-1`, 'image/png')]), app.deps)
	);
	await saveSourceChart(jsonRequest(`/api/tunes/${id}/chart`, 'PUT', { chart }), app.deps, id);
	await markChartVerified(app.deps, id);
	return id;
}

async function populate(app: TestApp) {
	const id = await seed(app, 'Autumn Leaves');
	await seed(app, 'Solar');
	const { id: ruleId } = await json<{ id: string }>(
		await createRule(
			jsonRequest('/api/rules', 'POST', { name: 'Collapse', text: 'II V is V' }),
			app.deps
		)
	);
	app.ai.willGenerate({ chart, changes: [{ bar: 1, reason: 'shared' }] });
	await generateSimplifiedChart(
		jsonRequest(`/api/tunes/${id}/generate`, 'POST', { name: 'Generated', ruleIds: [ruleId] }),
		app.deps,
		id
	);
	await createSimplifiedChart(
		jsonRequest(`/api/tunes/${id}/simplified-charts`, 'POST', { name: 'By hand' }),
		app.deps,
		id
	);
	await logPracticeSession(
		jsonRequest(`/api/tunes/${id}/sessions`, 'POST', { rating: 'solid' }),
		app.deps,
		id
	);
	await env.DB.exec("UPDATE simplified_charts SET archived_at = 5 WHERE name = 'By hand'");
	return id;
}

async function exported(app: TestApp) {
	const bytes = new Uint8Array(await (await exportArchive(app.deps)).arrayBuffer());
	const files = readZip(bytes);
	if ('error' in files) throw new Error(files.error);
	const manifest = JSON.parse(decoder.decode(files.value.get('manifest.json'))) as Record<
		string,
		unknown
	>;
	return { bytes, files: files.value, manifest };
}

function putArchive(bytes: Uint8Array, confirmed = true): Request {
	return new Request(
		`https://woodshed.test/api/archive${confirmed ? '?confirmReplace=true' : ''}`,
		{
			method: 'PUT',
			body: bytes as Uint8Array<ArrayBuffer>
		}
	);
}

function zipOf(entries: { name: string; data: Uint8Array }[]) {
	const zip = writeZip(entries);
	if ('error' in zip) throw new Error(zip.error);
	return zip.value;
}

function archiveWith(manifest: unknown, extra: { name: string; data: Uint8Array }[] = []) {
	return zipOf([
		{ name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest)) },
		...extra
	]);
}

async function snapshot() {
	const tables = ['tunes', 'simplified_charts', 'practice_sessions', 'rules'];
	const rows = await Promise.all(
		tables.map((t) => env.DB.prepare(`SELECT * FROM ${t} ORDER BY id`).all())
	);
	const { objects } = await env.SCANS.list();
	return { rows: rows.map((r) => r.results), keys: objects.map((o) => o.key).sort() };
}

async function resetAll() {
	await env.DB.exec('DELETE FROM tunes');
	await env.DB.exec('DELETE FROM rules');
	const { objects } = await env.SCANS.list();
	if (objects.length) await env.SCANS.delete(objects.map((o) => o.key));
}

beforeEach(resetAll);

describe('export', () => {
	it('downloads one zip holding the manifest and every Scan page', async () => {
		const app = createTestApp();
		const id = await populate(app);

		const response = await exportArchive(app.deps);

		expect(response.headers.get('content-type')).toBe('application/zip');
		expect(response.headers.get('content-disposition')).toMatch(
			/^attachment; filename="woodshed-.*\.zip"$/
		);
		const { files, manifest } = await exported(app);
		expect([...files.keys()].sort()).toEqual(
			['manifest.json']
				.concat([id].flatMap((i) => [`scans/${i}/0`, `scans/${i}/1`]))
				.concat(
					(manifest.tunes as { id: string }[])
						.filter((t) => t.id !== id)
						.flatMap((t) => [`scans/${t.id}/0`, `scans/${t.id}/1`])
				)
				.sort()
		);
		expect(decoder.decode(files.get(`scans/${id}/0`))).toBe('Autumn Leaves-0');
		expect(manifest).toMatchObject({ format: 'woodshed-archive', version: 1 });
		expect(manifest.tunes).toHaveLength(2);
		expect(manifest.simplifiedCharts).toHaveLength(2);
		expect(manifest.practiceSessions).toHaveLength(1);
		expect(manifest.rules).toHaveLength(1);
	});

	it('exports an empty library', async () => {
		const { manifest } = await exported(createTestApp());

		expect(manifest).toMatchObject({
			tunes: [],
			simplifiedCharts: [],
			practiceSessions: [],
			rules: []
		});
	});
});

describe('import', () => {
	it('round-trips: export, wipe, import, export gives identical data and Scans', async () => {
		const app = createTestApp();
		const id = await populate(app);
		const before = await exported(app);

		await resetAll();
		const response = await importArchive(putArchive(before.bytes), app.deps);

		expect(response.status).toBe(204);
		const after = await exported(app);
		expect(after.manifest).toEqual(before.manifest);
		expect([...after.files.keys()].sort()).toEqual([...before.files.keys()].sort());
		for (const [name, data] of before.files) expect(after.files.get(name)).toEqual(data);
		const served = await getScanPage(app.deps, id, '1');
		expect(served.headers.get('content-type')).toBe('image/png');
		expect(await served.text()).toBe('Autumn Leaves-1');
	});

	it('replaces all current data and removes old Scans', async () => {
		const app = createTestApp();
		await populate(app);
		const { bytes } = await exported(app);
		const keptId = await seed(app, 'Extra Tune');
		await createRule(jsonRequest('/api/rules', 'POST', { name: 'Extra', text: 'x' }), app.deps);

		await importArchive(putArchive(bytes), app.deps);

		const { manifest, files } = await exported(app);
		expect((manifest.tunes as { id: string }[]).map((t) => t.id)).not.toContain(keptId);
		expect(manifest.rules).toHaveLength(1);
		expect(await rowCount('tunes')).toBe(2);
		expect([...files.keys()].filter((k) => k.startsWith('scans/'))).toHaveLength(4);
		const { objects } = await env.SCANS.list();
		expect(objects).toHaveLength(4);
	});

	it('keeps Scans of a Tune present in both current data and the archive', async () => {
		const app = createTestApp();
		const id = await populate(app);
		const { bytes } = await exported(app);

		await importArchive(putArchive(bytes), app.deps);
		await importArchive(putArchive(bytes), app.deps);

		expect(await (await getScanPage(app.deps, id, '0')).text()).toBe('Autumn Leaves-0');
		expect((await env.SCANS.list()).objects).toHaveLength(4);
	});

	it('asks for confirmation with a summary and changes nothing without it', async () => {
		const app = createTestApp();
		await populate(app);
		const { bytes } = await exported(app);
		await seed(app, 'Extra Tune');
		const before = await snapshot();

		const response = await importArchive(putArchive(bytes, false), app.deps);

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			tunes: 2,
			simplifiedCharts: 2,
			practiceSessions: 1,
			rules: 1
		});
		expect(await snapshot()).toEqual(before);
	});

	describe('rejects without touching existing data', () => {
		async function expectRejected(app: TestApp, bytes: Uint8Array) {
			await populate(app);
			const before = await snapshot();

			const response = await importArchive(putArchive(bytes), app.deps);

			expect(response.status).toBe(422);
			expect(((await response.json()) as { error: string }).error).toBeTruthy();
			expect(await snapshot()).toEqual(before);
		}

		const emptyManifest = {
			format: 'woodshed-archive',
			version: 1,
			exportedAt: '2026-01-01T00:00:00.000Z',
			tunes: [],
			simplifiedCharts: [],
			practiceSessions: [],
			rules: []
		};

		it('a file that is not a zip', async () => {
			await expectRejected(createTestApp(), encoder.encode('definitely not a zip file at all'));
		});

		it('a zip without a manifest', async () => {
			await expectRejected(createTestApp(), zipOf([{ name: 'x', data: encoder.encode('x') }]));
		});

		it('a manifest that is not JSON', async () => {
			await expectRejected(
				createTestApp(),
				zipOf([{ name: 'manifest.json', data: encoder.encode('{oops') }])
			);
		});

		it('an incompatible version', async () => {
			await expectRejected(createTestApp(), archiveWith({ ...emptyManifest, version: 2 }));
		});

		it('a foreign format', async () => {
			await expectRejected(createTestApp(), archiveWith({ ...emptyManifest, format: 'other' }));
		});

		it('an invalid chart', async () => {
			const app = createTestApp();
			await populate(app);
			const { manifest, files } = await exported(app);
			const tunes = structuredClone(manifest.tunes) as { sourceChart: unknown }[];
			tunes[0].sourceChart = { sections: [] };
			const bytes = archiveWith(
				{ ...manifest, tunes },
				[...files]
					.filter(([name]) => name !== 'manifest.json')
					.map(([name, data]) => ({ name, data }))
			);
			const before = await snapshot();

			const response = await importArchive(putArchive(bytes), app.deps);

			expect(response.status).toBe(422);
			expect(await snapshot()).toEqual(before);
		});

		it('a missing Scan file', async () => {
			const app = createTestApp();
			await populate(app);
			const { manifest } = await exported(app);
			const before = await snapshot();

			const response = await importArchive(putArchive(archiveWith(manifest)), app.deps);

			expect(response.status).toBe(422);
			expect(await snapshot()).toEqual(before);
		});

		it('a Practice Session of an unknown Tune', async () => {
			const session = {
				id: 's',
				tuneId: 'nope',
				practicedOn: '2026-01-01',
				rating: 'ok',
				chart: null,
				createdAt: 1
			};
			await expectRejected(
				createTestApp(),
				archiveWith({ ...emptyManifest, practiceSessions: [session] })
			);
		});
	});
});
