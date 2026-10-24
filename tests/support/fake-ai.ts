import type { AiClient, ExtractionRequest, GenerationRequest } from '#lib/server/ai.js';

type Scripted = unknown | Error;

export class FakeAiClient implements AiClient {
	extractions: Scripted[] = [];
	extractRequests: ExtractionRequest[] = [];
	generations: Scripted[] = [];
	generateRequests: GenerationRequest[] = [];

	willExtract(...results: Scripted[]) {
		this.extractions.push(...results);
	}

	willGenerate(...results: Scripted[]) {
		this.generations.push(...results);
	}

	extract(request: ExtractionRequest) {
		this.extractRequests.push(request);
		return respond(this.extractions);
	}

	generate(request: GenerationRequest) {
		this.generateRequests.push(request);
		return respond(this.generations);
	}
}

function respond(scripted: Scripted[]) {
	const next = scripted.length > 1 ? scripted.shift() : scripted[0];
	return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
}
