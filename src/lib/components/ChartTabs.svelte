<script lang="ts">
	import { ApiAction } from '#lib/api-action.svelte.js';
	import GenerateForm from '#lib/components/GenerateForm.svelte';
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
	let knownIds = new Set<string>();
	const action = new ApiAction();

	function startGenerating() {
		rememberCharts();
		generating = true;
	}

	function rememberCharts() {
		knownIds = new Set(tune.simplifiedCharts.map((chart) => chart.id));
	}

	function selectNewChart() {
		selectedId = tune.simplifiedCharts.find((chart) => !knownIds.has(chart.id))?.id ?? null;
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		rememberCharts();
		if (!(await action.run(`/api/tunes/${tune.id}/simplified-charts`, 'POST', { name }))) return;
		selectNewChart();
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
		<button type="button" disabled={locked} onclick={startGenerating}>Generate</button>
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
	<GenerateForm
		tuneId={tune.id}
		{rules}
		ondone={() => {
			generating = false;
			selectNewChart();
		}}
		oncancel={() => (generating = false)}
	/>
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
</style>
