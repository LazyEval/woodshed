import type { AiClient, ExtractionModel, ExtractionRequest, ScanImage } from '#lib/server/ai.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_OUTPUT_TOKENS = 16000;

const MODEL_IDS: Record<ExtractionModel, string> = {
	sonnet: 'claude-sonnet-5-5',
	opus: 'claude-opus-5-5'
};

const nullableText = { type: ['string', 'null'] };

const timeSignatureSchema = {
	type: 'object',
	properties: { beats: { type: 'integer' }, unit: { type: 'integer', enum: [2, 4, 8] } },
	required: ['beats', 'unit'],
	additionalProperties: false
};

const barSchema = {
	type: 'object',
	properties: {
		chords: {
			type: 'array',
			items: {
				type: 'object',
				properties: { beat: { type: 'integer' }, symbol: { type: 'string' } },
				required: ['beat', 'symbol'],
				additionalProperties: false
			}
		},
		repeatStart: { type: 'boolean' },
		repeatEnd: { type: 'boolean' },
		ending: { type: 'integer', enum: [1, 2] },
		timeSignature: timeSignatureSchema
	},
	required: ['chords'],
	additionalProperties: false
};

const EXTRACTION_SCHEMA = {
	type: 'object',
	properties: {
		title: nullableText,
		composer: nullableText,
		key: nullableText,
		chart: {
			type: 'object',
			properties: {
				sections: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							label: { type: 'string' },
							bars: { type: 'array', items: barSchema }
						},
						required: ['label', 'bars'],
						additionalProperties: false
					}
				},
				keyCenters: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							startBar: { type: 'integer' },
							endBar: { type: 'integer' },
							tonic: { type: 'string' },
							mode: { type: 'string', enum: ['major', 'minor'] }
						},
						required: ['startBar', 'endBar', 'tonic', 'mode'],
						additionalProperties: false
					}
				}
			},
			required: ['sections', 'keyCenters'],
			additionalProperties: false
		}
	},
	required: ['title', 'composer', 'key', 'chart'],
	additionalProperties: false
};

const EXTRACTION_PROMPT = `You transcribe a jazz chart from the attached image(s) into structured data. The images are consecutive pages of one chart, in order.

Rules:
- Transcribe the chord changes exactly as printed. Do not simplify, reharmonize or correct them.
- One entry in "bars" per printed bar. Group bars into sections using the printed section markers (A, B, Intro, Coda, ...). If none are printed, use a single section labelled "A".
- Each chord is placed on the beat where it starts (beat 1 is the first beat of the bar). A bar with a single chord has it on beat 1. An empty or unreadable bar has an empty chord list.
- Chord symbols: root A-G with optional # or b, then quality and extensions such as m7, maj7, 7b9, m7b5, dim7, sus4, 6/9, with an optional slash bass (C/E). Write "N.C." for no chord. Do not use unicode flats or sharps. Use "maj" for major seventh, "m" for minor, and "dim" or "m7b5" for diminished and half-diminished.
- Repeats: set repeatStart on the first bar of a repeated passage and repeatEnd on its last bar. Set ending to 1 or 2 on bars under a first or second ending. The last bar of a first ending MUST have repeatEnd: true (the repeat sign printed at the end of the first ending), and the second ending follows it. Example: bars 7-8 are the first ending and bar 9 the second: bar 7 {ending:1}, bar 8 {ending:1, repeatEnd:true}, bar 9 {ending:2}.
- Set timeSignature on a bar only where the time signature is printed or changes. Assume 4/4 otherwise.
- title, composer and key come from the page; use null when not printed. key is the tonic with an optional "m" for minor, e.g. "Bb" or "F#m".
- keyCenters: propose spans of bars (1-based, counted across the whole chart from the first section to the last, inclusive) that function in a single local key, with the tonic as a note name like "C", "Bb" or "F#" and mode "major" or "minor". Spans must not overlap. Use an empty list if unsure.`;

interface MessagesResponse {
	content?: { type: string; text?: string }[];
	stop_reason?: string;
	error?: { message?: string };
}

function toBase64(bytes: Uint8Array): string {
	const chunkSize = 0x8000;
	let binary = '';
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

function imageBlock(image: ScanImage) {
	return {
		type: 'image',
		source: { type: 'base64', media_type: image.mediaType, data: toBase64(image.bytes) }
	};
}

export function createAnthropicAiClient(apiKey: string, fetcher: typeof fetch = fetch): AiClient {
	return {
		async extract({ images, model, previousProblem }: ExtractionRequest) {
			const instruction = previousProblem
				? `${EXTRACTION_PROMPT}\n\nYour previous attempt was rejected: ${previousProblem}\nTranscribe again and fix this.`
				: EXTRACTION_PROMPT;
			const response = await fetcher(API_URL, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-api-key': apiKey,
					'anthropic-version': API_VERSION
				},
				body: JSON.stringify({
					model: MODEL_IDS[model],
					max_tokens: MAX_OUTPUT_TOKENS,
					output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
					messages: [
						{
							role: 'user',
							content: [...images.map(imageBlock), { type: 'text', text: instruction }]
						}
					]
				})
			});
			const body = (await response.json()) as MessagesResponse;
			if (!response.ok) {
				throw new Error(`Anthropic API ${response.status}: ${body.error?.message ?? 'error'}`);
			}
			const text = body.content?.find((block) => block.type === 'text')?.text;
			if (!text) return `Output was empty (stop reason: ${body.stop_reason}).`;
			try {
				return JSON.parse(text) as unknown;
			} catch {
				return `Output was not valid JSON (stop reason: ${body.stop_reason}).`;
			}
		},

		generateSimplifiedChart: () => Promise.reject(new Error('Generation is not implemented yet'))
	};
}
