<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let { data } = $props();

	let title = $state('');
	let composer = $state('');
	let key = $state('');
	let error = $state<string | null>(null);

	async function create(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		const response = await fetch('/api/tunes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title, composer, key })
		});
		const body: { id: string; error: string } = await response.json();
		if (!response.ok) {
			error = body.error;
			return;
		}
		await goto(resolve('/tunes/[id]', { id: body.id }));
	}
</script>

<svelte:head>
	<title>Woodshed · Tunes</title>
</svelte:head>

<main>
	<p><a href={resolve('/')}>Home</a></p>
	<h1>Tunes</h1>

	<form method="GET" role="search">
		<input
			type="search"
			name="q"
			value={data.q}
			placeholder="Search by title"
			aria-label="Search"
		/>
		<button type="submit">Search</button>
	</form>

	{#if data.tunes.length === 0}
		<p>{data.q ? 'No tunes match.' : 'No tunes yet.'}</p>
	{:else}
		<ul class="tunes">
			{#each data.tunes as tune (tune.id)}
				<li>
					<a href={resolve('/tunes/[id]', { id: tune.id })}>{tune.title}</a>
					<small>
						{[tune.composer, tune.key].filter(Boolean).join(' · ')}
						{#if tune.sourceChartStatus === 'draft'}· Draft{/if}
					</small>
				</li>
			{/each}
		</ul>
	{/if}

	<h2>New tune</h2>
	<form onsubmit={create}>
		<label>Title <input name="title" bind:value={title} required /></label>
		<label>Composer <input name="composer" bind:value={composer} /></label>
		<label>Key <input name="key" bind:value={key} placeholder="e.g. Bb or F#m" /></label>
		{#if error}<p role="alert">{error}</p>{/if}
		<button type="submit">Create</button>
	</form>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem;
	}
	form {
		display: grid;
		gap: 0.5rem;
	}
	form[role='search'] {
		grid-template-columns: 1fr auto;
		margin-bottom: 1rem;
	}
	label {
		display: grid;
		gap: 0.25rem;
	}
	.tunes {
		padding: 0;
		list-style: none;
	}
	.tunes li {
		display: flex;
		flex-direction: column;
		padding: 0.5rem 0;
		border-bottom: 1px solid #8884;
	}
</style>
