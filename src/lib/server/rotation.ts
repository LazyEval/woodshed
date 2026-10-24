import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import type { Result } from '#lib/result.js';
import {
	calendarDateIn,
	daysBetween,
	isCalendarDate,
	isRating,
	rotation,
	type CalendarDate,
	type Rating,
	type Rotation
} from '#lib/rotation.js';
import type { Deps } from '#lib/server/deps.js';
import { practiceSessions, tunes } from '#lib/server/db/schema.js';
import { jsonError, readBody } from '#lib/server/http.js';

const MAX_CHART_NAME_LENGTH = 200;

interface NewPracticeSession {
	practicedOn: CalendarDate;
	rating: Rating;
	chart: string | null;
}

type TuneRow = typeof tunes.$inferSelect;

const tuneNotFound = () => jsonError('Tune not found.', 404);

async function tuneExists(deps: Deps, tuneId: string): Promise<boolean> {
	const [found] = await deps.db.select({ id: tunes.id }).from(tunes).where(eq(tunes.id, tuneId));
	return found !== undefined;
}

const today = (deps: Deps) => calendarDateIn(deps.clock.now(), deps.timeZone);

function parseSession(body: Record<string, unknown>, deps: Deps): Result<NewPracticeSession> {
	if (!isRating(body.rating)) return { error: 'Rating must be shaky, ok or solid.' };

	const practicedOn = body.practicedOn ?? today(deps);
	if (!isCalendarDate(practicedOn)) return { error: 'Date must be a valid YYYY-MM-DD date.' };
	if (practicedOn > today(deps)) return { error: 'Date cannot be in the future.' };

	const chart = body.chart ?? null;
	if (chart !== null && typeof chart !== 'string') return { error: 'Chart must be text.' };
	if (chart && chart.trim().length > MAX_CHART_NAME_LENGTH) return { error: 'Chart is too long.' };

	return { value: { practicedOn, rating: body.rating, chart: chart?.trim() || null } };
}

function sessionsOf(deps: Deps, tuneId: string) {
	return deps.db
		.select()
		.from(practiceSessions)
		.where(eq(practiceSessions.tuneId, tuneId))
		.orderBy(asc(practiceSessions.practicedOn), asc(practiceSessions.createdAt));
}

function verifiedOn(deps: Deps, verifiedAt: number | null): CalendarDate | null {
	return verifiedAt === null ? null : calendarDateIn(new Date(verifiedAt), deps.timeZone);
}

export async function rotationOf(deps: Deps, tune: TuneRow): Promise<Rotation> {
	return rotation(await sessionsOf(deps, tune.id), verifiedOn(deps, tune.verifiedAt));
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
				verifiedAt: tunes.verifiedAt
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
			.orderBy(asc(practiceSessions.practicedOn), asc(practiceSessions.createdAt))
	]);

	const sessionsByTune = Map.groupBy(sessions, (session) => session.tuneId);
	const now = today(deps);
	const due = rotating.flatMap(({ verifiedAt, ...tune }) => {
		const schedule = rotation(sessionsByTune.get(tune.id) ?? [], verifiedOn(deps, verifiedAt));
		if (schedule.dueOn === null || schedule.dueOn > now) return [];
		return [
			{ ...tune, ...schedule, dueOn: schedule.dueOn, daysOverdue: daysBetween(schedule.dueOn, now) }
		];
	});
	due.sort((a, b) => b.daysOverdue - a.daysOverdue || a.title.localeCompare(b.title));
	return Response.json(due);
}

export async function logPracticeSession(
	request: Request,
	deps: Deps,
	tuneId: string
): Promise<Response> {
	const body = await readBody(request);
	if ('error' in body) return jsonError(body.error, 400);
	const fields = parseSession(body.value, deps);
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
	const sessions = await deps.db
		.select()
		.from(practiceSessions)
		.where(eq(practiceSessions.tuneId, tuneId))
		.orderBy(desc(practiceSessions.practicedOn), desc(practiceSessions.createdAt));
	return Response.json(sessions);
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

async function setShelved(deps: Deps, tuneId: string, shelved: boolean): Promise<Response> {
	const [tune] = await deps.db
		.update(tunes)
		.set({ shelved, updatedAt: deps.clock.now().getTime() })
		.where(eq(tunes.id, tuneId))
		.returning();
	return tune ? Response.json({ ...tune, ...(await rotationOf(deps, tune)) }) : tuneNotFound();
}

export const shelveTune = (deps: Deps, tuneId: string) => setShelved(deps, tuneId, true);

export const unshelveTune = (deps: Deps, tuneId: string) => setShelved(deps, tuneId, false);
