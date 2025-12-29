import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { removeVolume, inspectVolume } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { auditVolume } from '$lib/server/audit';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	// Permission check with environment context
	if (auth.authEnabled && !await auth.can('volumes', 'inspect', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	// Environment access check (enterprise only)
	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	try {

		const volume = await inspectVolume(params.name, envIdNum);
		return json(volume);
	} catch (error) {
		console.error('Failed to inspect volume:', error);
		return json({ error: 'Failed to inspect volume' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const { params, url, cookies } = event;
	const auth = await authorize(cookies);

	const force = url.searchParams.get('force') === 'true';
	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	// Permission check with environment context
	if (auth.authEnabled && !await auth.can('volumes', 'remove', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	// Environment access check (enterprise only)
	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	try {

		await removeVolume(params.name, force, envIdNum);

		// Audit log
		await auditVolume(event, 'delete', params.name, params.name, envIdNum, { force });

		return json({ success: true });
	} catch (error: any) {
		console.error('Failed to remove volume:', error);
		return json({ error: 'Failed to remove volume', details: error.message }, { status: 500 });
	}
};
