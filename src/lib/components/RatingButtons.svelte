<script lang="ts">
	import { RATINGS, type Rating } from '#lib/rotation.js';

	interface Props {
		disabled?: boolean;
		onrate: (rating: Rating) => void;
	}

	let { disabled = false, onrate }: Props = $props();
</script>

<span class="ratings" role="group" aria-label="Log a Practice Session">
	{#each RATINGS as rating (rating)}
		<button type="button" {disabled} onclick={() => onrate(rating)}>{rating}</button>
	{/each}
</span>

<style>
	.ratings {
		display: inline-flex;
		gap: 0.25rem;
	}
</style>
