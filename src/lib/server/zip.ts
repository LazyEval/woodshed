import type { Result } from '#lib/result.js';

export interface ZipEntry {
	name: string;
	data: Uint8Array;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const VERSION = 20;
const UTF8_FLAG = 0x0800;
const STORED = 0;
const DOS_DATE_1980_01_01 = 0x21;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;
const MAX_ENTRIES = 0xffff;
const MAX_ARCHIVE_BYTES = 0xffffffff;
const LOCAL = {
	signature: 0,
	versionNeeded: 4,
	flags: 6,
	method: 8,
	date: 12,
	crc: 14,
	compressedSize: 18,
	size: 22,
	nameLength: 26,
	extraLength: 28
} as const;
const CENTRAL = {
	signature: 0,
	versionMade: 4,
	versionNeeded: 6,
	flags: 8,
	method: 10,
	date: 14,
	crc: 16,
	compressedSize: 20,
	size: 24,
	nameLength: 28,
	extraLength: 30,
	commentLength: 32,
	localOffset: 42
} as const;
const END = { entriesOnDisk: 8, entryCount: 10, centralSize: 12, centralOffset: 16 } as const;
const INVALID = 'Archive is not a valid zip file.';

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

export function writeZip(entries: ZipEntry[]): Result<Uint8Array<ArrayBuffer>> {
	if (entries.length > MAX_ENTRIES) return { error: 'Too many files for a zip archive.' };
	const encoder = new TextEncoder();
	const prepared = entries.map(({ name, data }) => ({
		name: encoder.encode(name),
		data,
		crc: crc32(data)
	}));
	const localSize = prepared.reduce(
		(sum, e) => sum + LOCAL_HEADER_SIZE + e.name.length + e.data.length,
		0
	);
	const centralSize = prepared.reduce((sum, e) => sum + CENTRAL_HEADER_SIZE + e.name.length, 0);
	const total = localSize + centralSize + END_RECORD_SIZE;
	if (total > MAX_ARCHIVE_BYTES) return { error: 'Archive is too large for a zip file.' };

	const out = new Uint8Array(new ArrayBuffer(total));
	const view = new DataView(out.buffer);
	let offset = 0;
	let centralOffset = localSize;
	for (const e of prepared) {
		const localOffset = offset;
		view.setUint32(offset + LOCAL.signature, LOCAL_SIGNATURE, true);
		view.setUint16(offset + LOCAL.versionNeeded, VERSION, true);
		view.setUint16(offset + LOCAL.flags, UTF8_FLAG, true);
		view.setUint16(offset + LOCAL.method, STORED, true);
		view.setUint16(offset + LOCAL.date, DOS_DATE_1980_01_01, true);
		view.setUint32(offset + LOCAL.crc, e.crc, true);
		view.setUint32(offset + LOCAL.compressedSize, e.data.length, true);
		view.setUint32(offset + LOCAL.size, e.data.length, true);
		view.setUint16(offset + LOCAL.nameLength, e.name.length, true);
		out.set(e.name, offset + LOCAL_HEADER_SIZE);
		out.set(e.data, offset + LOCAL_HEADER_SIZE + e.name.length);
		offset += LOCAL_HEADER_SIZE + e.name.length + e.data.length;

		view.setUint32(centralOffset + CENTRAL.signature, CENTRAL_SIGNATURE, true);
		view.setUint16(centralOffset + CENTRAL.versionMade, VERSION, true);
		view.setUint16(centralOffset + CENTRAL.versionNeeded, VERSION, true);
		view.setUint16(centralOffset + CENTRAL.flags, UTF8_FLAG, true);
		view.setUint16(centralOffset + CENTRAL.method, STORED, true);
		view.setUint16(centralOffset + CENTRAL.date, DOS_DATE_1980_01_01, true);
		view.setUint32(centralOffset + CENTRAL.crc, e.crc, true);
		view.setUint32(centralOffset + CENTRAL.compressedSize, e.data.length, true);
		view.setUint32(centralOffset + CENTRAL.size, e.data.length, true);
		view.setUint16(centralOffset + CENTRAL.nameLength, e.name.length, true);
		view.setUint32(centralOffset + CENTRAL.localOffset, localOffset, true);
		out.set(e.name, centralOffset + CENTRAL_HEADER_SIZE);
		centralOffset += CENTRAL_HEADER_SIZE + e.name.length;
	}
	view.setUint32(centralOffset, END_SIGNATURE, true);
	view.setUint16(centralOffset + END.entriesOnDisk, prepared.length, true);
	view.setUint16(centralOffset + END.entryCount, prepared.length, true);
	view.setUint32(centralOffset + END.centralSize, centralSize, true);
	view.setUint32(centralOffset + END.centralOffset, localSize, true);
	return { value: out };
}

function findEndRecord(view: DataView): number {
	const lowest = Math.max(0, view.byteLength - END_RECORD_SIZE - MAX_COMMENT_SIZE);
	for (let at = view.byteLength - END_RECORD_SIZE; at >= lowest; at--) {
		if (view.getUint32(at, true) === END_SIGNATURE) return at;
	}
	return -1;
}

/**
 * Reads only stored (uncompressed) entries, the format `writeZip` produces.
 * Entry bytes are not CRC-checked: that would burn the Worker's CPU budget on large Scans.
 */
export function readZip(bytes: Uint8Array): Result<Map<string, Uint8Array>> {
	if (bytes.length < END_RECORD_SIZE) return { error: INVALID };
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const end = findEndRecord(view);
	if (end < 0) return { error: INVALID };

	const count = view.getUint16(end + END.entryCount, true);
	let cursor = view.getUint32(end + END.centralOffset, true);
	const decoder = new TextDecoder('utf-8', { fatal: true });
	const files = new Map<string, Uint8Array>();
	for (let i = 0; i < count; i++) {
		if (cursor + CENTRAL_HEADER_SIZE > end || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
			return { error: INVALID };
		}
		const method = view.getUint16(cursor + CENTRAL.method, true);
		const size = view.getUint32(cursor + CENTRAL.size, true);
		const nameLength = view.getUint16(cursor + CENTRAL.nameLength, true);
		const extraLength = view.getUint16(cursor + CENTRAL.extraLength, true);
		const commentLength = view.getUint16(cursor + CENTRAL.commentLength, true);
		const localOffset = view.getUint32(cursor + CENTRAL.localOffset, true);
		const nameStart = cursor + CENTRAL_HEADER_SIZE;
		if (nameStart + nameLength > end) return { error: INVALID };
		if (method !== STORED) return { error: 'Archive entries must be stored uncompressed.' };

		let name: string;
		try {
			name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
		} catch {
			return { error: INVALID };
		}
		if (files.has(name)) return { error: INVALID };

		if (
			localOffset + LOCAL_HEADER_SIZE > bytes.length ||
			view.getUint32(localOffset, true) !== LOCAL_SIGNATURE
		) {
			return { error: INVALID };
		}
		const dataStart =
			localOffset +
			LOCAL_HEADER_SIZE +
			view.getUint16(localOffset + LOCAL.nameLength, true) +
			view.getUint16(localOffset + LOCAL.extraLength, true);
		if (dataStart + size > bytes.length) return { error: INVALID };
		files.set(name, bytes.subarray(dataStart, dataStart + size));
		cursor = nameStart + nameLength + extraLength + commentLength;
	}
	return { value: files };
}
