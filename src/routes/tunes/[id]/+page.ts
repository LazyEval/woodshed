import { error } from '@sveltejs/kit';
import type { Chart, SourceChartStatus } from '#lib/chart.js';
import type { PageLoad } from './$types';

export interface TuneDetail {
	id: string;
	title: string;
	composer: string | null;
	key: string | null;
	sourceChart: Chart;
	sourceChartStatus: SourceChartStatus;
}

export const load: PageLoad = async ({ fetch, params }) => {
	const response = await fetch(`/api/tunes/${params.id}`);
	if (!response.ok) error(response.status, 'Tune not found');
	return { tune: (await response.json()) as TuneDetail };
};
