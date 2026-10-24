import type {
	Chart,
	GenerationRecord,
	SimplifiedChartOrigin,
	SourceChartStatus
} from '#lib/chart.js';
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
	generation: GenerationRecord | null;
	flaggedBars: number[];
	archivedAt: number | null;
}

export interface TuneDetail extends TuneSummary, Schedule {
	sourceChart: Chart;
	simplifiedCharts: SimplifiedChartView[];
	scanPageCount: number;
	scanVersion: number;
	verifiedAt: number | null;
}

export const isArchived = (chart: Pick<SimplifiedChartView, 'archivedAt'>) =>
	chart.archivedAt !== null;

export const CONFIRM_ARCHIVE = { name: 'confirmArchive', value: 'true' } as const;

export interface RuleView {
	id: string;
	name: string;
	text: string;
}
