import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitRepository } from '$lib/server/db';
import { testRepository } from '$lib/server/git';

export const POST: RequestHandler = async ({ params }) => {
	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid repository ID' }, { status: 400 });
		}

		const repository = await getGitRepository(id);
		if (!repository) {
			return json({ error: 'Repository not found' }, { status: 404 });
		}

		const result = await testRepository(id);
		return json(result);
	} catch (error: any) {
		console.error('Failed to test git repository:', error);
		return json({ success: false, error: error.message }, { status: 500 });
	}
};
