import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfigSet, updateConfigSet, deleteConfigSet } from '$lib/server/db';
import { authorize } from '$lib/server/authorize';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const auth = await authorize(cookies);
	if (auth.authEnabled && !await auth.can('configsets', 'view')) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid ID' }, { status: 400 });
		}

		const configSet = await getConfigSet(id);
		if (!configSet) {
			return json({ error: 'Config set not found' }, { status: 404 });
		}

		return json(configSet);
	} catch (error) {
		console.error('Failed to fetch config set:', error);
		return json({ error: 'Failed to fetch config set' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const auth = await authorize(cookies);
	if (auth.authEnabled && !await auth.can('configsets', 'edit')) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid ID' }, { status: 400 });
		}

		const body = await request.json();

		const configSet = await updateConfigSet(id, {
			name: body.name?.trim(),
			description: body.description?.trim(),
			envVars: body.envVars,
			labels: body.labels,
			ports: body.ports,
			volumes: body.volumes,
			networkMode: body.networkMode,
			restartPolicy: body.restartPolicy
		});

		if (!configSet) {
			return json({ error: 'Config set not found' }, { status: 404 });
		}

		return json(configSet);
	} catch (error: any) {
		console.error('Failed to update config set:', error);
		if (error.message?.includes('UNIQUE constraint')) {
			return json({ error: 'A config set with this name already exists' }, { status: 400 });
		}
		return json({ error: 'Failed to update config set' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, cookies }) => {
	const auth = await authorize(cookies);
	if (auth.authEnabled && !await auth.can('configsets', 'delete')) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid ID' }, { status: 400 });
		}

		const deleted = await deleteConfigSet(id);
		if (!deleted) {
			return json({ error: 'Config set not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete config set:', error);
		return json({ error: 'Failed to delete config set' }, { status: 500 });
	}
};
