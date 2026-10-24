import { invalidateAll } from '$app/navigation';
import { sendJson } from '#lib/api.js';

export class ApiAction {
	busy = $state(false);
	error = $state<string | null>(null);

	async run(path: string, method: string, body?: unknown): Promise<boolean> {
		this.busy = true;
		this.error = null;
		const result = await sendJson(path, method, body);
		this.busy = false;
		if (!result.ok) {
			this.error = result.body.error;
			return false;
		}
		await invalidateAll();
		return true;
	}
}
