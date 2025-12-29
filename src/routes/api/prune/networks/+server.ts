import { json } from '@sveltejs/kit';
import { pruneNetworks } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ url, cookies }) => {
	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	// Permission check with environment context
	if (auth.authEnabled && !await auth.can('networks', 'remove', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	try {
		const result = await pruneNetworks(envIdNum);
		return json({ success: true, result });
	} catch (error) {
		console.error('Error pruning networks:', error);
		return json({ error: 'Failed to prune networks' }, { status: 500 });
	}
};
