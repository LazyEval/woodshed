<script lang="ts">
	let { data } = $props();

	const messages: Record<string, string> = {
		invalid: 'Wrong password.',
		'rate-limited': 'Too many attempts. Try again in a few minutes.'
	};
</script>

<svelte:head>
	<title>Woodshed · Sign in</title>
</svelte:head>

<main>
	<h1>Woodshed</h1>
	<form method="POST">
		<label>
			Password
			<input type="password" name="password" autocomplete="current-password" required />
		</label>
		{#if data.error}
			<p role="alert">{messages[data.error] ?? 'Sign in failed.'}</p>
		{/if}
		<button type="submit">Sign in</button>
	</form>
</main>
