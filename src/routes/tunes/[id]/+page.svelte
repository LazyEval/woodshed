<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { sendJson as send } from '#lib/api.js';
	import TuneFields from '#lib/components/TuneFields.svelte';
	import ChartEditor from '#lib/components/ChartEditor.svelte';
	import ChartGrid from '#lib/components/ChartGrid.svelte';
	import PracticeLog from '#lib/components/PracticeLog.svelte';
	import { differingBars, type Chart } from '#lib/chart.js';

	let { data } = $props();
	const tune = $derived(data.tune);

	let editingDetails = $state(false);
	let editingChart = $state(false);
	let title = $state('');
	let composer = $state('');
	let key = $state('');
	let detailsError = $state<string | null>(null);
	let chartError = $state<string | null>(null);
	let saving = $state(false);

	function startEditingDetails() {
		title = tune.title;
		composer = tune.composer ?? '';
		key = tune.key ?? '';
		detailsError = null;
		editingDetails = true;
	}

	async function saveDetails(event: SubmitEvent) {
		event.preventDefault();
		const result = await send(`/api/tunes/${tune.id}`, 'PATCH', { title, composer, key });
		if (!result.ok) {
			detailsError = result.body.error;
			return;
		}
		editingDetails = false;
		await invalidateAll();
	}

	async function saveChart(chart: Chart) {
		saving = true;
		chartError = null;
		const result = await send(`/api/tunes/${tune.id}/chart`, 'PUT', { chart });
		saving = false;
		if (!result.ok) {
			chartError = result.body.error;
			return;
		}
		editingChart = false;
		await invalidateAll();
	}

	let extracting = $state(false);
	let extractError = $state<string | null>(null);

	async function reextractWithOpus() {
		if (!confirm('Replace the Draft chart with a new extraction from the Scan?')) return;
		extracting = true;
		extractError = null;
		const result = await send(`/api/tunes/${tune.id}/extract`, 'POST', { model: 'opus' });
		extracting = false;
		if (!result.ok) {
			extractError = result.body.error;
			return;
		}
		await invalidateAll();
	}

	async function verify() {
		const result = await send(`/api/tunes/${tune.id}/verify`, 'POST');
		if (result.ok) await invalidateAll();
	}

	async function reopen() {
		const result = await send(`/api/tunes/${tune.id}/reopen`, 'POST');
		if (result.ok) await invalidateAll();
	}

	let selectedChartId = $state<string | null>(null);
	let editingSimplified = $state(false);
	let simplifiedError = $state<string | null>(null);
	let savingSimplified = $state(false);

	const selectedSimplified = $derived(
		tune.simplifiedCharts.find((chart) => chart.id === selectedChartId) ?? null
	);

	const simplifiedPath = (id: string) => `/api/tunes/${tune.id}/simplified-charts/${id}`;

	function select(id: string | null) {
		selectedChartId = id;
		editingSimplified = false;
		simplifiedError = null;
	}

	async function createSimplified() {
		const name = prompt('Name for the Simplified Chart');
		if (!name) return;
		const result = await send<{ id: string; error?: string }>(
			`/api/tunes/${tune.id}/simplified-charts`,
			'POST',
			{ name }
		);
		if (!result.ok) {
			simplifiedError = result.body.error ?? 'Could not create the Simplified Chart.';
			return;
		}
		await invalidateAll();
		select(result.body.id);
	}

	async function saveSimplified(chart: Chart) {
		if (!selectedSimplified) return;
		savingSimplified = true;
		simplifiedError = null;
		const result = await send(simplifiedPath(selectedSimplified.id), 'PUT', { chart });
		savingSimplified = false;
		if (!result.ok) {
			simplifiedError = result.body.error;
			return;
		}
		editingSimplified = false;
		await invalidateAll();
	}

	async function renameSimplified() {
		if (!selectedSimplified) return;
		const name = prompt('Rename Simplified Chart', selectedSimplified.name);
		if (!name) return;
		const result = await send(simplifiedPath(selectedSimplified.id), 'PUT', { name });
		if (!result.ok) simplifiedError = result.body.error;
		else await invalidateAll();
	}

	async function removeSimplified() {
		if (!selectedSimplified || !confirm(`Delete "${selectedSimplified.name}"?`)) return;
		const result = await send(simplifiedPath(selectedSimplified.id), 'DELETE');
		if (!result.ok) {
			simplifiedError = result.body.error;
			return;
		}
		select(null);
		await invalidateAll();
	}

	async function remove() {
		if (!confirm(`Delete "${tune.title}"? This cannot be undone.`)) return;
		const result = await send(`/api/tunes/${tune.id}`, 'DELETE');
		if (result.ok) await goto(resolve('/tunes'));
	}
</script>

<svelte:head>
	<title>Woodshed · {tune.title}</title>
</svelte:head>

