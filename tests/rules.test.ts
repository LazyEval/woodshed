import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { createRule, deleteRule, listRules, updateRule } from '#lib/server/rules.js';
import { createTestApp, jsonRequest, type TestApp } from './support/app';

interface RuleJson {
	id: string;
	name: string;
	text: string;
	error?: string;
}

async function create(app: TestApp, body: object) {
	const response = await createRule(jsonRequest('/api/rules', 'POST', body), app.deps);
	return { response, rule: (await response.json()) as RuleJson };
}

async function all(app: TestApp) {
	return (await (await listRules(app.deps)).json()) as RuleJson[];
}

beforeEach(async () => {
	await env.DB.exec('DELETE FROM rules');
});

describe('rule library', () => {
	it('creates and lists Rules', async () => {
		const app = createTestApp();

		const { response, rule } = await create(app, {
			name: ' Collapse VI ',
			text: ' VI chords become I '
		});

		expect(response.status).toBe(201);
		expect(rule).toMatchObject({ name: 'Collapse VI', text: 'VI chords become I' });
		expect(await all(app)).toEqual([expect.objectContaining({ id: rule.id })]);
	});

	it.each([
		{ name: '', text: 'x' },
		{ name: 'x', text: '  ' },
		{ name: 'x' },
		{ name: 'n'.repeat(101), text: 'x' },
		{ name: 'x', text: 't'.repeat(1001) }
	])('rejects an invalid Rule %j', async (body) => {
		const app = createTestApp();

		const { response } = await create(app, body);

		expect(response.status).toBe(400);
		expect(await all(app)).toEqual([]);
	});

	it('edits a Rule', async () => {
		const app = createTestApp();
		const { rule } = await create(app, { name: 'A', text: 'one' });

		const response = await updateRule(
			jsonRequest(`/api/rules/${rule.id}`, 'PUT', { name: 'B', text: 'two' }),
			app.deps,
			rule.id
		);

		expect(await response.json()).toMatchObject({ id: rule.id, name: 'B', text: 'two' });
		expect(await all(app)).toEqual([expect.objectContaining({ name: 'B', text: 'two' })]);
	});

	it('answers 404 when editing or deleting an unknown Rule', async () => {
		const app = createTestApp();

		const edit = await updateRule(
			jsonRequest('/api/rules/nope', 'PUT', { name: 'B', text: 'two' }),
			app.deps,
			'nope'
		);
		const remove = await deleteRule(app.deps, 'nope');

		expect([edit.status, remove.status]).toEqual([404, 404]);
	});

	it('deletes a Rule', async () => {
		const app = createTestApp();
		const { rule } = await create(app, { name: 'A', text: 'one' });

		const response = await deleteRule(app.deps, rule.id);

		expect(response.status).toBe(204);
		expect(await all(app)).toEqual([]);
	});
});
