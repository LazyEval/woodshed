import type { Result } from '#lib/result.js';

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

const ALTERATION = String.raw`(?:[#b]\d{1,2}|add\d{1,2}|sus[24]?|maj\d{1,2}|alt)`;
const CHORD_PATTERN = new RegExp(
	String.raw`^[A-G][#b]?` +
		String.raw`(?:maj|min|dim|aug|m|M|Δ|°|ø|o|\+|-|\^)?` +
		String.raw`(?:6/9|\d{1,2})?` +
		String.raw`(?:${ALTERATION}|\d{1,2})*` +
		String.raw`(?:\(${ALTERATION}(?:,${ALTERATION})*\))?` +
		String.raw`(?:/[A-G][#b]?)?$`
);

export const CHORD_FORMAT_HINT = 'e.g. Dm7, Bb7#11, C/E, F#m7b5, N.C.';

function normalizeChordSymbol(symbol: string): string {
	return symbol === 'NC' ? NO_CHORD : symbol;
}

export function isValidChordSymbol(symbol: string): boolean {
	const normalized = normalizeChordSymbol(symbol);
	return normalized === NO_CHORD || CHORD_PATTERN.test(normalized);
}

const KEY_PATTERN = /^[A-G][#b]?m?$/;

export function isValidKey(key: string): boolean {
	return KEY_PATTERN.test(key);
}

export function emptyBar(): Bar {
	return { chords: [] };
}

export function emptyChart(): Chart {
	return { sections: [{ label: 'A', bars: [emptyBar()] }] };
}

export function barToSlots(bar: Bar): string[] {
	const slots = Array.from({ length: BEATS_PER_BAR }, () => '');
	for (const chord of bar.chords) slots[chord.beat - 1] = chord.symbol;
	return slots;
}

export function slotsToBar(slots: string[]): Bar {
	return {
		chords: slots.flatMap((symbol, i) =>
			symbol.trim() ? [{ beat: i + 1, symbol: symbol.trim() }] : []
		)
	};
}

export function validateChart(chart: unknown): Result<Chart> {
	if (!isRecord(chart) || !Array.isArray(chart.sections) || chart.sections.length === 0) {
		return { error: 'Chart must have at least one section.' };
	}
	if (chart.sections.length > MAX_SECTIONS) {
		return { error: `A chart has at most ${MAX_SECTIONS} sections.` };
	}

	const sections: Section[] = [];
	for (const [s, rawSection] of chart.sections.entries()) {
		const sectionLocation = `Section ${s + 1}`;
		if (!isRecord(rawSection) || typeof rawSection.label !== 'string') {
			return { error: `${sectionLocation}: label is required.` };
		}
		const label = rawSection.label.trim();
		if (!label || label.length > MAX_LABEL_LENGTH) {
			return { error: `${sectionLocation}: label must be 1 to ${MAX_LABEL_LENGTH} characters.` };
		}
		if (!Array.isArray(rawSection.bars) || rawSection.bars.length === 0) {
			return { error: `${sectionLocation} (${label}): must have at least one bar.` };
		}
		if (rawSection.bars.length > MAX_BARS_PER_SECTION) {
			return { error: `${sectionLocation} (${label}): at most ${MAX_BARS_PER_SECTION} bars.` };
		}

		const bars: Bar[] = [];
		for (const [b, rawBar] of rawSection.bars.entries()) {
			const bar = validateBar(rawBar, `${sectionLocation} (${label}), bar ${b + 1}`);
			if ('error' in bar) return bar;
			bars.push(bar.value);
		}
		sections.push({ label, bars });
	}
	return { value: { sections } };
}

function validateBar(rawBar: unknown, location: string): Result<Bar> {
	if (!isRecord(rawBar) || !Array.isArray(rawBar.chords)) {
		return { error: `${location}: chords must be a list.` };
	}
	const chords: PlacedChord[] = [];
	const seenBeats = new Set<number>();
	for (const raw of rawBar.chords) {
		if (!isRecord(raw) || typeof raw.symbol !== 'string') {
			return { error: `${location}: each chord needs a symbol.` };
		}
		const symbol = raw.symbol.trim();
		if (!isValidChordSymbol(symbol)) {
			return { error: `${location}: invalid chord symbol "${symbol}" (${CHORD_FORMAT_HINT}).` };
		}
		const beat = raw.beat;
		if (typeof beat !== 'number' || !Number.isInteger(beat) || beat < 1 || beat > BEATS_PER_BAR) {
			return { error: `${location}: beat must be a whole number from 1 to ${BEATS_PER_BAR}.` };
		}
		if (seenBeats.has(beat)) {
			return { error: `${location}: two chords on beat ${beat}.` };
		}
		seenBeats.add(beat);
		chords.push({ beat, symbol: normalizeChordSymbol(symbol) });
	}
	chords.sort((a, b) => a.beat - b.beat);
	return { value: { chords } };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
