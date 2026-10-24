<script lang="ts">
	import {
		barToSlots,
		effectiveTimeSignatures,
		slotsToChords,
		validateChart,
		MAX_BEATS_PER_BAR,
		type Chart
	} from '#lib/chart.js';

	interface Props {
		chart: Chart;
		saving: boolean;
		error: string | null;
		onsave: (chart: Chart) => void;
	}

	let { chart, saving, error, onsave }: Props = $props();

	// svelte-ignore state_referenced_locally
	let slots = $state(
		chart.sections.map((section) => section.bars.map((bar) => barToSlots(bar, MAX_BEATS_PER_BAR)))
	);

	const signatures = $derived(effectiveTimeSignatures(chart));
	const offsets = $derived(
		chart.sections.map((_, s) =>
			chart.sections.slice(0, s).reduce((total, section) => total + section.bars.length, 0)
		)
	);

	const draft = $derived<Chart>({
		...chart,
		sections: chart.sections.map((section, s) => ({
			...section,
			bars: section.bars.map((bar, b) => ({
				...bar,
				chords: slotsToChords(slots[s][b].slice(0, signatures[offsets[s] + b].beats))
			}))
		}))
	});

	const problem = $derived.by(() => {
		const result = validateChart(draft);
		return 'error' in result ? result.error : null;
	});

	function save(event: SubmitEvent) {
		event.preventDefault();
		const result = validateChart(draft);
		if ('value' in result) onsave(result.value);
	}
</script>

<form onsubmit={save}>
	{#each chart.sections as section, s (s)}
		<fieldset>
			<legend>{section.label}</legend>
			<ol class="bars">
				{#each { length: section.bars.length }, b (b)}
					<li class="bar-cell">
						<span class="bar-number" aria-hidden="true">{offsets[s] + b + 1}</span>
						<div class="bar" aria-label="Bar {offsets[s] + b + 1}">
							{#each { length: signatures[offsets[s] + b].beats }, i (i)}
								<input
									bind:value={slots[s][b][i]}
									aria-label="Section {s + 1} bar {b + 1} beat {i + 1}"
									placeholder={String(i + 1)}
									autocapitalize="characters"
									autocomplete="off"
									spellcheck="false"
								/>
							{/each}
						</div>
					</li>
				{/each}
			</ol>
		</fieldset>
	{/each}

	{#if problem}<p role="alert">{problem}</p>{/if}
	{#if error}<p role="alert">{error}</p>{/if}
	<button type="submit" disabled={saving || problem !== null}>
		{saving ? 'Saving…' : 'Save chords'}
	</button>
</form>

<style>
	fieldset {
		margin: 0 0 1rem;
		padding: 0.5rem;
	}
	.bars {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.75rem;
		margin: 0 0 0.5rem;
		padding: 0;
		list-style: none;
	}
	.bar-cell {
		display: grid;
		gap: 2px;
	}
	.bar-number {
		font-size: 0.75rem;
		opacity: 0.7;
	}
	.bar {
		display: flex;
		gap: 2px;
	}
	.bar input {
		flex: 1;
		min-width: 0;
		padding: 0.5rem 0.25rem;
		text-align: center;
	}
</style>
