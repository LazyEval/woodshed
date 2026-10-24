import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
	createTune,
	deleteTune,
	getTune,
	markChartVerified,
	reopenSourceChart
} from '#lib/server/tunes.js';
import {
	deletePracticeSession,
	listDueTunes,
	listPracticeSessions,
	logPracticeSession,
	shelveTune,
	unshelveTune
} from '#lib/server/rotation.js';
import { createTestApp, jsonRequest, type TestApp } from './support/app';

interface RotationJson {
	shelved: boolean;
	dueOn: string | null;
	lastPracticedOn: string | null;
	lastRating: string | null;
}

async function verifiedTune(app: TestApp, title = 'Autumn Leaves') {
	const created = await createTune(jsonRequest('/api/tunes', 'POST', { title }), app.deps);
	const { id } = (await created.json()) as { id: string };
	await markChartVerified(app.deps, id);
	return id;
}

function log(app: TestApp, tuneId: string, body: object) {
	return logPracticeSession(
		jsonRequest(`/api/tunes/${tuneId}/sessions`, 'POST', body),
		app.deps,
		tuneId
	);
}

interface SessionJson {
	id: string;
	practicedOn: string;
	rating: string;
	chart: string | null;
}

async function sessionsOf(app: TestApp, tuneId: string): Promise<SessionJson[]> {
	return (await listPracticeSessions(app.deps, tuneId).then((r) => r.json())) as SessionJson[];
}

async function rotationOf(app: TestApp, tuneId: string): Promise<RotationJson> {
	return (await getTune(app.deps, tuneId).then((r) => r.json())) as RotationJson;
}

const DAY = 24 * 60 * 60 * 1000;

interface DueJson {
	id: string;
	title: string;
	dueOn: string;
	dueForDays: number;
	lastPracticedOn: string | null;
	lastRating: string | null;
}

async function dueList(app: TestApp): Promise<DueJson[]> {
	return (await listDueTunes(app.deps).then((r) => r.json())) as DueJson[];
}

beforeEach(async () => {
	await env.DB.exec('DELETE FROM tunes');
});

describe('practice sessions', () => {
	it('logs a Practice Session for today and schedules the next Due date from its Rating', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);

		const response = await log(app, id, { rating: 'ok' });

		expect(response.status).toBe(201);
		expect(await rotationOf(app, id)).toMatchObject({
			lastPracticedOn: '2026-01-01',
			lastRating: 'ok',
			dueOn: '2026-01-04'
		});
	});

	it('404s when logging on an unknown tune', async () => {
		const response = await log(createTestApp(), 'nope', { rating: 'ok' });

		expect(response.status).toBe(404);
	});

	it.each([
		['a missing rating', {}],
		['an unknown rating', { rating: 'great' }],
		['a malformed date', { rating: 'ok', practicedOn: '2025-1-5' }],
		['an impossible date', { rating: 'ok', practicedOn: '2025-02-30' }],
		['a future date', { rating: 'ok', practicedOn: '2026-01-02' }],
		['a non-text chart', { rating: 'ok', chart: 3 }]
	])('rejects %s', async (_name, body) => {
		const app = createTestApp();
		const id = await verifiedTune(app);

		const response = await log(app, id, body);

		expect(response.status).toBe(400);
		expect(((await response.json()) as { error: string }).error).toBeTruthy();
		expect(await rotationOf(app, id)).toMatchObject({ lastPracticedOn: null });
	});
});

