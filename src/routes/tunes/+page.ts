import type { TuneSummary } from '#lib/tune.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
	const q = url.searchParams.get('q') ?? '';
	const response = await fetch(`/api/tunes?q=${encodeURIComponent(q)}`);
	return { q, tunes: (await response.json()) as TuneSummary[] };
};
