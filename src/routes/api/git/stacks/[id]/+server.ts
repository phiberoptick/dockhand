import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitStack, updateGitStack, deleteGitStack } from '$lib/server/db';
import { deleteGitStackFiles, deployGitStack } from '$lib/server/git';
import { authorize } from '$lib/server/authorize';
import { registerSchedule, unregisterSchedule } from '$lib/server/scheduler';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const auth = await authorize(cookies);

	try {
		const id = parseInt(params.id);
		const gitStack = await getGitStack(id);
		if (!gitStack) {
			return json({ error: 'Git stack not found' }, { status: 404 });
		}

		// Permission check with environment context
		if (auth.authEnabled && !await auth.can('stacks', 'view', gitStack.environmentId || undefined)) {
			return json({ error: 'Permission denied' }, { status: 403 });
		}

		return json(gitStack);
	} catch (error) {
		console.error('Failed to get git stack:', error);
		return json({ error: 'Failed to get git stack' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const auth = await authorize(cookies);

	try {
		const id = parseInt(params.id);
		const existing = await getGitStack(id);
		if (!existing) {
			return json({ error: 'Git stack not found' }, { status: 404 });
		}

		// Permission check with environment context
		if (auth.authEnabled && !await auth.can('stacks', 'edit', existing.environmentId || undefined)) {
			return json({ error: 'Permission denied' }, { status: 403 });
		}

		const data = await request.json();
		const updated = await updateGitStack(id, {
			stackName: data.stackName,
			composePath: data.composePath,
			envFilePath: data.envFilePath,
			autoUpdate: data.autoUpdate,
			autoUpdateSchedule: data.autoUpdateSchedule,
			autoUpdateCron: data.autoUpdateCron,
			webhookEnabled: data.webhookEnabled,
			webhookSecret: data.webhookSecret
		});

		// Register or unregister schedule with croner
		if (updated.autoUpdate && updated.autoUpdateCron) {
			await registerSchedule(id, 'git_stack_sync', updated.environmentId);
		} else {
			unregisterSchedule(id, 'git_stack_sync');
		}

		// If deployNow is set, deploy after saving
		if (data.deployNow) {
			const deployResult = await deployGitStack(id);
			return json({
				...updated,
				deployResult
			});
		}

		return json(updated);
	} catch (error: any) {
		console.error('Failed to update git stack:', error);
		if (error.message?.includes('UNIQUE constraint failed')) {
			return json({ error: 'A git stack with this name already exists for this environment' }, { status: 400 });
		}
		return json({ error: 'Failed to update git stack' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, cookies }) => {
	const auth = await authorize(cookies);

	try {
		const id = parseInt(params.id);
		const existing = await getGitStack(id);
		if (!existing) {
			return json({ error: 'Git stack not found' }, { status: 404 });
		}

		// Permission check with environment context
		if (auth.authEnabled && !await auth.can('stacks', 'remove', existing.environmentId || undefined)) {
			return json({ error: 'Permission denied' }, { status: 403 });
		}

		// Unregister schedule from croner
		unregisterSchedule(id, 'git_stack_sync');

		// Delete git files first
		deleteGitStackFiles(id);

		// Delete from database
		await deleteGitStack(id);

		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete git stack:', error);
		return json({ error: 'Failed to delete git stack' }, { status: 500 });
	}
};
