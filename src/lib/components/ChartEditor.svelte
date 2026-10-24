<script lang="ts">
	import { BEATS_PER_BAR, barToSlots, slotsToBar, validateChart, type Chart } from '#lib/chart.js';

	interface Props {
		chart: Chart;
		saving: boolean;
		error: string | null;
		onsave: (chart: Chart) => void;
	}

	let { chart, saving, error, onsave }: Props = $props();

	interface EditableSection {
		label: string;
		bars: string[][];
	}

	const slotIndexes = Array.from({ length: BEATS_PER_BAR }, (_, i) => i);

	const emptySlots = () => barToSlots({ chords: [] });

	// svelte-ignore state_referenced_locally
	let sections = $state<EditableSection[]>(
		chart.sections.map((section) => ({
			label: section.label,
			bars: section.bars.map(barToSlots)
		}))
	);

	const draft = $derived<Chart>({
		sections: sections.map((section) => ({
			label: section.label,
			bars: section.bars.map(slotsToBar)
		}))
	});
	const problem = $derived.by(() => {
		const result = validateChart(draft);
		return 'error' in result ? result.error : null;
	});

	function addSection() {
		sections.push({ label: '', bars: [emptySlots()] });
	}

	function removeBar(section: EditableSection, index: number) {
		if (section.bars.length > 1) section.bars.splice(index, 1);
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		const result = validateChart(draft);
		if ('value' in result) onsave(result.value);
	}
</script>

<form onsubmit={save}>
	{#each sections as section, s (s)}
		<fieldset>
			<legend>Section {s + 1}</legend>
			<div class="section-head">
				<label>Label <input bind:value={section.label} placeholder="A, B, Intro, Coda" /></label>
				<button type="button" onclick={() => sections.splice(s, 1)}>Remove section</button>
			</div>
			<ol class="bars">
				{#each section.bars as slots, b (b)}
					<li class="bar-cell">
						<div class="bar" aria-label="Bar {b + 1}">
							{#each slotIndexes as i (i)}
								<input
									bind:value={slots[i]}
									aria-label="Section {s + 1} bar {b + 1} beat {i + 1}"
									placeholder={String(i + 1)}
									autocapitalize="characters"
									autocomplete="off"
									spellcheck="false"
								/>
							{/each}
						</div>
						<button
							type="button"
							class="remove-bar"
							aria-label="Remove section {s + 1} bar {b + 1}"
							onclick={() => removeBar(section, b)}
							disabled={section.bars.length <= 1}>×</button
						>
					</li>
				{/each}
			</ol>
			<button type="button" onclick={() => section.bars.push(emptySlots())}>Add bar</button>
		</fieldset>
	{/each}

	<button type="button" onclick={addSection}>Add section</button>

	{#if problem}<p role="alert">{problem}</p>{/if}
	{#if error}<p role="alert">{error}</p>{/if}
	<button type="submit" disabled={saving || problem !== null}>
		{saving ? 'Saving…' : 'Save chart'}
	</button>
</form>

<style>
	fieldset {
		margin: 0 0 1rem;
		padding: 0.5rem;
	}
	.section-head {
		display: flex;
		gap: 0.5rem;
		align-items: end;
		margin-bottom: 0.5rem;
	}
	.bars {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: 0.5rem;
		margin: 0 0 0.5rem;
		padding: 0;
		list-style: none;
	}
	.bar-cell {
		display: flex;
		gap: 2px;
		align-items: center;
	}
	.remove-bar {
		padding: 0.25rem 0.5rem;
	}
	.bar {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 2px;
	}
	.bar input {
		min-width: 0;
		padding: 0.5rem 0.25rem;
		text-align: center;
	}
</style>
