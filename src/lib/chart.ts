import type { Result } from '#lib/result.js';

export const NO_CHORD = 'N.C.';

const MAX_SECTIONS = 32;
const MAX_BARS_PER_SECTION = 64;
const MAX_LABEL_LENGTH = 20;
export const MAX_BEATS_PER_BAR = 12;
export const BEAT_UNITS: readonly number[] = [2, 4, 8];

export type EndingNumber = 1 | 2;
export const ENDING_NUMBERS: readonly EndingNumber[] = [1, 2];

export interface TimeSignature {
	beats: number;
	unit: number;
}

export const DEFAULT_TIME_SIGNATURE: TimeSignature = { beats: 4, unit: 4 };

export interface PlacedChord {
	beat: number;
	symbol: string;
}

export interface Bar {
	chords: PlacedChord[];
	repeatStart?: boolean;
	repeatEnd?: boolean;
	ending?: EndingNumber;
	timeSignature?: TimeSignature;
}

export interface Section {
	label: string;
	bars: Bar[];
}

export type KeyMode = 'major' | 'minor';
export const KEY_MODES: readonly KeyMode[] = ['major', 'minor'];

export interface KeyCenter {
	startBar: number;
	endBar: number;
	tonic: string;
	mode: KeyMode;
}

export interface Chart {
	sections: Section[];
	keyCenters?: KeyCenter[];
}

export type SourceChartStatus = 'draft' | 'verified';

export type SimplifiedChartOrigin = 'manual';

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
const TONIC_PATTERN = /^[A-G][#b]?$/;

function isValidTonic(tonic: string): boolean {
	return TONIC_PATTERN.test(tonic);
}

export function countBars(chart: { sections: { bars: unknown[] }[] }): number {
	return chart.sections.reduce((total, section) => total + section.bars.length, 0);
}

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MINOR_HUE_OFFSET = 15;

export function keyCenterHue({ tonic, mode }: Pick<KeyCenter, 'tonic' | 'mode'>): number {
	const accidental = tonic.endsWith('#') ? 1 : tonic.endsWith('b') ? -1 : 0;
	const semitone = (SEMITONES[tonic[0]] + accidental + 12) % 12;
	return semitone * 30 + (mode === 'minor' ? MINOR_HUE_OFFSET : 0);
}

export function keyCenterName(keyCenter: Pick<KeyCenter, 'tonic' | 'mode'>): string {
	return `${keyCenter.tonic} ${keyCenter.mode}`;
}

export function isValidKey(key: string): boolean {
	return KEY_PATTERN.test(key);
}

export function emptyBar(): Bar {
	return { chords: [] };
}

export function emptyChart(): Chart {
	return { sections: [{ label: 'A', bars: [emptyBar()] }] };
}

export function isValidTimeSignature(signature: TimeSignature): boolean {
	return (
		Number.isInteger(signature.beats) &&
		signature.beats >= 1 &&
		signature.beats <= MAX_BEATS_PER_BAR &&
		BEAT_UNITS.includes(signature.unit)
	);
}

function inheritTimeSignature(inherited: TimeSignature, bar: Bar): TimeSignature {
	return bar.timeSignature ?? inherited;
}

export function effectiveTimeSignatures(chart: Chart): TimeSignature[] {
	let current = DEFAULT_TIME_SIGNATURE;
	return chart.sections.flatMap((section) =>
		section.bars.map((bar) => {
			current = inheritTimeSignature(current, bar);
			return current;
		})
	);
}

export function barToSlots(bar: Bar, beats: number): string[] {
	const slots = Array.from({ length: beats }, () => '');
	for (const chord of bar.chords) if (chord.beat <= beats) slots[chord.beat - 1] = chord.symbol;
	return slots;
}

export function slotsToChords(slots: string[]): PlacedChord[] {
	return slots.flatMap((symbol, i) =>
		symbol.trim() ? [{ beat: i + 1, symbol: symbol.trim() }] : []
	);
}

export function sameBarGrid(a: Chart, b: Chart): boolean {
	if (a.sections.length !== b.sections.length) return false;
	const signaturesA = effectiveTimeSignatures(a);
	const signaturesB = effectiveTimeSignatures(b);
	let index = 0;
	for (const [s, sectionA] of a.sections.entries()) {
		const sectionB = b.sections[s];
		if (sectionA.label !== sectionB.label || sectionA.bars.length !== sectionB.bars.length) {
			return false;
		}
		for (const [i, barA] of sectionA.bars.entries()) {
			const barB = sectionB.bars[i];
			const sameSignature =
				signaturesA[index].beats === signaturesB[index].beats &&
				signaturesA[index].unit === signaturesB[index].unit;
			if (
				!sameSignature ||
				Boolean(barA.repeatStart) !== Boolean(barB.repeatStart) ||
				Boolean(barA.repeatEnd) !== Boolean(barB.repeatEnd) ||
				barA.ending !== barB.ending
			) {
				return false;
			}
			index++;
		}
	}
	return true;
}

export function differingBars(source: Chart, simplified: Chart): number[] {
	const sourceBars = source.sections.flatMap((section) => section.bars);
	const simplifiedBars = simplified.sections.flatMap((section) => section.bars);
	return simplifiedBars.flatMap((bar, i) => (sameChords(bar, sourceBars[i]) ? [] : [i]));
}

function sameChords(a: Bar, b: Bar | undefined): boolean {
	return (
		b !== undefined &&
		a.chords.length === b.chords.length &&
		a.chords.every(
			(chord, i) => chord.beat === b.chords[i].beat && chord.symbol === b.chords[i].symbol
		)
	);
}

export function validateChart(chart: unknown): Result<Chart> {
	if (!isRecord(chart) || !Array.isArray(chart.sections) || chart.sections.length === 0) {
		return { error: 'Chart must have at least one section.' };
	}
	if (chart.sections.length > MAX_SECTIONS) {
		return { error: `A chart has at most ${MAX_SECTIONS} sections.` };
	}

	const sections: Section[] = [];
	let timeSignature = DEFAULT_TIME_SIGNATURE;
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
			const bar = validateBar(rawBar, `${sectionLocation} (${label}), bar ${b + 1}`, timeSignature);
			if ('error' in bar) return bar;
			timeSignature = inheritTimeSignature(timeSignature, bar.value);
			bars.push(bar.value);
		}
		sections.push({ label, bars });
	}
	const structure = validateStructure({ sections });
	if (structure) return { error: structure };

	const keyCenters = validateKeyCenters(chart.keyCenters, countBars({ sections }));
	if ('error' in keyCenters) return keyCenters;
	return {
		value: keyCenters.value.length ? { sections, keyCenters: keyCenters.value } : { sections }
	};
}

