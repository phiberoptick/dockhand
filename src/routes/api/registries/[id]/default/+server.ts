import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setDefaultRegistry, getRegistry } from '$lib/server/db';

export const POST: RequestHandler = async ({ params }) => {
	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid registry ID' }, { status: 400 });
		}

		const registry = await getRegistry(id);
		if (!registry) {
			return json({ error: 'Registry not found' }, { status: 404 });
		}

		await setDefaultRegistry(id);
		return json({ success: true });
	} catch (error) {
		console.error('Error setting default registry:', error);
		return json({ error: 'Failed to set default registry' }, { status: 500 });
	}
};