describe('practice session history', () => {
	it('lists sessions newest first, with the chart practiced from', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);
		await log(app, id, { practicedOn: '2025-12-01', rating: 'shaky', chart: ' Source Chart ' });
		await log(app, id, { practicedOn: '2025-12-20', rating: 'solid' });
		await log(app, id, { practicedOn: '2025-12-10', rating: 'ok', chart: '' });

		const sessions = await sessionsOf(app, id);

		expect(sessions).toMatchObject([
			{ practicedOn: '2025-12-20', rating: 'solid', chart: null },
			{ practicedOn: '2025-12-10', rating: 'ok', chart: null },
			{ practicedOn: '2025-12-01', rating: 'shaky', chart: 'Source Chart' }
		]);
	});

	it('404s when listing sessions of an unknown tune', async () => {
		expect((await listPracticeSessions(createTestApp().deps, 'nope')).status).toBe(404);
	});

	it('deletes a session and recomputes the schedule from the remaining history', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);
		await log(app, id, { practicedOn: '2025-12-01', rating: 'solid' });
		const mistake = (await (
			await log(app, id, { practicedOn: '2025-12-08', rating: 'shaky' })
		).json()) as SessionJson;

		const response = await deletePracticeSession(app.deps, id, mistake.id);

		expect(response.status).toBe(204);
		expect((await sessionsOf(app, id)).map((s) => s.practicedOn)).toEqual(['2025-12-01']);
		expect(await rotationOf(app, id)).toMatchObject({
			lastPracticedOn: '2025-12-01',
			lastRating: 'solid',
			dueOn: '2025-12-08'
		});
	});

	it('deletes a tune together with its sessions', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);
		await log(app, id, { rating: 'ok' });

		expect((await deleteTune(app.deps, id)).status).toBe(204);
		expect(await dueList(app)).toEqual([]);
	});

	it("404s when deleting an unknown session or another tune's session", async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);
		const other = await verifiedTune(app, 'Blue Bossa');
		const session = (await (await log(app, id, { rating: 'ok' })).json()) as SessionJson;

		expect((await deletePracticeSession(app.deps, id, 'nope')).status).toBe(404);
		expect((await deletePracticeSession(app.deps, other, session.id)).status).toBe(404);
		expect(await sessionsOf(app, id)).toHaveLength(1);
	});

	it('deleting the last session makes the tune Due from its verification again', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);
		const session = (await (await log(app, id, { rating: 'solid' })).json()) as SessionJson;

		await deletePracticeSession(app.deps, id, session.id);

		expect(await rotationOf(app, id)).toMatchObject({
			lastPracticedOn: null,
			lastRating: null,
			dueOn: '2026-01-01'
		});
	});
});

describe('scheduler', () => {
	it.each([
		['shaky first', [['2025-12-01', 'shaky']], '2025-12-02'],
		['ok first', [['2025-12-01', 'ok']], '2025-12-04'],
		['solid first', [['2025-12-01', 'solid']], '2025-12-08'],
		[
			'ok grows the interval by 1.5',
			[
				['2025-12-01', 'ok'],
				['2025-12-04', 'ok']
			],
			'2025-12-09'
		],
		[
			'solid grows the interval by the ease',
			[
				['2025-12-01', 'solid'],
				['2025-12-08', 'solid']
			],
			'2025-12-26'
		],
		[
			'shaky resets to one day and lowers the ease',
			[
				['2025-12-01', 'solid'],
				['2025-12-08', 'shaky'],
				['2025-12-09', 'solid']
			],
			'2025-12-11'
		],
		[
			'ease never drops below its floor',
			[
				['2025-11-01', 'shaky'],
				...Array.from({ length: 8 }, () => ['2025-11-02', 'shaky']),
				['2025-11-03', 'solid'],
				['2025-11-04', 'solid']
			],
			'2025-11-06'
		],
		[
			'sessions replay in date order, not logging order',
			[
				['2025-12-10', 'ok'],
				['2025-12-01', 'shaky']
			],
			'2025-12-12'
		]
	])('%s', async (_name, sessions, dueOn) => {
		const app = createTestApp();
		const id = await verifiedTune(app);

		for (const [practicedOn, rating] of sessions) {
			expect((await log(app, id, { practicedOn, rating })).status).toBe(201);
		}

		expect((await rotationOf(app, id)).dueOn).toBe(dueOn);
	});

	it('reports the latest session by date as last practiced', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);

		await log(app, id, { practicedOn: '2025-12-10', rating: 'solid' });
		await log(app, id, { practicedOn: '2025-12-01', rating: 'shaky' });

		expect(await rotationOf(app, id)).toMatchObject({
			lastPracticedOn: '2025-12-10',
			lastRating: 'solid'
		});
	});
});

