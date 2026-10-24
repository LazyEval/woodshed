import { error } from '@sveltejs/kit';
import type { TuneDetail } from '#lib/tune.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const response = await fetch(`/api/tunes/${params.id}`);
	if (!response.ok) error(response.status, 'Tune not found');
	return { tune: (await response.json()) as TuneDetail };
};
