<script lang="ts">
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { CONFIRM_REPLACE } from '#lib/tune.js';

	interface Summary {
		error: string;
		tunes: number;
		simplifiedCharts: number;
		practiceSessions: number;
		rules: number;
	}

	let busy = $state(false);
	let error = $state<string | null>(null);

	async function put(file: File, confirmed: boolean): Promise<Response> {
		const query = confirmed ? `?${CONFIRM_REPLACE.name}=${CONFIRM_REPLACE.value}` : '';
		return fetch(`/api/archive${query}`, { method: 'PUT', body: file });
	}

	async function restore(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		if (!file) return;
		busy = true;
		error = null;
		try {
			let response = await put(file, false);
			if (response.status === 409) {
				const summary = (await response.json()) as Summary;
				const counts = `${summary.tunes} Tunes, ${summary.simplifiedCharts} Simplified Charts, ${summary.rules} Rules, ${summary.practiceSessions} Practice Sessions`;
				if (!confirm(`Replace ALL current data with this archive (${counts})?`)) return;
				response = await put(file, true);
			}
			if (!response.ok) {
				error = ((await response.json()) as { error: string }).error;
				return;
			}
			await invalidateAll();
		} finally {
			busy = false;
			input.value = '';
		}
	}
</script>

<section>
	<h2>Backup</h2>
	{#if error}<p role="alert">{error}</p>{/if}
	<p><a href={resolve('/api/archive')} download>Export everything</a></p>
	<label>
		Import archive (replaces all data)
		<input type="file" accept=".zip,application/zip" disabled={busy} onchange={restore} />
	</label>
</section>
