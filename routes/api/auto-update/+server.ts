import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAutoUpdateSettings } from '$lib/server/db';

/**
 * Batch endpoint to get all auto-update settings for an environment.
 * Returns a map of containerName -> settings for efficient lookup.
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const envIdParam = url.searchParams.get('env');
		const envId = envIdParam ? parseInt(envIdParam) : undefined;

		const settings = await getAutoUpdateSettings(envId);

		// Convert to a map keyed by container name for efficient frontend lookup
		const settingsMap: Record<string, {
			enabled: boolean;
			scheduleType: string;
			cronExpression: string | null;
			vulnerabilityCriteria: string;
		}> = {};

		for (const setting of settings) {
			if (setting.enabled) {
				settingsMap[setting.containerName] = {
					enabled: setting.enabled,
					scheduleType: setting.scheduleType,
					cronExpression: setting.cronExpression,
					vulnerabilityCriteria: setting.vulnerabilityCriteria || 'never'
				};
			}
		}

		return json(settingsMap);
	} catch (error) {
		console.error('Failed to get auto-update settings:', error);
		return json({ error: 'Failed to get auto-update settings' }, { status: 500 });
	}
};