function validateKeyCenters(raw: unknown, barCount: number): Result<KeyCenter[]> {
	if (raw === undefined) return { value: [] };
	if (!Array.isArray(raw)) return { error: 'Key centers must be a list.' };

	const keyCenters: KeyCenter[] = [];
	for (const [i, item] of raw.entries()) {
		const location = `Key center ${i + 1}`;
		if (!isRecord(item)) return { error: `${location}: must be an object.` };
		const { startBar, endBar, tonic, mode } = item;
		if (
			typeof startBar !== 'number' ||
			typeof endBar !== 'number' ||
			!Number.isInteger(startBar) ||
			!Number.isInteger(endBar)
		) {
			return { error: `${location}: start and end must be whole bar numbers.` };
		}
		if (startBar < 1 || endBar > barCount) {
			return { error: `${location}: bars must be within 1 to ${barCount}.` };
		}
		if (endBar < startBar) return { error: `${location}: end bar is before the start bar.` };
		if (typeof tonic !== 'string' || !isValidTonic(tonic)) {
			return { error: `${location}: tonic must be a note like C, Bb or F#.` };
		}
		const keyMode = KEY_MODES.find((m) => m === mode);
		if (!keyMode) return { error: `${location}: mode must be ${KEY_MODES.join(' or ')}.` };
		keyCenters.push({ startBar, endBar, tonic, mode: keyMode });
	}

	keyCenters.sort((a, b) => a.startBar - b.startBar);
	for (const [i, keyCenter] of keyCenters.entries()) {
		const previous = keyCenters[i - 1];
		if (previous && keyCenter.startBar <= previous.endBar) {
			return {
				error: `Key centers ${keyCenterName(previous)} and ${keyCenterName(keyCenter)} overlap at bar ${keyCenter.startBar}.`
			};
		}
	}
	return { value: keyCenters };
}

