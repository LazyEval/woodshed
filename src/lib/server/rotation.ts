import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { Result } from '#lib/result.js';
import {
	calendarDateIn,
	daysBetween,
	isCalendarDate,
	isPracticedChart,
	isRating,
	schedule,
	type CalendarDate,
	type DueTune,
	type PracticedChart,
	type Rating,
	type RotationStanding
} from '#lib/rotation.js';
import type { Deps } from '#lib/server/deps.js';
import { practiceSessions, tunes } from '#lib/server/db/schema.js';
import { jsonError, readBody, tuneNotFound } from '#lib/server/http.js';

interface NewPracticeSession {
	practicedOn: CalendarDate;
	rating: Rating;
	chart: PracticedChart | null;
}

export type TuneRow = typeof tunes.$inferSelect;

const practiceOrder = [asc(practiceSessions.practicedOn), asc(practiceSessions.createdAt)];

async function tuneExists(deps: Deps, tuneId: string): Promise<boolean> {
	const [found] = await deps.db.select({ id: tunes.id }).from(tunes).where(eq(tunes.id, tuneId));
	return found !== undefined;
}

const today = (deps: Deps) => calendarDateIn(deps.clock.now(), deps.timeZone);

function parseSession(
	body: Record<string, unknown>,
	today: CalendarDate
): Result<NewPracticeSession> {
	if (!isRating(body.rating)) return { error: 'Rating must be shaky, ok or solid.' };

	const practicedOn = body.practicedOn ?? today;
	if (!isCalendarDate(practicedOn)) return { error: 'Date must be a valid YYYY-MM-DD date.' };
	if (practicedOn > today) return { error: 'Date cannot be in the future.' };

	const chart = body.chart ?? null;
	if (chart !== null && !isPracticedChart(chart)) return { error: 'Chart must be "source".' };

	return { value: { practicedOn, rating: body.rating, chart } };
}

function sessionsOf(deps: Deps, tuneId: string) {
	return deps.db
		.select()
		.from(practiceSessions)
		.where(eq(practiceSessions.tuneId, tuneId))
		.orderBy(...practiceOrder);
}

function standingOf(deps: Deps, tune: Pick<TuneRow, 'verifiedAt' | 'shelved'>): RotationStanding {
	return {
		verifiedOn:
			tune.verifiedAt === null ? null : calendarDateIn(new Date(tune.verifiedAt), deps.timeZone),
		shelved: tune.shelved
	};
}

export async function scheduleOf(deps: Deps, tune: TuneRow) {
	return schedule(await sessionsOf(deps, tune.id), standingOf(deps, tune));
}

export async function listDueTunes(deps: Deps): Promise<Response> {
	const inRotation = and(isNotNull(tunes.verifiedAt), eq(tunes.shelved, false));
	const [rotating, sessions] = await Promise.all([
		deps.db
			.select({
				id: tunes.id,
				title: tunes.title,
				composer: tunes.composer,
				key: tunes.key,
				verifiedAt: tunes.verifiedAt,
				shelved: tunes.shelved
			})
			.from(tunes)
			.where(inRotation),
		deps.db
			.select({
				tuneId: practiceSessions.tuneId,
				practicedOn: practiceSessions.practicedOn,
				rating: practiceSessions.rating
			})
			.from(practiceSessions)
			.innerJoin(tunes, eq(practiceSessions.tuneId, tunes.id))
			.where(inRotation)
			.orderBy(...practiceOrder)
	]);

	const sessionsByTune = Map.groupBy(sessions, (session) => session.tuneId);
	const now = today(deps);
	const due = rotating.flatMap(({ verifiedAt, shelved, ...tune }): DueTune[] => {
		const { dueOn, ...last } = schedule(
			sessionsByTune.get(tune.id) ?? [],
			standingOf(deps, { verifiedAt, shelved })
		);
		if (dueOn === null || dueOn > now) return [];
		return [{ ...tune, ...last, dueOn, dueForDays: daysBetween(dueOn, now) }];
	});
	due.sort((a, b) => b.dueForDays - a.dueForDays || a.title.localeCompare(b.title));
	return Response.json(due);
}

export async function logPracticeSession(
	request: Request,
	deps: Deps,
	tuneId: string
): Promise<Response> {
	const body = await readBody(request);
	if ('error' in body) return jsonError(body.error, 400);
	const fields = parseSession(body.value, today(deps));
	if ('error' in fields) return jsonError(fields.error, 400);
	if (!(await tuneExists(deps, tuneId))) return tuneNotFound();

	const [session] = await deps.db
		.insert(practiceSessions)
		.values({
			id: crypto.randomUUID(),
			tuneId,
			...fields.value,
			createdAt: deps.clock.now().getTime()
		})
		.returning();
	return Response.json(session, { status: 201 });
}

export async function listPracticeSessions(deps: Deps, tuneId: string): Promise<Response> {
	if (!(await tuneExists(deps, tuneId))) return tuneNotFound();
	return Response.json((await sessionsOf(deps, tuneId)).toReversed());
}

export async function deletePracticeSession(
	deps: Deps,
	tuneId: string,
	sessionId: string
): Promise<Response> {
	const deleted = await deps.db
		.delete(practiceSessions)
		.where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.tuneId, tuneId)))
		.returning({ id: practiceSessions.id });
	return deleted.length
		? new Response(null, { status: 204 })
		: jsonError('Practice Session not found.', 404);
}
