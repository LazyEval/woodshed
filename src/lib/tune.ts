import type { Chart, SourceChartStatus } from '#lib/chart.js';

export interface TuneSummary {
	id: string;
	title: string;
	composer: string | null;
	key: string | null;
	sourceChartStatus: SourceChartStatus;
}

export interface TuneDetail extends TuneSummary {
	sourceChart: Chart;
}
