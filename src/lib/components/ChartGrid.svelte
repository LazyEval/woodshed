<script lang="ts">
	import { effectiveTimeSignatures, keyCenterName, type Chart } from '#lib/chart.js';

	let { chart }: { chart: Chart } = $props();

	const signatures = $derived(effectiveTimeSignatures(chart));
	const offsets = $derived(
		chart.sections.map((_, s) =>
			chart.sections.slice(0, s).reduce((total, section) => total + section.bars.length, 0)
		)
	);

	const legend = $derived([...new Set((chart.keyCenters ?? []).map(keyCenterName))]);

	function keyCenterAt(barNumber: number) {
		return chart.keyCenters?.find((k) => barNumber >= k.startBar && barNumber <= k.endBar);
	}

	const hue = (name: string) => legend.indexOf(name) * 137.5;
</script>

{#if legend.length}
	<ul class="legend" aria-label="Key centers">
		{#each legend as name (name)}
			<li><span class="swatch" style:--hue={hue(name)}></span>{name}</li>
		{/each}
	</ul>
{/if}

{#each chart.sections as section, s (s)}
	<section class="section">
		<h3>{section.label}</h3>
		<ol class="bars">
			{#each section.bars as bar, b (b)}
				{@const signature = signatures[offsets[s] + b]}
				{@const keyCenter = keyCenterAt(offsets[s] + b + 1)}
				<li
					class="bar"
					class:repeat-start={bar.repeatStart}
					class:repeat-end={bar.repeatEnd}
					class:ending={bar.ending}
					class:keyed={keyCenter}
					style:--hue={keyCenter && hue(keyCenterName(keyCenter))}
					data-key-center={keyCenter && keyCenterName(keyCenter)}
					style:grid-template-columns="repeat({signature.beats}, 1fr)"
					aria-label="Bar {b + 1}"
				>
					{#if bar.ending}<span class="ending-label">{bar.ending}.</span>{/if}
					{#if bar.timeSignature}
						<span class="time-signature" aria-label="Time signature"
							>{bar.timeSignature.beats}/{bar.timeSignature.unit}</span
						>
					{/if}
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
		position: relative;
		display: grid;
		align-items: center;
		min-height: 3rem;
		padding: 1rem 0.375rem 0.25rem;
		border-right: 2px solid currentColor;
		border-bottom: 1px solid #8884;
		font-size: 1.125rem;
		font-weight: 600;
	}
	.keyed {
		background: hsl(var(--hue) 70% 50% / 0.18);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 0 0 0.75rem;
		padding: 0;
		list-style: none;
	}
	.swatch {
		display: inline-block;
		width: 1rem;
		height: 1rem;
		margin-right: 0.375rem;
		vertical-align: middle;
		border: 1px solid #8886;
		background: hsl(var(--hue) 70% 50% / 0.4);
	}
	.repeat-start {
		border-left: 6px double currentColor;
	}
	.repeat-end {
		border-right: 6px double currentColor;
	}
	.ending {
		border-top: 2px solid currentColor;
	}
	.ending-label,
	.time-signature {
		position: absolute;
		top: 0;
		font-size: 0.75rem;
	}
	.ending-label {
		left: 0.375rem;
	}
	.time-signature {
		right: 0.375rem;
		font-weight: 700;
	}
	.chord {
		white-space: nowrap;
	}
</style>
