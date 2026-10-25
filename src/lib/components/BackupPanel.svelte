<script lang="ts">
	import { resolve } from '$app/paths';
	import { ApiAction } from '#lib/api-action.svelte.js';
	import { sendJson } from '#lib/api.js';
	import { CONFIRM_REPLACE, type ReplaceSummary } from '#lib/tune.js';

	const action = new ApiAction();
	const archivePath = resolve('/api/archive');

	async function restore(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const probe = await sendJson<ReplaceSummary>(archivePath, 'PUT', file);
			if (probe.status !== 409) {
				action.error = probe.body?.error ?? null;
				return;
			}
			const { tunes, simplifiedCharts, rules, practiceSessions } = probe.body;
			const counts = `${tunes} Tunes, ${simplifiedCharts} Simplified Charts, ${rules} Rules, ${practiceSessions} Practice Sessions`;
			if (!confirm(`Replace ALL current data with this archive (${counts})?`)) return;
			await action.run(
				`${archivePath}?${CONFIRM_REPLACE.name}=${CONFIRM_REPLACE.value}`,
				'PUT',
				file
			);
		} finally {
			input.value = '';
		}
	}
</script>

<section>
	<h2>Backup</h2>
	{#if action.error}<p role="alert">{action.error}</p>{/if}
	<p><a href={archivePath} download>Export everything</a></p>
	<label>
		Import archive (replaces all data)
		<input type="file" accept=".zip,application/zip" disabled={action.busy} onchange={restore} />
	</label>
</section>
