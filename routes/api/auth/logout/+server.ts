import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { destroySession } from '$lib/server/auth';

// POST /api/auth/logout - End session
export const POST: RequestHandler = async ({ cookies }) => {
	try {
		await destroySession(cookies);
		return json({ success: true });
	} catch (error) {
		console.error('Logout error:', error);
		return json({ error: 'Logout failed' }, { status: 500 });
	}
};
