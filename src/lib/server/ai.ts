export interface ChartBar {
	chords: string[];
}

export interface ChartSection {
	name: string;
	bars: ChartBar[];
}

export interface ChartGrid {
	sections: ChartSection[];
}

export interface ScanImage {
	bytes: Uint8Array;
	mediaType: string;
}

export interface GenerationRequest {
	source: ChartGrid;
	rules: string[];
}

export interface BarChange {
	section: number;
	bar: number;
	reason: string;
}

export interface GenerationResult {
	chart: ChartGrid;
	changes: BarChange[];
}

export interface AiClient {
	extractChart(scan: ScanImage): Promise<ChartGrid>;
	generateSimplifiedChart(request: GenerationRequest): Promise<GenerationResult>;
}

export const unconfiguredAiClient: AiClient = {
	extractChart: () => Promise.reject(new Error('AI client not configured')),
	generateSimplifiedChart: () => Promise.reject(new Error('AI client not configured'))
};
