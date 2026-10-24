import type { PageLoad } from './$types';

export interface TuneSummary {
	id: string;
	title: string;
	composer: string | null;
	key: string | null;
	sourceChartStatus: 'draft' | 'verified';
}

export const load: PageLoad = async ({ fetch, url }) => {
	const q = url.searchParams.get('q') ?? '';
	const response = await fetch(`/api/tunes?q=${encodeURIComponent(q)}`);
	return { q, tunes: (await response.json()) as TuneSummary[] };
};