{#snippet scanPages()}
	{#each Array.from({ length: tune.scanPageCount }, (_, i) => i) as page (page)}
		<img src={`/api/tunes/${tune.id}/scan/${page}`} alt={`Scan page ${page + 1}`} />
	{/each}
{/snippet}

<main>
	<p><a href={resolve('/tunes')}>Tunes</a></p>

	{#if editingDetails}
		<form onsubmit={saveDetails}>
			<TuneFields bind:title bind:composer bind:key />
			{#if detailsError}<p role="alert">{detailsError}</p>{/if}
			<button type="submit">Save</button>
			<button type="button" onclick={() => (editingDetails = false)}>Cancel</button>
		</form>
	{:else}
		<h1>{tune.title}</h1>
		<p>{[tune.composer, tune.key && `Key of ${tune.key}`].filter(Boolean).join(' · ')}</p>
		<button type="button" onclick={startEditingDetails}>Edit details</button>
	{/if}

	<div class="workspace" class:split={tune.scanPageCount > 0 && tune.sourceChartStatus === 'draft'}>
		{#if tune.scanPageCount > 0}
			{#if tune.sourceChartStatus === 'draft'}
				<section class="scan">
					<h2>Scan</h2>
					{@render scanPages()}
				</section>
			{:else}
				<details class="scan">
					<summary>Scan</summary>
					{@render scanPages()}
				</details>
			{/if}
		{/if}

		<section>
			{#if tune.simplifiedCharts.length || tune.sourceChartStatus === 'verified'}
				<div role="tablist" class="chart-tabs">
					<button
						type="button"
						role="tab"
						aria-selected={selectedSimplified === null}
						onclick={() => select(null)}>Source</button
					>
					{#each tune.simplifiedCharts as chart (chart.id)}
						<button
							type="button"
							role="tab"
							aria-selected={selectedSimplified?.id === chart.id}
							onclick={() => select(chart.id)}>{chart.name}</button
						>
					{/each}
					{#if tune.sourceChartStatus === 'verified'}
						<button type="button" onclick={createSimplified}>+ Simplified Chart</button>
					{/if}
				</div>
			{/if}

			{#if selectedSimplified}
				<h2>
					{selectedSimplified.name}
					<small>Simplified Chart · {selectedSimplified.origin}</small>
				</h2>
				{#if editingSimplified}
					{#key selectedSimplified.id}
						<ChartEditor
							chart={selectedSimplified.chart}
							saving={savingSimplified}
							error={simplifiedError}
							chordsOnly
							onsave={saveSimplified}
						/>
					{/key}
					<button type="button" onclick={() => (editingSimplified = false)}>Cancel</button>
				{:else}
					<ChartGrid
						chart={selectedSimplified.chart}
						highlightedBars={differingBars(tune.sourceChart, selectedSimplified.chart)}
					/>
					<button type="button" onclick={() => (editingSimplified = true)}>Edit chords</button>
					<button type="button" onclick={renameSimplified}>Rename</button>
					<button type="button" onclick={removeSimplified}>Delete</button>
					{#if simplifiedError}<p role="alert">{simplifiedError}</p>{/if}
				{/if}
			{:else}
				<h2>
					Source Chart
					<small>{tune.sourceChartStatus === 'verified' ? 'Verified' : 'Draft'}</small>
				</h2>

				{#if editingChart}
					<ChartEditor chart={tune.sourceChart} {saving} error={chartError} onsave={saveChart} />
					<button type="button" onclick={() => (editingChart = false)}>Cancel</button>
				{:else}
					<ChartGrid chart={tune.sourceChart} />
					{#if tune.sourceChartStatus === 'draft'}
						<button type="button" onclick={() => (editingChart = true)}>Edit chart</button>
						<button type="button" onclick={verify}>Mark Verified</button>
						{#if tune.scanPageCount > 0}
							<button type="button" onclick={reextractWithOpus} disabled={extracting}>
								Re-extract with Opus
							</button>
							{#if extracting}<p role="status">Extracting the chart from the Scan…</p>{/if}
							{#if extractError}<p role="alert">{extractError}</p>{/if}
						{/if}
					{:else}
						<button type="button" onclick={reopen}>Reopen</button>
					{/if}
				{/if}
			{/if}
			{#if !selectedSimplified && simplifiedError}<p role="alert">{simplifiedError}</p>{/if}
		</section>
	</div>

	<PracticeLog {tune} sessions={data.sessions} />

	<hr />
	<button type="button" onclick={remove}>Delete tune</button>
</main>

<style>
	main {
		max-width: 30rem;
		margin: 0 auto;
		padding: 1rem;
	}
	.chart-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}
	.chart-tabs [aria-selected='true'] {
		font-weight: 700;
		text-decoration: underline;
	}
	form {
		display: grid;
		gap: 0.5rem;
	}
	.scan img {
		display: block;
		max-width: 100%;
		margin-bottom: 0.5rem;
	}
	@media (min-width: 60rem) {
		main {
			max-width: 56rem;
		}
		.split {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 1.5rem;
			align-items: start;
		}
		.split .scan {
			position: sticky;
			top: 0.5rem;
			max-height: 100vh;
			overflow-y: auto;
		}
	}
</style>
