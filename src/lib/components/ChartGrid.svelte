<script lang="ts">
	import type { Chart } from '#lib/chart.js';

	let { chart }: { chart: Chart } = $props();
</script>

{#each chart.sections as section, s (s)}
	<section class="section">
		<h3>{section.label}</h3>
		<ol class="bars">
			{#each section.bars as bar, b (b)}
				<li class="bar" aria-label="Bar {b + 1}">
					{#each bar.chords as chord (chord.beat)}
						<span class="chord" style:grid-column={chord.beat}>{chord.symbol}</span>
					{/each}
				</li>
			{/each}
		</ol>
	</section>
{/each}

<style>
	.section {
		margin-bottom: 1.25rem;
	}
	.bars {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		margin: 0;
		padding: 0;
		list-style: none;
		border-left: 2px solid currentColor;
	}
	@media (max-width: 24rem) {
		.bars {
			grid-template-columns: 1fr;
		}
	}
	@media (min-width: 40rem) {
		.bars {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.bar {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		align-items: center;
		min-height: 3rem;
		padding: 0.25rem 0.375rem;
		border-right: 2px solid currentColor;
		border-bottom: 1px solid #8884;
		font-size: 1.125rem;
		font-weight: 600;
	}
	.chord {
		white-space: nowrap;
	}
</style>
