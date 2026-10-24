import { describe, expect, it } from 'vitest';
import { sameBarGrid, type Bar, type Chart } from '#lib/chart.js';

const bar = (extra: Partial<Bar> = {}): Bar => ({ chords: [{ beat: 1, symbol: 'C' }], ...extra });

const chart = (...sections: [string, Bar[]][]): Chart => ({
	sections: sections.map(([label, bars]) => ({ label, bars }))
});

describe('sameBarGrid', () => {
	const base = chart(
		['A', [bar({ repeatStart: true }), bar({ ending: 1, repeatEnd: true }), bar({ ending: 2 })]],
		['B', [bar()]]
	);

	it('ignores chords', () => {
		const other = chart(
			[
				'A',
				[
					{ chords: [{ beat: 2, symbol: 'Dm7' }], repeatStart: true },
					{ chords: [], ending: 1, repeatEnd: true },
					{ chords: [{ beat: 4, symbol: 'G7' }], ending: 2 }
				]
			],
			['B', [{ chords: [] }]]
		);

		expect(sameBarGrid(base, other)).toBe(true);
	});

	it('ignores a time signature that restates the inherited one', () => {
		const restated = structuredClone(base);
		restated.sections[0].bars[0].timeSignature = { beats: 4, unit: 4 };

		expect(sameBarGrid(base, restated)).toBe(true);
	});

	it('differs on section labels, section or bar counts', () => {
		const relabelled = structuredClone(base);
		relabelled.sections[1].label = 'C';
		const extraBar = structuredClone(base);
		extraBar.sections[1].bars.push(bar());
		const extraSection = structuredClone(base);
		extraSection.sections.push({ label: 'D', bars: [bar()] });

		expect(sameBarGrid(base, relabelled)).toBe(false);
		expect(sameBarGrid(base, extraBar)).toBe(false);
		expect(sameBarGrid(base, extraSection)).toBe(false);
	});

	it('differs on repeats and endings', () => {
		const noRepeat = structuredClone(base);
		delete noRepeat.sections[0].bars[0].repeatStart;
		const otherEnding = structuredClone(base);
		otherEnding.sections[0].bars[2].ending = 1;

		expect(sameBarGrid(base, noRepeat)).toBe(false);
		expect(sameBarGrid(base, otherEnding)).toBe(false);
	});

	it('differs on effective beat slots, including inherited ones', () => {
		const waltz = structuredClone(base);
		waltz.sections[0].bars[0].timeSignature = { beats: 3, unit: 4 };
		const waltzOnlyHere = structuredClone(waltz);
		waltzOnlyHere.sections[0].bars[1].timeSignature = { beats: 4, unit: 4 };

		expect(sameBarGrid(base, waltz)).toBe(false);
		expect(sameBarGrid(waltz, waltzOnlyHere)).toBe(false);
	});
});
