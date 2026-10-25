import {
	countBars,
	isRecord,
	validateChart,
	type Chart,
	type GenerationRecord,
	type SimplifiedChartOrigin
} from '#lib/chart.js';
import { isCalendarDate, isPracticedChart, isRating } from '#lib/rotation.js';
import type { practiceSessions, rules, simplifiedCharts, tunes } from '#lib/server/db/schema.js';
import { parseRule } from '#lib/server/rules.js';
import { IMAGE_TYPES, MAX_SCAN_PAGES } from '#lib/server/scans.js';
import { parseTuneFields } from '#lib/server/tunes.js';
import { parseName } from '#lib/server/validation.js';

export const FORMAT = 'woodshed-archive';
export const VERSION = 1;
const SAFE_ID = /^[\w-]{1,100}$/;

type TuneRow = typeof tunes.$inferSelect;

export type ArchivedTune = Omit<TuneRow, 'scanPageCount' | 'scanVersion'> & {
	scanPages: string[];
};
type ArchivedSimplifiedChart = typeof simplifiedCharts.$inferSelect;
type ArchivedPracticeSession = typeof practiceSessions.$inferSelect;
type ArchivedRule = typeof rules.$inferSelect;

export interface Manifest {
	format: typeof FORMAT;
	version: typeof VERSION;
	exportedAt: string;
	tunes: ArchivedTune[];
	simplifiedCharts: ArchivedSimplifiedChart[];
	practiceSessions: ArchivedPracticeSession[];
	rules: ArchivedRule[];
}

export class InvalidArchive extends Error {}

function field(source: Record<string, unknown>, name: string, where: string): unknown {
	if (!(name in source)) throw new InvalidArchive(`${where} is missing "${name}".`);
	return source[name];
}

function text(source: Record<string, unknown>, name: string, where: string): string {
	const value = field(source, name, where);
	if (typeof value !== 'string') throw new InvalidArchive(`${where} "${name}" must be text.`);
	return value;
}

function nullableText(source: Record<string, unknown>, name: string, where: string) {
	return field(source, name, where) === null ? null : text(source, name, where);
}

function integer(source: Record<string, unknown>, name: string, where: string): number {
	const value = field(source, name, where);
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new InvalidArchive(`${where} "${name}" must be a non-negative integer.`);
	}
	return value as number;
}

function nullableInteger(source: Record<string, unknown>, name: string, where: string) {
	return field(source, name, where) === null ? null : integer(source, name, where);
}

function chartOf(value: unknown, where: string): Chart {
	const chart = validateChart(value);
	if ('error' in chart) throw new InvalidArchive(`${where} chart is invalid: ${chart.error}`);
	return chart.value;
}

function records(value: unknown, where: string): Record<string, unknown>[] {
	if (!Array.isArray(value) || !value.every(isRecord)) {
		throw new InvalidArchive(`${where} must be a list of objects.`);
	}
	return value;
}

function uniqueIds(items: { id: string }[], where: string): Set<string> {
	if (!items.every((item) => SAFE_ID.test(item.id))) {
		throw new InvalidArchive(`${where} have invalid ids.`);
	}
	const ids = new Set(items.map((item) => item.id));
	if (ids.size !== items.length) throw new InvalidArchive(`${where} have duplicate ids.`);
	return ids;
}

function readTune(raw: Record<string, unknown>): ArchivedTune {
	const where = 'A Tune';
	const status = text(raw, 'sourceChartStatus', where);
	if (status !== 'draft' && status !== 'verified') {
		throw new InvalidArchive(`${where} has an unknown Source Chart status.`);
	}
	const verifiedChart = field(raw, 'verifiedChart', where);
	const scanPages = field(raw, 'scanPages', where);
	if (
		!Array.isArray(scanPages) ||
		scanPages.length > MAX_SCAN_PAGES ||
		!scanPages.every((type) => IMAGE_TYPES.includes(type))
	) {
		throw new InvalidArchive(`${where} has invalid Scan pages.`);
	}
	if (typeof field(raw, 'shelved', where) !== 'boolean') {
		throw new InvalidArchive(`${where} "shelved" must be true or false.`);
	}
	const fields = parseTuneFields(raw);
	if ('error' in fields) throw new InvalidArchive(`${where}: ${fields.error}`);
	return {
		id: text(raw, 'id', where),
		...fields.value,
		sourceChart: chartOf(field(raw, 'sourceChart', where), where),
		sourceChartStatus: status,
		verifiedAt: nullableInteger(raw, 'verifiedAt', where),
		verifiedChart: verifiedChart === null ? null : chartOf(verifiedChart, where),
		shelved: raw.shelved as boolean,
		scanPages: scanPages as string[],
		createdAt: integer(raw, 'createdAt', where),
		updatedAt: integer(raw, 'updatedAt', where)
	};
}

