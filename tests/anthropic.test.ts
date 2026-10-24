import { describe, expect, it } from 'vitest';
import { createAnthropicAiClient } from '#lib/server/anthropic.js';
import type { Chart } from '#lib/chart.js';

const source: Chart = {
	sections: [{ label: 'A', bars: [{ chords: [{ beat: 1, symbol: 'Cmaj7' }] }] }],
	keyCenters: [{ startBar: 1, endBar: 1, tonic: 'C', mode: 'major' }]
};

interface Sent {
	url: string;
	headers: Record<string, string>;
	body: {
		model: string;
		output_config: { format: { type: string } };
		messages: { content: { type: string; text?: string }[] }[];
	};
}

function fakeFetch(respond: () => Response) {
	const sent: Sent[] = [];
	const fetcher: typeof fetch = (input, init) => {
		sent.push({
			url: String(input),
			headers: init?.headers as Record<string, string>,
			body: JSON.parse(init?.body as string)
		});
		return Promise.resolve(respond());
	};
	return { fetcher, sent };
}

const textResponse = (text: string) =>
	Response.json({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

describe('anthropic client generate', () => {
	it('sends Source Chart, Key Centers, Rules, note and the previous problem, and parses the JSON output', async () => {
		const output = { chart: source, changes: [] };
		const { fetcher, sent } = fakeFetch(() => textResponse(JSON.stringify(output)));
		const client = createAnthropicAiClient('key', fetcher);

		const result = await client.generate({
			source,
			rules: [{ name: 'Collapse', text: 'VI becomes I' }],
			note: 'go easy',
			previousProblem: 'bad grid'
		});

		expect(result).toEqual(output);
		const [request] = sent;
		expect(request.headers['x-api-key']).toBe('key');
		expect(request.body.output_config.format.type).toBe('json_schema');
		const prompt = request.body.messages[0].content[0].text;
		expect(prompt).toContain(JSON.stringify(source));
		expect(prompt).toContain('Collapse: VI becomes I');
		expect(prompt).toContain('Note for this chart: go easy');
		expect(prompt).toContain('bad grid');
	});

	it('returns a description instead of throwing when the output is not JSON', async () => {
		const { fetcher } = fakeFetch(() => textResponse('not json'));
		const client = createAnthropicAiClient('key', fetcher);

		const result = await client.generate({ source, rules: [], note: 'x' });

		expect(result).toMatch(/not valid JSON/);
	});

	it('throws on an API error', async () => {
		const { fetcher } = fakeFetch(() =>
			Response.json({ error: { message: 'overloaded' } }, { status: 529 })
		);
		const client = createAnthropicAiClient('key', fetcher);

		await expect(client.generate({ source, rules: [], note: 'x' })).rejects.toThrow(/529/);
	});
});

describe('anthropic client extract', () => {
	it('includes the previous problem when retrying', async () => {
		const { fetcher, sent } = fakeFetch(() => textResponse('{}'));
		const client = createAnthropicAiClient('key', fetcher);

		await client.extract({ images: [], model: 'sonnet', previousProblem: 'bad repeat' });

		const prompt = sent[0].body.messages[0].content.at(-1)?.text;
		expect(prompt).toContain('bad repeat');
	});
});
