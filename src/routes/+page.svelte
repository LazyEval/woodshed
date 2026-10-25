<script lang="ts">
	import { resolve } from '$app/paths';
	import { ApiAction } from '#lib/api-action.svelte.js';
	import BackupPanel from '#lib/components/BackupPanel.svelte';
	import RatingButtons from '#lib/components/RatingButtons.svelte';
	import type { Rating } from '#lib/rotation.js';

	let { data } = $props();

	const action = new ApiAction();

	const logToday = (tuneId: string, rating: Rating) =>
		action.run(`/api/tunes/${tuneId}/sessions`, 'POST', { rating });

	function dueLabel(days: number): string {
		if (days === 0) return 'Due today';
		return `Due for ${days} day${days === 1 ? '' : 's'}`;
	}
</script>

<svelte:head>
	<title>Woodshed</title>
</svelte:head>

<main>
	<h1>Woodshed</h1>
	<p><a href={resolve('/tunes')}>Tunes</a></p>

	<h2>Due</h2>
	{#if action.error}<p role="alert">{action.error}</p>{/if}
	{#if data.due.length === 0}
		<p>Nothing Due. Nice.</p>
	{:else}
		<ul class="due">
			{#each data.due as tune (tune.id)}
				<li>
					<div>
						<a href={resolve('/tunes/[id]', { id: tune.id })}>{tune.title}</a>
						<small>
							{dueLabel(tune.dueForDays)}
							{#if tune.lastPracticedOn}· last {tune.lastRating} on {tune.lastPracticedOn}{/if}
						</small>
					</div>
					<RatingButtons disabled={action.busy} onrate={(rating) => logToday(tune.id, rating)} />
				</li>
			{/each}
		</ul>
	{/if}

	<BackupPanel />

	<form method="POST" action="/logout">
		<button type="submit">Sign out</button>
	</form>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem;
	}
	.due {
		padding: 0;
		list-style: none;
	}
	.due li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0;
		border-bottom: 1px solid #8884;
	}
	.due li div {
		display: flex;
		flex-direction: column;
	}
</style>
