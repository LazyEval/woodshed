<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { sendJson } from '#lib/api.js';
	import RatingButtons from '#lib/components/RatingButtons.svelte';
	import type { Rating } from '#lib/rotation.js';

	let { data } = $props();

	let logging = $state<string | null>(null);
	let error = $state<string | null>(null);

	async function logToday(tuneId: string, rating: Rating) {
		logging = tuneId;
		error = null;
		const result = await sendJson(`/api/tunes/${tuneId}/sessions`, 'POST', { rating });
		logging = null;
		if (!result.ok) {
			error = result.body.error;
			return;
		}
		await invalidateAll();
	}

	function overdueLabel(days: number): string {
		if (days === 0) return 'Due today';
		return `${days} day${days === 1 ? '' : 's'} overdue`;
	}
</script>

<svelte:head>
	<title>Woodshed</title>
</svelte:head>

<main>
	<h1>Woodshed</h1>
	<p><a href={resolve('/tunes')}>Tunes</a></p>

	<h2>Due</h2>
	{#if error}<p role="alert">{error}</p>{/if}
	{#if data.due.length === 0}
		<p>Nothing Due. Nice.</p>
	{:else}
		<ul class="due">
			{#each data.due as tune (tune.id)}
				<li>
					<div>
						<a href={resolve('/tunes/[id]', { id: tune.id })}>{tune.title}</a>
						<small>
							{overdueLabel(tune.daysOverdue)}
							{#if tune.lastPracticedOn}· last {tune.lastRating} on {tune.lastPracticedOn}{/if}
						</small>
					</div>
					<RatingButtons
						disabled={logging === tune.id}
						onrate={(rating) => logToday(tune.id, rating)}
					/>
				</li>
			{/each}
		</ul>
	{/if}

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
