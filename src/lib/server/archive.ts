import { asc } from 'drizzle-orm';
import {
	isRecord,
	validateChart,
	type Chart,
	type GenerationRecord,
	type SimplifiedChartOrigin
} from '#lib/chart.js';
import { calendarDateIn, isCalendarDate, isPracticedChart, isRating } from '#lib/rotation.js';
import { CONFIRM_REPLACE } from '#lib/tune.js';
import type { Deps } from '#lib/server/deps.js';
import { practiceSessions, rules, simplifiedCharts, tunes } from '#lib/server/db/schema.js';
import { jsonError } from '#lib/server/http.js';
import { IMAGE_TYPES, MAX_SCAN_PAGES, scanKey } from '#lib/server/scans.js';
import { readZip, writeZip } from '#lib/server/zip.js';

const FORMAT = 'woodshed-archive';
const VERSION = 1;
const MANIFEST_NAME = 'manifest.json';
const D1_MAX_BOUND_PARAMETERS = 100;
const R2_MAX_DELETE_KEYS = 1000;

type TuneRow = typeof tunes.$inferSelect;

type ArchivedTune = Omit<TuneRow, 'scanPageCount' | 'scanVersion'> & { scanPages: string[] };
type ArchivedSimplifiedChart = typeof simplifiedCharts.$inferSelect;
type ArchivedPracticeSession = typeof practiceSessions.$inferSelect;
type ArchivedRule = typeof rules.$inferSelect;

interface Manifest {
	format: typeof FORMAT;
	version: typeof VERSION;
	exportedAt: string;
	tunes: ArchivedTune[];
	simplifiedCharts: ArchivedSimplifiedChart[];
	practiceSessions: ArchivedPracticeSession[];
	rules: ArchivedRule[];
}

interface Archive {
	manifest: Manifest;
	scans: Map<string, Uint8Array>;
}

class InvalidArchive extends Error {}

const archiveScanName = (tuneId: string, page: number) => scanKey(tuneId, 0, page);

