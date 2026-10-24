import type { Chart, RuleSnapshot } from '#lib/chart.js';

export interface ChartBar {
	chords: string[];
}

export interface ChartSection {
	name: string;
	bars: ChartBar[];
}

export interface ScanImage {
	bytes: Uint8Array;
	mediaType: string;
}

export type ExtractionModel = 'sonnet' | 'opus';

export interface ExtractionRequest {
	images: ScanImage[];
	model: ExtractionModel;
	previousProblem?: string;
}

export interface GenerationRequest {
	source: Chart;
	rules: RuleSnapshot[];
	note: string | null;
	previousProblem?: string;
}

export interface AiClient {
	extract(request: ExtractionRequest): Promise<unknown>;
	generate(request: GenerationRequest): Promise<unknown>;
}

export const unconfiguredAiClient: AiClient = {
	extract: () => Promise.reject(new Error('AI client not configured')),
	generate: () => Promise.reject(new Error('AI client not configured'))
};
