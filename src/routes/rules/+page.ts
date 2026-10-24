import type { RuleView } from '#lib/tune.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const response = await fetch('/api/rules');
	return { rules: (await response.json()) as RuleView[] };
};