export async function exportArchive(deps: Deps): Promise<Response> {
	const [tuneRows, simplifiedChartRows, sessionRows, ruleRows] = await Promise.all([
		deps.db.select().from(tunes).orderBy(asc(tunes.id)),
		deps.db.select().from(simplifiedCharts).orderBy(asc(simplifiedCharts.id)),
		deps.db.select().from(practiceSessions).orderBy(asc(practiceSessions.id)),
		deps.db.select().from(rules).orderBy(asc(rules.id))
	]);

	const files = [];
	const archivedTunes: ArchivedTune[] = [];
	for (const { scanPageCount, scanVersion, ...tune } of tuneRows) {
		const scanPages: string[] = [];
		for (let page = 0; page < scanPageCount; page++) {
			const object = await deps.scans.get(scanKey(tune.id, scanVersion, page));
			if (!object) return jsonError(`Scan page ${page} of "${tune.title}" is missing.`, 500);
			scanPages.push(object.httpMetadata?.contentType ?? IMAGE_TYPES[0]);
			files.push({
				name: archiveScanName(tune.id, page),
				data: new Uint8Array(await object.arrayBuffer())
			});
		}
		archivedTunes.push({ ...tune, scanPages });
	}

	const now = deps.clock.now();
	const manifest: Manifest = {
		format: FORMAT,
		version: VERSION,
		exportedAt: now.toISOString(),
		tunes: archivedTunes,
		simplifiedCharts: simplifiedChartRows,
		practiceSessions: sessionRows,
		rules: ruleRows
	};
	const zip = writeZip([
		{ name: MANIFEST_NAME, data: new TextEncoder().encode(JSON.stringify(manifest)) },
		...files
	]);
	if ('error' in zip) return jsonError(zip.error, 500);

	const date = calendarDateIn(now, deps.timeZone);
	return new Response(zip.value, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="woodshed-${date}.zip"`
		}
	});
}

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
	return {
		id: text(raw, 'id', where),
		title: text(raw, 'title', where),
		composer: nullableText(raw, 'composer', where),
		key: nullableText(raw, 'key', where),
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
	return {
		id: text(raw, 'id', where),
		tuneId,
		name: text(raw, 'name', where),
		origin: origin as SimplifiedChartOrigin,
		chart: chartOf(field(raw, 'chart', where), where),
		generation: readGeneration(field(raw, 'generation', where)),
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
	return {
		id: text(raw, 'id', where),
		name: text(raw, 'name', where),
		text: text(raw, 'text', where),
		createdAt: integer(raw, 'createdAt', where),
		updatedAt: integer(raw, 'updatedAt', where)
	};
}

function readManifest(raw: unknown): Manifest {
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

function parseArchive(bytes: Uint8Array): Archive {
	const unzipped = readZip(bytes);
	if ('error' in unzipped) throw new InvalidArchive(unzipped.error);
	const manifestBytes = unzipped.value.get(MANIFEST_NAME);
	if (!manifestBytes) throw new InvalidArchive(`Archive has no ${MANIFEST_NAME}.`);

	let raw: unknown;
	try {
		raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
	} catch {
		throw new InvalidArchive(`${MANIFEST_NAME} is not valid JSON.`);
	}
	const manifest = readManifest(raw);

	const scans = new Map<string, Uint8Array>();
	for (const tune of manifest.tunes) {
		for (let page = 0; page < tune.scanPages.length; page++) {
			const name = archiveScanName(tune.id, page);
			const data = unzipped.value.get(name);
			if (!data) throw new InvalidArchive(`Archive is missing ${name}.`);
			scans.set(name, data);
		}
	}
	return { manifest, scans };
}

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
	return chunks;
}

const rowsPerInsert = (columns: number) => Math.floor(D1_MAX_BOUND_PARAMETERS / columns);

async function listScanKeys(deps: Deps): Promise<string[]> {
	const keys: string[] = [];
	let cursor: string | undefined;
	do {
		const page = await deps.scans.list({ cursor });
		keys.push(...page.objects.map((object) => object.key));
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return keys;
}

async function deleteScanKeys(deps: Deps, keys: string[]): Promise<void> {
	for (const batch of chunk(keys, R2_MAX_DELETE_KEYS)) await deps.scans.delete(batch);
}

async function replaceAll(deps: Deps, { manifest, scans }: Archive): Promise<void> {
	const currentVersions = new Map(
		(await deps.db.select({ id: tunes.id, scanVersion: tunes.scanVersion }).from(tunes)).map(
			(tune) => [tune.id, tune.scanVersion]
		)
	);
	const staleKeys = await listScanKeys(deps);

	const writes: { key: string; data: Uint8Array; contentType: string }[] = [];
	const tuneRows: TuneRow[] = manifest.tunes.map(({ scanPages, ...tune }) => {
		const scanVersion = (currentVersions.get(tune.id) ?? -1) + 1;
		scanPages.forEach((contentType, page) =>
			writes.push({
				key: scanKey(tune.id, scanVersion, page),
				data: scans.get(archiveScanName(tune.id, page))!,
				contentType
			})
		);
		return { ...tune, scanPageCount: scanPages.length, scanVersion };
	});
	const newKeys = writes.map((write) => write.key);

	try {
		await Promise.all(
			writes.map(({ key, data, contentType }) =>
				deps.scans.put(key, data, { httpMetadata: { contentType } })
			)
		);
		await deps.db.batch([
			deps.db.delete(rules),
			deps.db.delete(tunes),
			...tuneRows.map((row) => deps.db.insert(tunes).values(row)),
			...manifest.simplifiedCharts.map((row) => deps.db.insert(simplifiedCharts).values(row)),
			...chunk(manifest.practiceSessions, rowsPerInsert(6)).map((rows) =>
				deps.db.insert(practiceSessions).values(rows)
			),
			...chunk(manifest.rules, rowsPerInsert(5)).map((rows) => deps.db.insert(rules).values(rows))
		]);
	} catch (error) {
		await deleteScanKeys(deps, newKeys).catch(() => undefined);
		throw error;
	}

	const kept = new Set(newKeys);
	await deleteScanKeys(
		deps,
		staleKeys.filter((key) => !kept.has(key))
	).catch(() => undefined);
}

export async function importArchive(request: Request, deps: Deps): Promise<Response> {
	let archive: Archive;
	try {
		archive = parseArchive(new Uint8Array(await request.arrayBuffer()));
	} catch (error) {
		if (error instanceof InvalidArchive) return jsonError(error.message, 422);
		throw error;
	}

	const confirmed =
		new URL(request.url).searchParams.get(CONFIRM_REPLACE.name) === CONFIRM_REPLACE.value;
	if (!confirmed) {
		return Response.json(
			{
				error: 'Importing replaces all current data. Confirm to continue.',
				tunes: archive.manifest.tunes.length,
				simplifiedCharts: archive.manifest.simplifiedCharts.length,
				practiceSessions: archive.manifest.practiceSessions.length,
				rules: archive.manifest.rules.length
			},
			{ status: 409 }
		);
	}

	await replaceAll(deps, archive);
	return new Response(null, { status: 204 });
}
