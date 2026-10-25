import { asc, getTableColumns } from 'drizzle-orm';
import { calendarDateIn } from '#lib/rotation.js';
import { CONFIRM_REPLACE } from '#lib/tune.js';
import type { Deps } from '#lib/server/deps.js';
import {
	FORMAT,
	InvalidArchive,
	VERSION,
	readManifest,
	type ArchivedTune,
	type Manifest
} from '#lib/server/archive-manifest.js';
import { practiceSessions, rules, simplifiedCharts, tunes } from '#lib/server/db/schema.js';
import { jsonError } from '#lib/server/http.js';
import { IMAGE_TYPES, MAX_PAGE_BYTES, scanKey } from '#lib/server/scans.js';
import { readZip, writeZip } from '#lib/server/zip.js';

const MANIFEST_NAME = 'manifest.json';
const D1_MAX_BOUND_PARAMETERS = 100;
const R2_MAX_DELETE_KEYS = 1000;

type TuneRow = typeof tunes.$inferSelect;

interface Archive {
	manifest: Manifest;
	scans: Map<string, Uint8Array>;
}

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
			if (data.length > MAX_PAGE_BYTES) throw new InvalidArchive(`${name} is too large.`);
			if (!matchesImageType(data, tune.scanPages[page])) {
				throw new InvalidArchive(`${name} is not a ${tune.scanPages[page]} image.`);
			}
			scans.set(name, data);
		}
	}
	return { manifest, scans };
}

const IMAGE_SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
	'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
	'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
	'image/webp': (b) =>
		new TextDecoder().decode(b.subarray(0, 4)) === 'RIFF' &&
		new TextDecoder().decode(b.subarray(8, 12)) === 'WEBP'
};

function matchesImageType(bytes: Uint8Array, type: string): boolean {
	return IMAGE_SIGNATURES[type]?.(bytes) ?? false;
}

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
	return chunks;
}

const rowsPerInsert = (table: Parameters<typeof getTableColumns>[0]) =>
	Math.floor(D1_MAX_BOUND_PARAMETERS / Object.keys(getTableColumns(table)).length);

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
			...chunk(manifest.practiceSessions, rowsPerInsert(practiceSessions)).map((rows) =>
				deps.db.insert(practiceSessions).values(rows)
			),
			...chunk(manifest.rules, rowsPerInsert(rules)).map((rows) =>
				deps.db.insert(rules).values(rows)
			)
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
