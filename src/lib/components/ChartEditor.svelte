<script lang="ts">
	import { BEATS_PER_BAR, validateChart, type Chart } from '#lib/chart.js';

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

	// svelte-ignore state_referenced_locally
	let sections = $state<EditableSection[]>(
		chart.sections.map((section) => ({
			label: section.label,
			bars: section.bars.map((bar) => {
				const slots = slotIndexes.map(() => '');
				for (const chord of bar.chords) slots[chord.beat - 1] = chord.symbol;
				return slots;
			})
		}))
	);

	const draft = $derived<unknown>({
		sections: sections.map((section) => ({
			label: section.label,
			bars: section.bars.map((slots) => ({
				chords: slots.flatMap((symbol, i) =>
					symbol.trim() ? [{ beat: i + 1, symbol: symbol.trim() }] : []
				)
			}))
		}))
	});
	const problem = $derived.by(() => {
		const result = validateChart(draft);
		return 'error' in result ? result.error : null;
	});

	function addSection() {
		sections.push({ label: '', bars: [slotIndexes.map(() => '')] });
	}

	function addBar(section: EditableSection) {
		section.bars.push(slotIndexes.map(() => ''));
	}

	function removeBar(section: EditableSection) {
		if (section.bars.length > 1) section.bars.pop();
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		const result = validateChart(draft);
		if ('chart' in result) onsave(result.chart);
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
					<li class="bar" aria-label="Bar {b + 1}">
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
					</li>
				{/each}
			</ol>
			<button type="button" onclick={() => addBar(section)}>Add bar</button>
			<button type="button" onclick={() => removeBar(section)} disabled={section.bars.length <= 1}>
				Remove last bar
			</button>
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
	.bar {
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
