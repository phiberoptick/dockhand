/**
 * Git Stack Auto-Sync Task
 *
 * Handles automatic syncing and deploying of git-based compose stacks.
 */

import type { ScheduleTrigger } from '../../db';
import {
	createScheduleExecution,
	updateScheduleExecution,
	appendScheduleExecutionLog
} from '../../db';
import { deployGitStack } from '../../git';
import { sendEventNotification } from '../../notifications';

/**
 * Execute a git stack sync.
 */
export async function runGitStackSync(
	stackId: number,
	stackName: string,
	environmentId: number | null | undefined,
	triggeredBy: ScheduleTrigger
): Promise<void> {
	const startTime = Date.now();

	// Create execution record
	const execution = await createScheduleExecution({
		scheduleType: 'git_stack_sync',
		scheduleId: stackId,
		environmentId: environmentId ?? null,
		entityName: stackName,
		triggeredBy,
		status: 'running'
	});

	await updateScheduleExecution(execution.id, {
		startedAt: new Date().toISOString()
	});

	const log = (message: string) => {
		console.log(`[Git-sync] ${message}`);
		appendScheduleExecutionLog(execution.id, `[${new Date().toISOString()}] ${message}`);
	};

	try {
		log(`Starting sync for stack: ${stackName}`);

		// Deploy the git stack (only if there are changes)
		const result = await deployGitStack(stackId, { force: false });

		const envId = environmentId ?? undefined;

		if (result.success) {
			if (result.skipped) {
				log(`No changes detected for stack: ${stackName}, skipping redeploy`);

				// Send notification for skipped sync
				await sendEventNotification('git_sync_skipped', {
					title: 'Git sync skipped',
					message: `Stack "${stackName}" sync skipped: no changes detected`,
					type: 'info'
				}, envId);
			} else {
				log(`Successfully deployed stack: ${stackName}`);

				// Send notification for successful sync
				await sendEventNotification('git_sync_success', {
					title: 'Git stack deployed',
					message: `Stack "${stackName}" was synced and deployed successfully`,
					type: 'success'
				}, envId);
			}
			if (result.output) log(result.output);

			await updateScheduleExecution(execution.id, {
				status: result.skipped ? 'skipped' : 'success',
				completedAt: new Date().toISOString(),
				duration: Date.now() - startTime,
				details: { output: result.output }
			});
		} else {
			throw new Error(result.error || 'Deployment failed');
		}
	} catch (error: any) {
		log(`Error: ${error.message}`);
		await updateScheduleExecution(execution.id, {
			status: 'failed',
			completedAt: new Date().toISOString(),
			duration: Date.now() - startTime,
			errorMessage: error.message
		});

		// Send notification for failed sync
		const envId = environmentId ?? undefined;
		await sendEventNotification('git_sync_failed', {
			title: 'Git sync failed',
			message: `Stack "${stackName}" sync failed: ${error.message}`,
			type: 'error'
		}, envId);
	}
}
