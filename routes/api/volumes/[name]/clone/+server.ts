import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { inspectVolume, createVolume, type CreateVolumeOptions } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { auditVolume } from '$lib/server/audit';

export const POST: RequestHandler = async (event) => {
	const { params, url, request, cookies } = event;
	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	// Permission check with environment context
	if (auth.authEnabled && !await auth.can('volumes', 'create', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	try {

		const body = await request.json();
		const newName = body.name;

		if (!newName) {
			return json({ error: 'New volume name is required' }, { status: 400 });
		}

		// Get source volume info
		const sourceVolume = await inspectVolume(params.name, envIdNum);

		// Create new volume with same driver and options
		const options: CreateVolumeOptions = {
			name: newName,
			driver: sourceVolume.Driver || 'local',
			driverOpts: sourceVolume.Options || {},
			labels: { ...sourceVolume.Labels, 'dockhand.cloned.from': params.name }
		};

		const newVolume = await createVolume(options, envIdNum);

		// Audit log
		await auditVolume(event, 'clone', newVolume.Name, `${params.name} → ${newName}`, envIdNum, {
			source: params.name,
			driver: options.driver
		});

		return json({ success: true, name: newVolume.Name });
	} catch (error: any) {
		console.error('Failed to clone volume:', error);
		return json({
			error: 'Failed to clone volume',
			details: error.message || String(error)
		}, { status: 500 });
	}
};
