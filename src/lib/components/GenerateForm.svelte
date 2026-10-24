<script lang="ts">
	import { resolve } from '$app/paths';
	import { ApiAction } from '#lib/api-action.svelte.js';
	import type { RuleView } from '#lib/tune.js';

	interface Props {
		tuneId: string;
		rules: RuleView[];
		ondone: () => void;
		oncancel: () => void;
	}

	let { tuneId, rules, ondone, oncancel }: Props = $props();

	let name = $state('');
	let chosenRuleIds = $state<string[]>([]);
	let note = $state('');
	let model = $state<'sonnet' | 'opus'>('sonnet');
	const action = new ApiAction();

	async function generate(event: SubmitEvent) {
		event.preventDefault();
		const generated = await action.run(`/api/tunes/${tuneId}/generate`, 'POST', {
			name,
			ruleIds: chosenRuleIds,
			note,
			model
		});
		if (generated) ondone();
	}
</script>

<form onsubmit={generate}>
	<label>Name <input bind:value={name} maxlength="100" placeholder="Generated" /></label>
	<fieldset>
		<legend>Rules</legend>
		{#each rules as rule (rule.id)}
			<label title={rule.text}>
				<input type="checkbox" value={rule.id} bind:group={chosenRuleIds} />
				{rule.name}
			</label>
		{:else}
			<p>No Rules yet. <a href={resolve('/rules')}>Write some</a>.</p>
		{/each}
	</fieldset>
	<label>Note <textarea bind:value={note} maxlength="1000" rows="2"></textarea></label>
	<label>
		Model
		<select bind:value={model}>
			<option value="sonnet">Sonnet</option>
			<option value="opus">Opus (slower, stronger)</option>
		</select>
	</label>
	<button type="submit" disabled={action.busy}>Generate</button>
	<button type="button" disabled={action.busy} onclick={oncancel}>Cancel</button>
	{#if action.busy}<p role="status">Generating…</p>{/if}
	{#if action.error}<p role="alert">{action.error}</p>{/if}
</form>

<style>
	form {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
</style>
