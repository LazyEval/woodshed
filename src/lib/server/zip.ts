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
		view.setUint32(offset, LOCAL_SIGNATURE, true);
		view.setUint16(offset + 4, VERSION, true);
		view.setUint16(offset + 6, UTF8_FLAG, true);
		view.setUint16(offset + 8, STORED, true);
		view.setUint16(offset + 12, DOS_DATE_1980_01_01, true);
		view.setUint32(offset + 14, e.crc, true);
		view.setUint32(offset + 18, e.data.length, true);
		view.setUint32(offset + 22, e.data.length, true);
		view.setUint16(offset + 26, e.name.length, true);
		out.set(e.name, offset + LOCAL_HEADER_SIZE);
		out.set(e.data, offset + LOCAL_HEADER_SIZE + e.name.length);
		offset += LOCAL_HEADER_SIZE + e.name.length + e.data.length;

		view.setUint32(centralOffset, CENTRAL_SIGNATURE, true);
		view.setUint16(centralOffset + 4, VERSION, true);
		view.setUint16(centralOffset + 6, VERSION, true);
		view.setUint16(centralOffset + 8, UTF8_FLAG, true);
		view.setUint16(centralOffset + 10, STORED, true);
		view.setUint16(centralOffset + 14, DOS_DATE_1980_01_01, true);
		view.setUint32(centralOffset + 16, e.crc, true);
		view.setUint32(centralOffset + 20, e.data.length, true);
		view.setUint32(centralOffset + 24, e.data.length, true);
		view.setUint16(centralOffset + 28, e.name.length, true);
		view.setUint32(centralOffset + 42, localOffset, true);
		out.set(e.name, centralOffset + CENTRAL_HEADER_SIZE);
		centralOffset += CENTRAL_HEADER_SIZE + e.name.length;
	}
	view.setUint32(centralOffset, END_SIGNATURE, true);
	view.setUint16(centralOffset + 8, prepared.length, true);
	view.setUint16(centralOffset + 10, prepared.length, true);
	view.setUint32(centralOffset + 12, centralSize, true);
	view.setUint32(centralOffset + 16, localSize, true);
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

	const count = view.getUint16(end + 10, true);
	let cursor = view.getUint32(end + 16, true);
	const decoder = new TextDecoder('utf-8', { fatal: true });
	const files = new Map<string, Uint8Array>();
	for (let i = 0; i < count; i++) {
		if (cursor + CENTRAL_HEADER_SIZE > end || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
			return { error: INVALID };
		}
		const method = view.getUint16(cursor + 10, true);
		const size = view.getUint32(cursor + 24, true);
		const nameLength = view.getUint16(cursor + 28, true);
		const extraLength = view.getUint16(cursor + 30, true);
		const commentLength = view.getUint16(cursor + 32, true);
		const localOffset = view.getUint32(cursor + 42, true);
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
			view.getUint16(localOffset + 26, true) +
			view.getUint16(localOffset + 28, true);
		if (dataStart + size > bytes.length) return { error: INVALID };
		files.set(name, bytes.subarray(dataStart, dataStart + size));
		cursor = nameStart + nameLength + extraLength + commentLength;
	}
	return { value: files };
}
