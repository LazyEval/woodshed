import type { Clock } from '#lib/server/clock.js';

export interface FakeClock extends Clock {
	advance(ms: number): void;
}

export function fakeClock(start = '2026-01-01T00:00:00Z'): FakeClock {
	let current = new Date(start).getTime();
	return {
		now: () => new Date(current),
		advance: (ms) => {
			current += ms;
		}
	};
}
