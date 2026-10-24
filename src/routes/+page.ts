import type { DueTune } from '#lib/rotation.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const response = await fetch('/api/due');
	return { due: (await response.json()) as DueTune[] };
};
