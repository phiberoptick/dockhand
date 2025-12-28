import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRegistry } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const registryId = url.searchParams.get('registry');

		if (!registryId) {
			return json({ error: 'Registry ID is required' }, { status: 400 });
		}

		const registry = await getRegistry(parseInt(registryId));
		if (!registry) {
			return json({ error: 'Registry not found' }, { status: 404 });
		}

		// Docker Hub doesn't support catalog listing
		if (registry.url.includes('docker.io') || registry.url.includes('hub.docker.com') || registry.url.includes('registry.hub.docker.com')) {
			return json({ error: 'Docker Hub does not support catalog listing. Please use search instead.' }, { status: 400 });
		}

		// Build the catalog URL
		let catalogUrl = registry.url;
		if (!catalogUrl.endsWith('/')) {
			catalogUrl += '/';
		}
		catalogUrl += 'v2/_catalog';

		// Prepare headers
		const headers: HeadersInit = {
			'Accept': 'application/json'
		};

		// Add auth if credentials are present
		if (registry.username && registry.password) {
			const credentials = Buffer.from(`${registry.username}:${registry.password}`).toString('base64');
			headers['Authorization'] = `Basic ${credentials}`;
		}

		const response = await fetch(catalogUrl, {
			method: 'GET',
			headers
		});

		if (!response.ok) {
			if (response.status === 401) {
				return json({ error: 'Authentication failed. Please check your credentials.' }, { status: 401 });
			}
			if (response.status === 404) {
				return json({ error: 'Registry does not support V2 catalog API' }, { status: 404 });
			}
			return json({ error: `Registry returned error: ${response.status}` }, { status: response.status });
		}

		const data = await response.json();

		// The V2 API returns { repositories: [...] }
		const repositories = data.repositories || [];

		// For each repository, we could fetch tags, but that's expensive
		// Just return the repository names for now
		const results = repositories.map((name: string) => ({
			name,
			description: '',
			star_count: 0,
			is_official: false,
			is_automated: false
		}));

		return json(results);
	} catch (error: any) {
		console.error('Error fetching registry catalog:', error);

		if (error.code === 'ECONNREFUSED') {
			return json({ error: 'Could not connect to registry' }, { status: 503 });
		}
		if (error.code === 'ENOTFOUND') {
			return json({ error: 'Registry host not found' }, { status: 503 });
		}
		if (error.cause?.code === 'ERR_SSL_PACKET_LENGTH_TOO_LONG') {
			return json({ error: 'SSL error: Registry may be using HTTP, not HTTPS. Try changing the URL to http://' }, { status: 503 });
		}
		if (error.cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || error.cause?.code === 'CERT_HAS_EXPIRED') {
			return json({ error: 'SSL certificate error. Registry may have an invalid or self-signed certificate.' }, { status: 503 });
		}

		return json({ error: 'Failed to fetch catalog: ' + (error.message || 'Unknown error') }, { status: 500 });
	}
};
