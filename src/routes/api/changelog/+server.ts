import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import changelog from '$lib/data/changelog.json';

export const GET: RequestHandler = async () => {
	return json(changelog);
};