function readGeneration(value: unknown): GenerationRecord | null {
	if (value === null) return null;
	const where = 'A generation record';
	if (!isRecord(value)) throw new InvalidArchive(`${where} must be an object.`);
	return {
		rules: records(field(value, 'rules', where), `${where} rules`).map((rule) => ({
			name: text(rule, 'name', where),
			text: text(rule, 'text', where)
		})),
		note: nullableText(value, 'note', where),
		reasons: records(field(value, 'reasons', where), `${where} reasons`).map((reason) => ({
			barIndex: integer(reason, 'barIndex', where),
			reason: text(reason, 'reason', where)
		}))
	};
}

function readSimplifiedChart(
	raw: Record<string, unknown>,
	tuneIds: Set<string>
): ArchivedSimplifiedChart {
	const where = 'A Simplified Chart';
	const tuneId = text(raw, 'tuneId', where);
	if (!tuneIds.has(tuneId)) throw new InvalidArchive(`${where} belongs to an unknown Tune.`);
	const origin = text(raw, 'origin', where);
	if (origin !== 'manual' && origin !== 'generated') {
		throw new InvalidArchive(`${where} has an unknown origin.`);
	}
	const flaggedBars = field(raw, 'flaggedBars', where);
	if (!Array.isArray(flaggedBars) || !flaggedBars.every((bar) => Number.isSafeInteger(bar))) {
		throw new InvalidArchive(`${where} has invalid flagged bars.`);
	}
	const name = parseName(raw.name);
	if ('error' in name) throw new InvalidArchive(`${where}: ${name.error}`);
	const chart = chartOf(field(raw, 'chart', where), where);
	const barCount = countBars(chart);
	if (!flaggedBars.every((bar) => bar >= 1 && bar <= barCount)) {
		throw new InvalidArchive(`${where} flags bars outside its chart.`);
	}
	const generation = readGeneration(field(raw, 'generation', where));
	if (generation?.reasons.some(({ barIndex }) => barIndex < 1 || barIndex > barCount)) {
		throw new InvalidArchive(`${where} explains bars outside its chart.`);
	}
	return {
		id: text(raw, 'id', where),
		tuneId,
		name: name.value,
		origin: origin as SimplifiedChartOrigin,
		chart,
		generation,
		flaggedBars: flaggedBars as number[],
		archivedAt: nullableInteger(raw, 'archivedAt', where),
		createdAt: integer(raw, 'createdAt', where),
		updatedAt: integer(raw, 'updatedAt', where)
	};
}

function readPracticeSession(
	raw: Record<string, unknown>,
	tuneIds: Set<string>
): ArchivedPracticeSession {
	const where = 'A Practice Session';
	const tuneId = text(raw, 'tuneId', where);
	if (!tuneIds.has(tuneId)) throw new InvalidArchive(`${where} belongs to an unknown Tune.`);
	const practicedOn = field(raw, 'practicedOn', where);
	const rating = field(raw, 'rating', where);
	const chart = field(raw, 'chart', where);
	if (!isCalendarDate(practicedOn)) throw new InvalidArchive(`${where} has an invalid date.`);
	if (!isRating(rating)) throw new InvalidArchive(`${where} has an invalid Rating.`);
	if (chart !== null && !isPracticedChart(chart)) {
		throw new InvalidArchive(`${where} has an invalid chart.`);
	}
	return {
		id: text(raw, 'id', where),
		tuneId,
		practicedOn,
		rating,
		chart,
		createdAt: integer(raw, 'createdAt', where)
	};
}

function readRule(raw: Record<string, unknown>): ArchivedRule {
	const where = 'A Rule';
	const rule = parseRule(raw);
	if ('error' in rule) throw new InvalidArchive(`${where}: ${rule.error}`);
	return {
		id: text(raw, 'id', where),
		...rule.value,
		createdAt: integer(raw, 'createdAt', where),
		updatedAt: integer(raw, 'updatedAt', where)
	};
}

export function readManifest(raw: unknown): Manifest {
	if (!isRecord(raw) || raw.format !== FORMAT) {
		throw new InvalidArchive('Archive is not a Woodshed archive.');
	}
	if (raw.version !== VERSION) {
		throw new InvalidArchive(`Archive version ${String(raw.version)} is not supported.`);
	}
	const tuneList = records(raw.tunes, 'Tunes').map(readTune);
	const tuneIds = uniqueIds(tuneList, 'Tunes');
	const simplifiedChartList = records(raw.simplifiedCharts, 'Simplified Charts').map((chart) =>
		readSimplifiedChart(chart, tuneIds)
	);
	const sessionList = records(raw.practiceSessions, 'Practice Sessions').map((session) =>
		readPracticeSession(session, tuneIds)
	);
	const ruleList = records(raw.rules, 'Rules').map(readRule);
	uniqueIds(simplifiedChartList, 'Simplified Charts');
	uniqueIds(sessionList, 'Practice Sessions');
	uniqueIds(ruleList, 'Rules');
	return {
		format: FORMAT,
		version: VERSION,
		exportedAt: text(raw, 'exportedAt', 'Archive'),
		tunes: tuneList,
		simplifiedCharts: simplifiedChartList,
		practiceSessions: sessionList,
		rules: ruleList
	};
}
