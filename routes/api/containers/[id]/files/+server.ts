import { json } from '@sveltejs/kit';
import { listContainerDirectory } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const auth = await authorize(cookies);

	const path = url.searchParams.get('path') || '/';
	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;
	const simpleLs = url.searchParams.get('simpleLs') === 'true';

	// Permission check with environment context
	if (auth.authEnabled && !await auth.can('containers', 'view', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	try {
		const result = await listContainerDirectory(
			params.id,
			path,
			envIdNum,
			simpleLs
		);

		return json(result);
	} catch (error: any) {
		console.error('Error listing container directory:', error);
		return json({ error: error.message || 'Failed to list directory' }, { status: 500 });
	}
};
