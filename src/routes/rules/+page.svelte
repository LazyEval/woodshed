<script lang="ts">
	import { resolve } from '$app/paths';
	import { ApiAction } from '#lib/api-action.svelte.js';
	import type { RuleView } from '#lib/tune.js';

	let { data } = $props();

	let editingId = $state<string | null>(null);
	let name = $state('');
	let text = $state('');
	const action = new ApiAction();

	function startEditing(rule: RuleView) {
		editingId = rule.id;
		name = rule.name;
		text = rule.text;
	}

	function reset() {
		editingId = null;
		name = '';
		text = '';
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const saved = editingId
			? await action.run(`/api/rules/${editingId}`, 'PUT', { name, text })
			: await action.run('/api/rules', 'POST', { name, text });
		if (saved) reset();
	}

	async function remove(rule: RuleView) {
		if (!confirm(`Delete Rule "${rule.name}"? Existing Simplified Charts keep their copy.`)) return;
		if ((await action.run(`/api/rules/${rule.id}`, 'DELETE')) && editingId === rule.id) reset();
	}
</script>

<svelte:head>
	<title>Woodshed · Rules</title>
</svelte:head>

<main>
	<p><a href={resolve('/')}>Home</a> · <a href={resolve('/tunes')}>Tunes</a></p>
	<h1>Rules</h1>

	{#if data.rules.length === 0}
		<p>No Rules yet.</p>
	{:else}
		<ul class="rules">
			{#each data.rules as rule (rule.id)}
				<li>
					<strong>{rule.name}</strong>
					<span>{rule.text}</span>
					<span>
						<button type="button" onclick={() => startEditing(rule)}>Edit</button>
						<button type="button" disabled={action.busy} onclick={() => remove(rule)}>
							Delete
						</button>
					</span>
				</li>
			{/each}
		</ul>
	{/if}

	<h2>{editingId ? 'Edit Rule' : 'New Rule'}</h2>
	<form onsubmit={save}>
		<label>Name <input bind:value={name} required maxlength="100" /></label>
		<label>
			Text
			<textarea
				bind:value={text}
				required
				maxlength="1000"
				rows="3"
				placeholder="VI and III chords become I"></textarea>
		</label>
		{#if action.error}<p role="alert">{action.error}</p>{/if}
		<button type="submit" disabled={action.busy}>{editingId ? 'Save' : 'Create'}</button>
		{#if editingId}<button type="button" onclick={reset}>Cancel</button>{/if}
	</form>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem;
	}
	form {
		display: grid;
		gap: 0.5rem;
	}
	.rules {
		padding: 0;
		list-style: none;
	}
	.rules li {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid #8884;
	}
</style>
