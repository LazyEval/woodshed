import type { AiClient, ExtractionRequest, GenerationResult } from '#lib/server/ai.js';

type Extraction = unknown | Error;

export class FakeAiClient implements AiClient {
	extractions: Extraction[] = [];
	extractRequests: ExtractionRequest[] = [];
	generationResult: GenerationResult = { chart: { sections: [] }, changes: [] };

	willExtract(...results: Extraction[]) {
		this.extractions.push(...results);
	}

	extract(request: ExtractionRequest) {
		this.extractRequests.push(request);
		const next = this.extractions.length > 1 ? this.extractions.shift() : this.extractions[0];
		return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
	}

	generateSimplifiedChart() {
		return Promise.resolve(this.generationResult);
	}
}
