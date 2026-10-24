<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { sendJson as send } from '#lib/api.js';
	import TuneFields from '#lib/components/TuneFields.svelte';
	import ChartEditor from '#lib/components/ChartEditor.svelte';
	import ChartGrid from '#lib/components/ChartGrid.svelte';
	import type { Chart } from '#lib/chart.js';

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

	async function remove() {
		if (!confirm(`Delete "${tune.title}"? This cannot be undone.`)) return;
		const result = await send(`/api/tunes/${tune.id}`, 'DELETE');
		if (result.ok) await goto(resolve('/tunes'));
	}
</script>

<svelte:head>
	<title>Woodshed · {tune.title}</title>
</svelte:head>

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
					{#each Array.from({ length: tune.scanPageCount }, (_, i) => i) as page (page)}
						<img src={`/api/tunes/${tune.id}/scan/${page}`} alt={`Scan page ${page + 1}`} />
					{/each}
				</section>
			{:else}
				<details class="scan">
					<summary>Scan</summary>
					{#each Array.from({ length: tune.scanPageCount }, (_, i) => i) as page (page)}
						<img src={`/api/tunes/${tune.id}/scan/${page}`} alt={`Scan page ${page + 1}`} />
					{/each}
				</details>
			{/if}
		{/if}

		<section>
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
		</section>
	</div>

	<hr />
	<button type="button" onclick={remove}>Delete tune</button>
</main>

<style>
	main {
		max-width: 48rem;
		margin: 0 auto;
		padding: 1rem;
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
			max-width: 90rem;
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
