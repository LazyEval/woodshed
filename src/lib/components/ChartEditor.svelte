<script lang="ts">
	import {
		BEAT_UNITS,
		DEFAULT_TIME_SIGNATURE,
		ENDING_NUMBERS,
		KEY_MODES,
		MAX_BEATS_PER_BAR,
		barToSlots,
		countBars,
		effectiveTimeSignatures,
		isValidTimeSignature,
		slotsToChords,
		validateChart,
		type Bar,
		type Chart,
		type EndingNumber,
		type KeyMode,
		type TimeSignature
	} from '#lib/chart.js';

	interface Props {
		chart: Chart;
		saving: boolean;
		error: string | null;
		onsave: (chart: Chart) => void;
	}

	let { chart, saving, error, onsave }: Props = $props();

	interface EditableBar {
		slots: string[];
		repeatStart: boolean;
		repeatEnd: boolean;
		ending: EndingNumber | null;
		beats: number | null;
		unit: number;
	}

	interface EditableSection {
		label: string;
		bars: EditableBar[];
	}

	interface EditableKeyCenter {
		startBar: number | null;
		endBar: number | null;
		tonic: string;
		mode: KeyMode;
	}

	function toEditableBar(bar: Bar): EditableBar {
		return {
			slots: barToSlots(bar, MAX_BEATS_PER_BAR),
			repeatStart: bar.repeatStart ?? false,
			repeatEnd: bar.repeatEnd ?? false,
			ending: bar.ending ?? null,
			beats: bar.timeSignature?.beats ?? null,
			unit: bar.timeSignature?.unit ?? DEFAULT_TIME_SIGNATURE.unit
		};
	}

	const newBar = () => toEditableBar({ chords: [] });

	function toBar(bar: EditableBar, beats: number): Bar {
		return {
			chords: slotsToChords(bar.slots.slice(0, beats)),
			...(bar.repeatStart && { repeatStart: true }),
			...(bar.repeatEnd && { repeatEnd: true }),
			...(bar.ending && { ending: bar.ending }),
			...(bar.beats && { timeSignature: { beats: bar.beats, unit: bar.unit } })
		};
	}

	// svelte-ignore state_referenced_locally
	let sections = $state<EditableSection[]>(
		chart.sections.map((section) => ({
			label: section.label,
			bars: section.bars.map(toEditableBar)
		}))
	);

	// svelte-ignore state_referenced_locally
	let keyCenters = $state<EditableKeyCenter[]>(
		(chart.keyCenters ?? []).map((keyCenter) => ({ ...keyCenter }))
	);

	function addKeyCenter() {
		const last = keyCenters.at(-1)?.endBar ?? 0;
		const start = Math.min(last + 1, countBars({ sections }));
		keyCenters.push({ startBar: start, endBar: start, tonic: 'C', mode: 'major' });
	}

	function enteredSignature(bar: EditableBar): TimeSignature | undefined {
		if (bar.beats === null) return undefined;
		const signature = { beats: bar.beats, unit: bar.unit };
		return isValidTimeSignature(signature) ? signature : undefined;
	}

	const signatures = $derived.by(() => {
		const flat = effectiveTimeSignatures({
			sections: sections.map((section) => ({
				label: section.label,
				bars: section.bars.map((bar) => ({ chords: [], timeSignature: enteredSignature(bar) }))
			}))
		});
		let index = 0;
		return sections.map((section) => section.bars.map(() => flat[index++]));
	});

	const draft = $derived<Chart>({
		sections: sections.map((section, s) => ({
			label: section.label,
			bars: section.bars.map((bar, b) => toBar(bar, signatures[s][b].beats))
		})),
		...(keyCenters.length && { keyCenters: $state.snapshot(keyCenters) as Chart['keyCenters'] })
	});

	const problem = $derived.by(() => {
		for (const [s, section] of sections.entries()) {
			for (const [b, bar] of section.bars.entries()) {
				const location = `Section ${s + 1} (${section.label}), bar ${b + 1}`;
				if (bar.beats !== null && !enteredSignature(bar)) {
					return `${location}: beats per bar must be a whole number from 1 to ${MAX_BEATS_PER_BAR}.`;
				}
				const hidden = bar.slots.slice(signatures[s][b].beats).some((slot) => slot.trim());
				if (hidden) {
					return `${location}: chords beyond beat ${signatures[s][b].beats} would be lost. Clear them or change the time signature.`;
				}
			}
		}
		const result = validateChart(draft);
		return 'error' in result ? result.error : null;
	});

	function move<T>(items: T[], from: number, to: number) {
		if (to < 0 || to >= items.length) return;
		const [item] = items.splice(from, 1);
		items.splice(to, 0, item);
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
				<button
					type="button"
					aria-label="Move section {s + 1} up"
					disabled={s === 0}
					onclick={() => move(sections, s, s - 1)}>↑</button
				>
				<button
					type="button"
					aria-label="Move section {s + 1} down"
					disabled={s === sections.length - 1}
					onclick={() => move(sections, s, s + 1)}>↓</button
				>
				<button type="button" onclick={() => sections.splice(s, 1)} disabled={sections.length <= 1}>
					Remove section
				</button>
			</div>
			<ol class="bars">
				{#each section.bars as bar, b (b)}
					<li class="bar-cell">
						<div class="bar" aria-label="Bar {b + 1}">
							{#each { length: signatures[s][b].beats }, i (i)}
								<input
									bind:value={bar.slots[i]}
									aria-label="Section {s + 1} bar {b + 1} beat {i + 1}"
									placeholder={String(i + 1)}
									autocapitalize="characters"
									autocomplete="off"
									spellcheck="false"
								/>
							{/each}
						</div>
						<div class="bar-options">
							<label>
								<input
									type="checkbox"
									bind:checked={bar.repeatStart}
									aria-label="Section {s + 1} bar {b + 1} repeat start"
								/>
								|:
							</label>
							<label>
								<input
									type="checkbox"
									bind:checked={bar.repeatEnd}
									aria-label="Section {s + 1} bar {b + 1} repeat end"
								/>
								:|
							</label>
							<select bind:value={bar.ending} aria-label="Section {s + 1} bar {b + 1} ending">
								<option value={null}>No ending</option>
								{#each ENDING_NUMBERS as number (number)}
									<option value={number}>Ending {number}</option>
								{/each}
							</select>
							<input
								type="number"
								class="beats"
								min="1"
								max={MAX_BEATS_PER_BAR}
								bind:value={bar.beats}
								placeholder={String(signatures[s][b].beats)}
								aria-label="Section {s + 1} bar {b + 1} beats per bar"
							/>
							<select
								bind:value={bar.unit}
								aria-label="Section {s + 1} bar {b + 1} beat unit"
								disabled={bar.beats === null}
							>
								{#each BEAT_UNITS as unit (unit)}
									<option value={unit}>/{unit}</option>
								{/each}
							</select>
							<button
								type="button"
								aria-label="Move section {s + 1} bar {b + 1} earlier"
								disabled={b === 0}
								onclick={() => move(section.bars, b, b - 1)}>←</button
							>
							<button
								type="button"
								aria-label="Move section {s + 1} bar {b + 1} later"
								disabled={b === section.bars.length - 1}
								onclick={() => move(section.bars, b, b + 1)}>→</button
							>
							<button
								type="button"
								aria-label="Insert bar after section {s + 1} bar {b + 1}"
								onclick={() => section.bars.splice(b + 1, 0, newBar())}>+</button
							>
							<button
								type="button"
								aria-label="Remove section {s + 1} bar {b + 1}"
								onclick={() => section.bars.splice(b, 1)}
								disabled={section.bars.length <= 1}>×</button
							>
						</div>
					</li>
				{/each}
			</ol>
		</fieldset>
	{/each}

	<button type="button" onclick={() => sections.push({ label: '', bars: [newBar()] })}>
		Add section
	</button>

	<fieldset>
		<legend>Key centers</legend>
		<p class="hint">Bar numbers count from the first bar of the chart.</p>
		{#each keyCenters as keyCenter, k (k)}
			<div class="key-center">
				<label>
					From bar
					<input
						type="number"
						min="1"
						bind:value={keyCenter.startBar}
						aria-label="Key center {k + 1} start bar"
					/>
				</label>
				<label>
					to bar
					<input
						type="number"
						min="1"
						bind:value={keyCenter.endBar}
						aria-label="Key center {k + 1} end bar"
					/>
				</label>
				<input
					bind:value={keyCenter.tonic}
					class="tonic"
					aria-label="Key center {k + 1} tonic"
					placeholder="C, Bb, F#"
					autocomplete="off"
					spellcheck="false"
				/>
				<select bind:value={keyCenter.mode} aria-label="Key center {k + 1} mode">
					{#each KEY_MODES as mode (mode)}
						<option value={mode}>{mode}</option>
					{/each}
				</select>
				<button
					type="button"
					aria-label="Remove key center {k + 1}"
					onclick={() => keyCenters.splice(k, 1)}>×</button
				>
			</div>
		{/each}
		<button type="button" onclick={addKeyCenter}>Add key center</button>
	</fieldset>

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
	.bar-options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		align-items: center;
		font-size: 0.875rem;
	}
	.key-center {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: end;
		margin-bottom: 0.5rem;
	}
	.key-center input[type='number'] {
		width: 4rem;
	}
	.tonic {
		width: 5rem;
	}
	.hint {
		margin: 0 0 0.5rem;
		font-size: 0.875rem;
	}
	.beats {
		width: 3.5rem;
	}
</style>