function validateTimeSignature(raw: unknown, location: string): Result<TimeSignature> {
	const candidate = isRecord(raw) ? { beats: raw.beats, unit: raw.unit } : null;
	if (
		!candidate ||
		typeof candidate.beats !== 'number' ||
		typeof candidate.unit !== 'number' ||
		!isValidTimeSignature({ beats: candidate.beats, unit: candidate.unit })
	) {
		return {
			error: `${location}: time signature needs 1 to ${MAX_BEATS_PER_BAR} beats over a unit of ${BEAT_UNITS.join(', ')}.`
		};
	}
	return { value: { beats: candidate.beats, unit: candidate.unit } };
}

function validateBar(rawBar: unknown, location: string, inherited: TimeSignature): Result<Bar> {
	if (!isRecord(rawBar) || !Array.isArray(rawBar.chords)) {
		return { error: `${location}: chords must be a list.` };
	}
	const marks: Pick<Bar, 'repeatStart' | 'repeatEnd' | 'ending' | 'timeSignature'> = {};
	for (const flag of ['repeatStart', 'repeatEnd'] as const) {
		const value = rawBar[flag];
		if (value === undefined || value === false) continue;
		if (value !== true) return { error: `${location}: ${flag} must be true or omitted.` };
		marks[flag] = true;
	}
	if (rawBar.ending !== undefined) {
		const ending = ENDING_NUMBERS.find((n) => n === rawBar.ending);
		if (ending === undefined) {
			return { error: `${location}: ending must be ${ENDING_NUMBERS.join(' or ')}.` };
		}
		marks.ending = ending;
	}
	if (rawBar.timeSignature !== undefined) {
		const signature = validateTimeSignature(rawBar.timeSignature, location);
		if ('error' in signature) return signature;
		marks.timeSignature = signature.value;
	}
	const beats = (marks.timeSignature ?? inherited).beats;

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
		if (typeof beat !== 'number' || !Number.isInteger(beat) || beat < 1 || beat > beats) {
			return { error: `${location}: beat must be a whole number from 1 to ${beats}.` };
		}
		if (seenBeats.has(beat)) {
			return { error: `${location}: two chords on beat ${beat}.` };
		}
		seenBeats.add(beat);
		chords.push({ beat, symbol: normalizeChordSymbol(symbol) });
	}
	chords.sort((a, b) => a.beat - b.beat);
	return { value: { chords, ...marks } };
}

function validateStructure(chart: Chart): string | null {
	const bars = chart.sections.flatMap((section, s) =>
		section.bars.map((bar, b) => ({
			bar,
			location: `Section ${s + 1} (${section.label}), bar ${b + 1}`
		}))
	);
	let repeatOpen = false;
	for (const [i, { bar, location }] of bars.entries()) {
		const previous = bars[i - 1]?.bar.ending;
		const next = bars[i + 1]?.bar.ending;

		if (bar.repeatStart) {
			if (bar.ending) return `${location}: a repeat cannot start inside an ending.`;
			if (repeatOpen) return `${location}: repeats cannot be nested.`;
			repeatOpen = true;
		}

		if (bar.ending === 1 && previous !== 1 && !repeatOpen) {
			return `${location}: an ending needs an open repeat.`;
		}
		if (bar.ending === 2 && previous !== 1 && previous !== 2) {
			return `${location}: a 2nd ending must follow a 1st ending.`;
		}
		if (bar.ending === 1) {
			const lastOfEnding = next !== 1;
			if (lastOfEnding && next !== 2)
				return `${location}: a 1st ending must be followed by a 2nd ending.`;
			if (lastOfEnding && !bar.repeatEnd)
				return `${location}: a 1st ending must end with a repeat end.`;
			if (!lastOfEnding && bar.repeatEnd)
				return `${location}: only the last bar of a 1st ending can end the repeat.`;
		}
		if (bar.ending === 2 && bar.repeatEnd) return `${location}: a 2nd ending cannot end a repeat.`;

		if (bar.repeatEnd) {
			if (!repeatOpen) return `${location}: repeat end without a repeat start.`;
			repeatOpen = false;
		}
	}
	if (repeatOpen) return 'A repeat start has no matching repeat end.';
	return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
