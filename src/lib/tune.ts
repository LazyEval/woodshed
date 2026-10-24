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

export interface SimplifiedChartView {
	id: string;
	name: string;
	origin: SimplifiedChartOrigin;
	chart: Chart;
	flaggedBars: number[];
	archivedAt: number | null;
}

export interface TuneDetail extends TuneSummary, Schedule {
	sourceChart: Chart;
	simplifiedCharts: SimplifiedChartView[];
	scanPageCount: number;
	verifiedAt: number | null;
}

export const isArchived = (chart: Pick<SimplifiedChartView, 'archivedAt'>) =>
	chart.archivedAt !== null;
