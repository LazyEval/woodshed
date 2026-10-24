<script lang="ts">
	import { ApiAction } from '#lib/api-action.svelte.js';
	import RatingButtons from '#lib/components/RatingButtons.svelte';
	import {
		PRACTICED_CHARTS,
		type PracticeSession,
		type PracticedChart,
		type Rating
	} from '#lib/rotation.js';
	import type { TuneDetail } from '#lib/tune.js';

	interface Props {
		tune: TuneDetail;
		sessions: PracticeSession[];
	}

	let { tune, sessions }: Props = $props();

	const CHART_LABELS: Record<PracticedChart, string> = { source: 'Source Chart' };

	let practicedOn = $state('');
	let chart = $state<PracticedChart | null>(null);
	const action = new ApiAction();

	async function log(rating: Rating) {
		const logged = await action.run(`/api/tunes/${tune.id}/sessions`, 'POST', {
			rating,
			practicedOn: practicedOn || undefined,
			chart
		});
		if (logged) practicedOn = '';
	}

	async function remove(session: PracticeSession) {
		if (!confirm(`Delete the ${session.rating} session on ${session.practicedOn}?`)) return;
		await action.run(`/api/tunes/${tune.id}/sessions/${session.id}`, 'DELETE');
	}

	const toggleShelved = () =>
		action.run(`/api/tunes/${tune.id}/${tune.shelved ? 'unshelve' : 'shelve'}`, 'POST');
</script>

<h2>Rotation <small>{tune.shelved ? 'Shelved' : 'Active'}</small></h2>

<dl>
	<dt>Last practiced</dt>
	<dd>{tune.lastPracticedOn ? `${tune.lastPracticedOn} (${tune.lastRating})` : 'Never'}</dd>
	<dt>Next Due</dt>
	<dd>
		{#if tune.shelved}
			Not while Shelved
		{:else}
			{tune.dueOn ?? 'Once the Source Chart is Verified'}
		{/if}
	</dd>
</dl>
<button type="button" disabled={action.busy} onclick={toggleShelved}>
	{tune.shelved ? 'Un-shelve' : 'Shelve'}
</button>

<h3>Log a Practice Session</h3>
<div class="log">
	<label>Date <input type="date" bind:value={practicedOn} /></label>
	<label>
		Chart
		<select bind:value={chart}>
			<option value={null}>Not recorded</option>
			{#each PRACTICED_CHARTS as option (option)}
				<option value={option}>{CHART_LABELS[option]}</option>
			{/each}
		</select>
	</label>
	<RatingButtons disabled={action.busy} onrate={log} />
	<small>Leave the date empty for today.</small>
</div>
{#if action.error}<p role="alert">{action.error}</p>{/if}

{#if sessions.length > 0}
	<h3>Practice Sessions</h3>
	<ul class="sessions">
		{#each sessions as session (session.id)}
			<li>
				<span
					>{session.practicedOn} · {session.rating}{session.chart
						? ` · ${session.chart}`
						: ''}</span
				>
				<button type="button" disabled={action.busy} onclick={() => remove(session)}>Delete</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.25rem 1rem;
	}
	dd {
		margin: 0;
	}
	.log {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: end;
	}
	label {
		display: grid;
		gap: 0.25rem;
	}
	.sessions {
		padding: 0;
		list-style: none;
	}
	.sessions li {
		display: flex;
		justify-content: space-between;
		padding: 0.25rem 0;
		border-bottom: 1px solid #8884;
	}
</style>
