import { json, type RequestHandler } from '@sveltejs/kit';
import { getDashboardPreferences, saveDashboardPreferences } from '$lib/server/db';
import { authorize } from '$lib/server/authorize';

export const GET: RequestHandler = async ({ cookies }) => {
	const auth = await authorize(cookies);

	try {
		// Get user-specific preferences, or fall back to global preferences
		const userId = auth.user?.id ?? null;
		const prefs = await getDashboardPreferences(userId);

		// If no preferences exist, return empty gridLayout
		if (!prefs) {
			return json({
				id: 0,
				userId: null,
				gridLayout: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			});
		}

		return json(prefs);
	} catch (error) {
		console.error('Failed to get dashboard preferences:', error);
		return json({ error: 'Failed to get dashboard preferences' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const auth = await authorize(cookies);

	try {
		const body = await request.json();
		const { gridLayout } = body;

		if (!gridLayout || !Array.isArray(gridLayout)) {
			return json({ error: 'gridLayout is required and must be an array' }, { status: 400 });
		}

		const userId = auth.user?.id ?? null;
		const prefs = await saveDashboardPreferences({
			userId,
			gridLayout
		});

		return json(prefs);
	} catch (error) {
		console.error('Failed to save dashboard preferences:', error);
		return json({ error: 'Failed to save dashboard preferences' }, { status: 500 });
	}
};
