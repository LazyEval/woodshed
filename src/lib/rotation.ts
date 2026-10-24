export type Rating = 'shaky' | 'ok' | 'solid';
export const RATINGS: readonly Rating[] = ['shaky', 'ok', 'solid'];

export type CalendarDate = string;

const FIRST_INTERVAL_DAYS: Record<Rating, number> = { shaky: 1, ok: 3, solid: 7 };
const OK_GROWTH = 1.5;
const STARTING_EASE = 2.5;
const SHAKY_EASE_PENALTY = 0.2;
const MIN_EASE = 1.3;

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface RatedSession {
	practicedOn: CalendarDate;
	rating: Rating;
}

export interface Rotation {
	lastPracticedOn: CalendarDate | null;
	lastRating: Rating | null;
	dueOn: CalendarDate | null;
}

export interface PracticeSession {
	id: string;
	practicedOn: CalendarDate;
	rating: Rating;
	chart: string | null;
}

export interface DueTune extends Rotation {
	id: string;
	title: string;
	composer: string | null;
	key: string | null;
	dueOn: CalendarDate;
	daysOverdue: number;
}

export function isRating(value: unknown): value is Rating {
	return RATINGS.includes(value as Rating);
}

function toUtcMs(date: CalendarDate): number {
	const [, year, month, day] = CALENDAR_DATE_PATTERN.exec(date)!;
	return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function fromUtcMs(ms: number): CalendarDate {
	return new Date(ms).toISOString().slice(0, 10);
}

export function isCalendarDate(value: unknown): value is CalendarDate {
	return (
		typeof value === 'string' &&
		CALENDAR_DATE_PATTERN.test(value) &&
		fromUtcMs(toUtcMs(value)) === value
	);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
	return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

export function daysBetween(from: CalendarDate, to: CalendarDate): number {
	return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function calendarDateIn(instant: Date, timeZone: string): CalendarDate {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(instant);
	const part = (type: string) => parts.find((p) => p.type === type)!.value;
	return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Sessions must be in practice order, oldest first. */
export function rotation(sessions: RatedSession[], verifiedOn: CalendarDate | null): Rotation {
	const last = sessions.at(-1);
	if (!last) return { lastPracticedOn: null, lastRating: null, dueOn: verifiedOn };

	let interval = FIRST_INTERVAL_DAYS[sessions[0].rating];
	let ease = STARTING_EASE;
	for (const { rating } of sessions.slice(1)) {
		if (rating === 'shaky') {
			interval = 1;
			ease = Math.max(MIN_EASE, ease - SHAKY_EASE_PENALTY);
		} else {
			interval *= rating === 'ok' ? OK_GROWTH : ease;
		}
	}

	return {
		lastPracticedOn: last.practicedOn,
		lastRating: last.rating,
		dueOn: addDays(last.practicedOn, Math.round(interval))
	};
}
