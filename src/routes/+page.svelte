<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Woodshed</title>
</svelte:head>

<main>
	<h1>Woodshed</h1>
	<p><a href={resolve('/tunes')}>Tunes</a></p>
	<form method="POST" action="/logout">
		<button type="submit">Sign out</button>
	</form>
</main>
