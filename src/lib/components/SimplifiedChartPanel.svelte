<script lang="ts">
	import { ApiAction } from '#lib/api-action.svelte.js';
	import ChartGrid from '#lib/components/ChartGrid.svelte';
	import ChordsEditor from '#lib/components/ChordsEditor.svelte';
	import { differingBars, type Chart, type SimplifiedChartOrigin } from '#lib/chart.js';
	import { isArchived, type SimplifiedChartView, type TuneDetail } from '#lib/tune.js';

	interface Props {
		tune: TuneDetail;
		simplified: SimplifiedChartView;
		editing: boolean;
		ondeleted: () => void;
	}

	let { tune, simplified, editing = $bindable(), ondeleted }: Props = $props();

	const ORIGIN_LABELS: Record<SimplifiedChartOrigin, string> = {
		manual: 'Written by hand',
		generated: 'Generated'
	};

	let renaming = $state(false);
	let name = $state('');
	let confirmingDelete = $state(false);
	const action = new ApiAction();

	const differing = $derived(differingBars(tune.sourceChart, simplified.chart));
	const path = $derived(`/api/tunes/${tune.id}/simplified-charts/${simplified.id}`);

	function startRenaming() {
		name = simplified.name;
		renaming = true;
	}

	async function rename(event: SubmitEvent) {
		event.preventDefault();
		if (await action.run(path, 'PUT', { name })) renaming = false;
	}

	async function saveChords(chart: Chart) {
		if (await action.run(path, 'PUT', { chart })) editing = false;
	}

	async function clearFlag(bar: number) {
		await action.run(`${path}/flags/${bar}`, 'DELETE');
	}

	async function remove() {
		if (await action.run(path, 'DELETE')) ondeleted();
	}
</script>

{#snippet deleteControls()}
	{#if confirmingDelete}
		<button type="button" disabled={action.busy} onclick={remove}>Confirm delete</button>
		<button type="button" onclick={() => (confirmingDelete = false)}>Keep</button>
	{:else}
		<button type="button" onclick={() => (confirmingDelete = true)}>Delete</button>
	{/if}
{/snippet}

{#if renaming}
	<form onsubmit={rename}>
		<label>Name <input bind:value={name} required maxlength="100" /></label>
		<button type="submit" disabled={action.busy}>Save</button>
		<button type="button" onclick={() => (renaming = false)}>Cancel</button>
	</form>
{:else}
	<h2>
		{simplified.name}
		<small>
			Simplified Chart · {ORIGIN_LABELS[simplified.origin]}{isArchived(simplified)
				? ' · Archived'
				: ''}
		</small>
	</h2>
{/if}

{#if isArchived(simplified)}
	<ChartGrid chart={simplified.chart} />
	<p>Archived: the Source Chart's bar grid changed. Read-only.</p>
	{@render deleteControls()}
	{#if action.error}<p role="alert">{action.error}</p>{/if}
{:else if editing}
	<ChordsEditor
		chart={simplified.chart}
		saving={action.busy}
		error={action.error}
		onsave={saveChords}
	/>
	<button type="button" onclick={() => (editing = false)}>Cancel</button>
{:else}
	{#if simplified.generation}
		<details>
			<summary>Generation inputs</summary>
			{#if simplified.generation.rules.length}
				<ul>
					{#each simplified.generation.rules as rule, i (i)}
						<li><strong>{rule.name}</strong>: {rule.text}</li>
					{/each}
				</ul>
			{/if}
			{#if simplified.generation.note}<p>Note: {simplified.generation.note}</p>{/if}
		</details>
	{/if}
	<ChartGrid
		chart={simplified.chart}
		reasons={simplified.generation?.reasons.filter(({ barIndex }) => differing.includes(barIndex))}
		highlightedBars={differing}
		flaggedBars={simplified.flaggedBars}
		onclearflag={clearFlag}
		busy={action.busy}
	/>
	<button type="button" onclick={() => (editing = true)}>Edit chords</button>
	<button type="button" onclick={startRenaming}>Rename</button>
	{@render deleteControls()}
	{#if action.error}<p role="alert">{action.error}</p>{/if}
{/if}
