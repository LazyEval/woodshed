import type { AiClient, ChartGrid, GenerationResult } from '#lib/server/ai.js';

export class FakeAiClient implements AiClient {
	extractedChart: ChartGrid = { sections: [] };
	generationResult: GenerationResult = { chart: { sections: [] }, changes: [] };

	extractChart() {
		return Promise.resolve(this.extractedChart);
	}

	generateSimplifiedChart() {
		return Promise.resolve(this.generationResult);
	}
}
