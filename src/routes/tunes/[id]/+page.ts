import { error } from '@sveltejs/kit';
import type { PracticeSession } from '#lib/rotation.js';
import type { TuneDetail } from '#lib/tune.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const [tune, sessions] = await Promise.all([
		fetch(`/api/tunes/${params.id}`),
		fetch(`/api/tunes/${params.id}/sessions`)
	]);
	if (!tune.ok) error(tune.status, 'Tune not found');
	return {
		tune: (await tune.json()) as TuneDetail,
		sessions: (await sessions.json()) as PracticeSession[]
	};
};
