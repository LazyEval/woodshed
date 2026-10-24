<script lang="ts">
	interface Props {
		title: string;
		composer: string;
		key: string;
	}

	let { title = $bindable(), composer = $bindable(), key = $bindable() }: Props = $props();
</script>

<label>Title <input name="title" bind:value={title} required /></label>
<label>Composer <input name="composer" bind:value={composer} /></label>
<label>Key <input name="key" bind:value={key} placeholder="e.g. Bb or F#m" /></label>

<style>
	label {
		display: grid;
		gap: 0.25rem;
	}
</style>
