<script lang="ts">
	import { resolve } from '$app/paths';
	import { ApiAction } from '#lib/api-action.svelte.js';
	import type { RuleView, TuneDetail } from '#lib/tune.js';

	interface Props {
		tune: TuneDetail;
		rules: RuleView[];
		selectedId: string | null;
		locked: boolean;
	}

	let { tune, rules, selectedId = $bindable(), locked }: Props = $props();

	let creating = $state(false);
	let generating = $state(false);
	let name = $state('');
	let chosenRuleIds = $state<string[]>([]);
	let note = $state('');
	const action = new ApiAction();

	async function generate(event: SubmitEvent) {
		event.preventDefault();
		const before = new Set(tune.simplifiedCharts.map((chart) => chart.id));
		const generated = await action.run(`/api/tunes/${tune.id}/generate`, 'POST', {
			name,
			ruleIds: chosenRuleIds,
			note
		});
		if (!generated) return;
		selectedId = tune.simplifiedCharts.find((chart) => !before.has(chart.id))?.id ?? null;
		generating = false;
		name = '';
		note = '';
		chosenRuleIds = [];
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		const before = new Set(tune.simplifiedCharts.map((chart) => chart.id));
		if (!(await action.run(`/api/tunes/${tune.id}/simplified-charts`, 'POST', { name }))) return;
		selectedId = tune.simplifiedCharts.find((chart) => !before.has(chart.id))?.id ?? null;
		creating = false;
		name = '';
	}
</script>

<div role="tablist" class="tabs">
	<button
		type="button"
		role="tab"
		aria-selected={selectedId === null}
		disabled={locked}
		onclick={() => (selectedId = null)}>Source</button
	>
	{#each tune.simplifiedCharts as chart (chart.id)}
		<button
			type="button"
			role="tab"
			aria-selected={selectedId === chart.id}
			disabled={locked}
			onclick={() => (selectedId = chart.id)}>{chart.name}</button
		>
	{/each}
	{#if tune.sourceChartStatus === 'verified' && !creating && !generating}
		<button type="button" disabled={locked} onclick={() => (creating = true)}>
			+ Simplified Chart
		</button>
		<button type="button" disabled={locked} onclick={() => (generating = true)}>Generate</button>
	{/if}
</div>

{#if creating}
	<form class="create" onsubmit={create}>
		<label>Name <input bind:value={name} required maxlength="100" /></label>
		<button type="submit" disabled={action.busy}>Create</button>
		<button type="button" onclick={() => (creating = false)}>Cancel</button>
	</form>
{/if}
{#if generating}
	<form class="generate" onsubmit={generate}>
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
		<button type="submit" disabled={action.busy}>Generate</button>
		<button type="button" disabled={action.busy} onclick={() => (generating = false)}>
			Cancel
		</button>
		{#if action.busy}<p role="status">Generating…</p>{/if}
	</form>
{/if}
{#if action.error}<p role="alert">{action.error}</p>{/if}

<style>
	.tabs,
	.create {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}
	.create {
		align-items: end;
	}
	[aria-selected='true'] {
		font-weight: 700;
		text-decoration: underline;
	}
	.generate {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
</style>
