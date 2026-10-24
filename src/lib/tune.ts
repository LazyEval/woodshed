import type { Chart, SourceChartStatus } from '#lib/chart.js';
import type { Rotation } from '#lib/rotation.js';

export interface TuneSummary {
	id: string;
	title: string;
	composer: string | null;
	key: string | null;
	sourceChartStatus: SourceChartStatus;
	shelved: boolean;
}

export interface TuneDetail extends TuneSummary, Rotation {
	sourceChart: Chart;
	verifiedAt: number | null;
}
