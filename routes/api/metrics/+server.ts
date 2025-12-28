import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHostMetrics } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const limit = parseInt(url.searchParams.get('limit') || '60');
		const envId = url.searchParams.get('env');
		const envIdNum = envId ? parseInt(envId) : undefined;

		const metrics = await getHostMetrics(limit, envIdNum);

		// Return metrics in chronological order (oldest first) for graphing
		const chronological = metrics.reverse();

		return json({
			metrics: chronological,
			latest: metrics.length > 0 ? metrics[metrics.length - 1] : null
		});
	} catch (error) {
		console.error('Failed to get host metrics:', error);
		return json({ error: 'Failed to get host metrics' }, { status: 500 });
	}
};
