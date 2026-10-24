import type { Chart, SimplifiedChartOrigin, SourceChartStatus } from '#lib/chart.js';
import type { Schedule } from '#lib/rotation.js';

export interface TuneSummary {
	id: string;
	title: string;
	composer: string | null;
	key: string | null;
	sourceChartStatus: SourceChartStatus;
	shelved: boolean;
}

export interface SimplifiedChartSummary {
	id: string;
	name: string;
	origin: SimplifiedChartOrigin;
	chart: Chart;
}

export interface TuneDetail extends TuneSummary, Schedule {
	sourceChart: Chart;
	simplifiedCharts: SimplifiedChartSummary[];
	scanPageCount: number;
	verifiedAt: number | null;
}
