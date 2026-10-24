import { error } from '@sveltejs/kit';
import type { PracticeSession } from '#lib/rotation.js';
import type { RuleView, TuneDetail } from '#lib/tune.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const [tune, sessions, rules] = await Promise.all([
		fetch(`/api/tunes/${params.id}`),
		fetch(`/api/tunes/${params.id}/sessions`),
		fetch('/api/rules')
	]);
	if (!tune.ok) error(tune.status, 'Tune not found');
	return {
		tune: (await tune.json()) as TuneDetail,
		sessions: (await sessions.json()) as PracticeSession[],
		rules: (await rules.json()) as RuleView[]
	};
};
