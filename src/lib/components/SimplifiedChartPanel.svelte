<script lang="ts">
	import { ApiAction } from '#lib/api-action.svelte.js';
	import ChartGrid from '#lib/components/ChartGrid.svelte';
	import ChordsEditor from '#lib/components/ChordsEditor.svelte';
	import { differingBars, type Chart, type SimplifiedChartOrigin } from '#lib/chart.js';
	import type { SimplifiedChartView, TuneDetail } from '#lib/tune.js';

	interface Props {
		tune: TuneDetail;
		simplified: SimplifiedChartView;
		editing: boolean;
		ondeleted: () => void;
	}

	let { tune, simplified, editing = $bindable(), ondeleted }: Props = $props();

	const ORIGIN_LABELS: Record<SimplifiedChartOrigin, string> = { manual: 'Written by hand' };

	let renaming = $state(false);
	let name = $state('');
	let confirmingDelete = $state(false);
	const action = new ApiAction();

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
			Simplified Chart · {ORIGIN_LABELS[simplified.origin]}{simplified.archivedAt
				? ' · Archived'
				: ''}
		</small>
	</h2>
{/if}

{#if simplified.archivedAt}
	<ChartGrid chart={simplified.chart} />
	<p>Archived: the Source Chart's bar grid changed. Read-only.</p>
	{#if confirmingDelete}
		<button type="button" disabled={action.busy} onclick={remove}>Confirm delete</button>
		<button type="button" onclick={() => (confirmingDelete = false)}>Keep</button>
	{:else}
		<button type="button" onclick={() => (confirmingDelete = true)}>Delete</button>
	{/if}
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
	<ChartGrid
		chart={simplified.chart}
		highlightedBars={differingBars(tune.sourceChart, simplified.chart)}
		flaggedBars={simplified.flaggedBars}
		onclearflag={clearFlag}
		busy={action.busy}
	/>
	<button type="button" onclick={() => (editing = true)}>Edit chords</button>
	<button type="button" onclick={startRenaming}>Rename</button>
	{#if confirmingDelete}
		<button type="button" disabled={action.busy} onclick={remove}>Confirm delete</button>
		<button type="button" onclick={() => (confirmingDelete = false)}>Keep</button>
	{:else}
		<button type="button" onclick={() => (confirmingDelete = true)}>Delete</button>
	{/if}
	{#if action.error}<p role="alert">{action.error}</p>{/if}
{/if}