describe('due list', () => {
	it('lists a newly Verified tune as Due immediately', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);

		expect(await dueList(app)).toEqual([
			{
				id,
				title: 'Autumn Leaves',
				composer: null,
				key: null,
				dueOn: '2026-01-01',
				dueForDays: 0,
				lastPracticedOn: null,
				lastRating: null
			}
		]);
	});

	it('leaves out tunes whose Source Chart was never Verified', async () => {
		const app = createTestApp();
		await createTune(jsonRequest('/api/tunes', 'POST', { title: 'Draft Blues' }), app.deps);

		expect(await dueList(app)).toEqual([]);
	});

	it('gives a practiced tune no Due date until its Source Chart is Verified', async () => {
		const app = createTestApp();
		const created = await createTune(
			jsonRequest('/api/tunes', 'POST', { title: 'Draft Blues' }),
			app.deps
		);
		const { id } = (await created.json()) as { id: string };

		await log(app, id, { rating: 'shaky', practicedOn: '2025-12-01' });

		expect(await rotationOf(app, id)).toMatchObject({
			lastPracticedOn: '2025-12-01',
			dueOn: null
		});
		expect(await dueList(app)).toEqual([]);
	});

	it('keeps a reopened tune in rotation, Due from its first verification', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);
		app.clock.advance(5 * DAY);
		await reopenSourceChart(app.deps, id);
		await markChartVerified(app.deps, id);

		expect(await dueList(app)).toMatchObject([{ id, dueOn: '2026-01-01', dueForDays: 5 }]);
	});

	it('drops a practiced tune until its next Due date arrives', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);
		await log(app, id, { rating: 'ok' });

		const justPracticed = await dueList(app);
		app.clock.advance(2 * DAY);
		const dayBefore = await dueList(app);
		app.clock.advance(DAY);
		const dueDay = await dueList(app);

		expect(justPracticed).toEqual([]);
		expect(dayBefore).toEqual([]);
		expect(dueDay).toMatchObject([
			{ id, dueOn: '2026-01-04', dueForDays: 0, lastPracticedOn: '2026-01-01', lastRating: 'ok' }
		]);
	});

	it('sorts by most overdue first, then by title, without a cap', async () => {
		const app = createTestApp();
		const titles = Array.from({ length: 30 }, (_, i) => `Tune ${String(i).padStart(2, '0')}`);
		const ids = [];
		for (const title of titles) ids.push(await verifiedTune(app, title));
		await log(app, ids[0], { practicedOn: '2025-12-01', rating: 'shaky' });
		await log(app, ids[1], { practicedOn: '2025-12-20', rating: 'shaky' });
		await log(app, ids[2], { practicedOn: '2025-12-31', rating: 'solid' });

		const due = await dueList(app);

		expect(due).toHaveLength(29);
		expect(due.slice(0, 3)).toMatchObject([
			{ title: 'Tune 00', dueForDays: 30 },
			{ title: 'Tune 01', dueForDays: 11 },
			{ title: 'Tune 03', dueForDays: 0 }
		]);
		expect(due.at(-1)).toMatchObject({ title: 'Tune 29' });
	});

	it('uses calendar dates in the configured time zone', async () => {
		const app = createTestApp({ timeZone: 'America/New_York' });
		app.clock.advance(-2 * 60 * 60 * 1000);
		const id = await verifiedTune(app);

		await log(app, id, { rating: 'shaky' });
		const localTomorrow = await log(app, id, { rating: 'ok', practicedOn: '2026-01-01' });

		expect(localTomorrow.status).toBe(400);
		expect(await rotationOf(app, id)).toMatchObject({
			lastPracticedOn: '2025-12-31',
			dueOn: '2026-01-01'
		});
	});
});

describe('shelving', () => {
	it('starts Active and keeps a Shelved tune off the Due list', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);
		const before = await rotationOf(app, id);

		const response = await shelveTune(app.deps, id);

		expect(before.shelved).toBe(false);
		expect(response.status).toBe(200);
		expect((await rotationOf(app, id)).shelved).toBe(true);
		app.clock.advance(30 * DAY);
		expect(await dueList(app)).toEqual([]);
	});

	it('resumes the existing schedule when un-shelved', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);
		await log(app, id, { rating: 'solid' });
		await shelveTune(app.deps, id);
		app.clock.advance(10 * DAY);

		const response = await unshelveTune(app.deps, id);

		expect(response.status).toBe(200);
		expect(await rotationOf(app, id)).toMatchObject({ shelved: false, dueOn: '2026-01-08' });
		expect(await dueList(app)).toMatchObject([{ id, dueForDays: 3 }]);
	});

	it('reports no Due date while Shelved', async () => {
		const app = createTestApp();
		const id = await verifiedTune(app);
		await log(app, id, { rating: 'ok' });

		await shelveTune(app.deps, id);

		expect(await rotationOf(app, id)).toMatchObject({
			lastPracticedOn: '2026-01-01',
			dueOn: null
		});
	});

	it('404s when shelving or un-shelving an unknown tune', async () => {
		const app = createTestApp();

		expect((await shelveTune(app.deps, 'nope')).status).toBe(404);
		expect((await unshelveTune(app.deps, 'nope')).status).toBe(404);
	});
});
