export const BEATS_PER_BAR = 4;
export const NO_CHORD = 'N.C.';

const MAX_SECTIONS = 32;
const MAX_BARS_PER_SECTION = 64;
const MAX_LABEL_LENGTH = 20;

export interface PlacedChord {
	beat: number;
	symbol: string;
}

export interface Bar {
	chords: PlacedChord[];
}

export interface Section {
	label: string;
	bars: Bar[];
}

export interface Chart {
	sections: Section[];
}

export type SourceChartStatus = 'draft' | 'verified';

const CHORD_PATTERN =
	/^[A-G][#b]?(?:maj|min|dim|aug|sus|add|alt|m|M|Δ|°|ø|o|\+|-|\^|\d+|[#b]\d+|\(|\)|,)*(?:\/[A-G][#b]?)?$/;

export function isValidChordSymbol(symbol: string): boolean {
	return symbol === NO_CHORD || CHORD_PATTERN.test(symbol);
}

const KEY_PATTERN = /^[A-G][#b]?m?$/;

export function isValidKey(key: string): boolean {
	return KEY_PATTERN.test(key);
}

export function emptyChart(): Chart {
	return { sections: [{ label: 'A', bars: [{ chords: [] }] }] };
}

export function validateChart(value: unknown): { chart: Chart } | { error: string } {
	if (!isRecord(value) || !Array.isArray(value.sections)) {
		return { error: 'Chart must have a list of sections.' };
	}
	if (value.sections.length > MAX_SECTIONS) {
		return { error: `A chart has at most ${MAX_SECTIONS} sections.` };
	}

	const sections: Section[] = [];
	for (const [s, rawSection] of value.sections.entries()) {
		const where = `Section ${s + 1}`;
		if (!isRecord(rawSection) || typeof rawSection.label !== 'string') {
			return { error: `${where}: label is required.` };
		}
		const label = rawSection.label.trim();
		if (!label || label.length > MAX_LABEL_LENGTH) {
			return { error: `${where}: label must be 1 to ${MAX_LABEL_LENGTH} characters.` };
		}
		if (!Array.isArray(rawSection.bars) || rawSection.bars.length === 0) {
			return { error: `${where} (${label}): must have at least one bar.` };
		}
		if (rawSection.bars.length > MAX_BARS_PER_SECTION) {
			return { error: `${where} (${label}): at most ${MAX_BARS_PER_SECTION} bars.` };
		}

		const bars: Bar[] = [];
		for (const [b, rawBar] of rawSection.bars.entries()) {
			const barWhere = `${where} (${label}), bar ${b + 1}`;
			const bar = validateBar(rawBar, barWhere);
			if ('error' in bar) return bar;
			bars.push(bar);
		}
		sections.push({ label, bars });
	}
	return { chart: { sections } };
}

function validateBar(value: unknown, where: string): Bar | { error: string } {
	if (!isRecord(value) || !Array.isArray(value.chords)) {
		return { error: `${where}: chords must be a list.` };
	}
	const chords: PlacedChord[] = [];
	const seenBeats = new Set<number>();
	for (const raw of value.chords) {
		if (!isRecord(raw) || typeof raw.symbol !== 'string') {
			return { error: `${where}: each chord needs a symbol.` };
		}
		const symbol = raw.symbol.trim();
		if (!isValidChordSymbol(symbol)) {
			return { error: `${where}: invalid chord symbol "${symbol}".` };
		}
		const beat = raw.beat;
		if (!Number.isInteger(beat) || (beat as number) < 1 || (beat as number) > BEATS_PER_BAR) {
			return { error: `${where}: beat must be a whole number from 1 to ${BEATS_PER_BAR}.` };
		}
		if (seenBeats.has(beat as number)) {
			return { error: `${where}: two chords on beat ${beat}.` };
		}
		seenBeats.add(beat as number);
		chords.push({ beat: beat as number, symbol });
	}
	chords.sort((a, b) => a.beat - b.beat);
	return { chords };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
