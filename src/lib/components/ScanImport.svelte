<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { uploadScan } from '#lib/scan-upload.js';
	import { CONFIRM_ARCHIVE } from '#lib/tune.js';

	let { replace }: { replace?: { tuneId: string; ondone: () => void } } = $props();

	const url = $derived(replace ? `/api/tunes/${replace.tuneId}/replace` : '/api/tunes/import');
	const failureMessage = $derived(replace ? 'Replacement failed.' : 'Import failed.');

	let pages = $state<File[]>([]);
	let running = $state(false);
	let error = $state<string | null>(null);
	let failed = $state(false);

	function addPages(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		pages = [...pages, ...Array.from(input.files ?? [])];
		input.value = '';
		failed = false;
		error = null;
	}

	function move(index: number, by: number) {
		const target = index + by;
		if (target < 0 || target >= pages.length) return;
		const next = [...pages];
		[next[index], next[target]] = [next[target], next[index]];
		pages = next;
	}

	function remove(index: number) {
		pages = pages.filter((_, i) => i !== index);
	}

	async function submit(fields: Record<string, string>) {
		running = true;
		error = null;
		failed = false;
		try {
			let result = await uploadScan(url, pages, fields);
			if (!result.ok && Array.isArray(result.body?.simplifiedCharts)) {
				const names = result.body.simplifiedCharts.map((name: string) => `"${name}"`).join(', ');
				if (!confirm(`Replacing the Source Chart archives these Simplified Charts: ${names}.`)) {
					return;
				}
				result = await uploadScan(url, pages, {
					...fields,
					[CONFIRM_ARCHIVE.name]: CONFIRM_ARCHIVE.value
				});
			}
			if (!result.ok) {
				error = result.body?.error ?? failureMessage;
				failed = true;
				return;
			}
			if (replace) {
				pages = [];
				await invalidateAll();
				replace.ondone();
				return;
			}
			await goto(resolve('/tunes/[id]', { id: result.body.id }));
		} catch {
			error = `${failureMessage} Check your connection and try again.`;
			failed = true;
		} finally {
			running = false;
		}
	}
</script>

<section>
	<label>
		Scan pages (photo or screenshot)
		<input type="file" accept="image/*" multiple onchange={addPages} disabled={running} />
	</label>

	{#if pages.length}
		<ol>
			{#each pages as file, i (file)}
				<li>
					<span>{file.name}</span>
					<button type="button" onclick={() => move(i, -1)} disabled={running || i === 0}>
						Up
					</button>
					<button
						type="button"
						onclick={() => move(i, 1)}
						disabled={running || i === pages.length - 1}
					>
						Down
					</button>
					<button type="button" onclick={() => remove(i)} disabled={running}>Remove</button>
				</li>
			{/each}
		</ol>
		<button type="button" onclick={() => submit({})} disabled={running}>Extract chart</button>
	{/if}

	{#if running}
		<p role="status">Reading the Scan and extracting the chart. This can take a minute.</p>
	{/if}
	{#if error}<p role="alert">{error}</p>{/if}
	{#if failed}
		<button type="button" onclick={() => submit({ model: 'opus' })}>Retry with Opus</button>
		{#if !replace}
			<button type="button" onclick={() => submit({ mode: 'manual' })}>
				Keep the Scan and build the chart by hand
			</button>
		{/if}
	{/if}
</section>

<style>
	section,
	label {
		display: grid;
		gap: 0.5rem;
	}
	li {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	li span {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
