import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRegistry } from '$lib/server/db';

interface SearchResult {
	name: string;
	description: string;
	star_count: number;
	is_official: boolean;
	is_automated: boolean;
}

function isDockerHub(url: string): boolean {
	const lower = url.toLowerCase();
	return lower.includes('docker.io') ||
		   lower.includes('hub.docker.com') ||
		   lower.includes('registry.hub.docker.com');
}

async function searchDockerHub(term: string, limit: number): Promise<SearchResult[]> {
	// Use Docker Hub's search API directly
	const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(term)}&page_size=${limit}`;

	const response = await fetch(url, {
		headers: {
			'Accept': 'application/json'
		}
	});

	if (!response.ok) {
		throw new Error(`Docker Hub search failed: ${response.status}`);
	}

	const data = await response.json();
	const results = data.results || [];

	return results.map((item: any) => ({
		name: item.repo_name || item.name,
		description: item.short_description || item.description || '',
		star_count: item.star_count || 0,
		is_official: item.is_official || false,
		is_automated: item.is_automated || false
	}));
}

async function searchPrivateRegistry(registry: any, term: string, limit: number): Promise<SearchResult[]> {
	// Private registries use the V2 catalog API
	let baseUrl = registry.url;
	if (!baseUrl.endsWith('/')) {
		baseUrl += '/';
	}

	const catalogUrl = `${baseUrl}v2/_catalog?n=1000`;

	const headers: HeadersInit = {
		'Accept': 'application/json'
	};

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
			throw new Error('Authentication failed');
		}
		throw new Error(`Registry returned error: ${response.status}`);
	}

	const data = await response.json();
	const repositories = data.repositories || [];

	// Filter repositories by search term (case-insensitive)
	const termLower = term.toLowerCase();
	const filtered = repositories
		.filter((name: string) => name.toLowerCase().includes(termLower))
		.slice(0, limit);

	// Return results in the same format as Docker Hub
	return filtered.map((name: string) => ({
		name,
		description: '',
		star_count: 0,
		is_official: false,
		is_automated: false
	}));
}

export const GET: RequestHandler = async ({ url }) => {
	const term = url.searchParams.get('term');
	const limit = parseInt(url.searchParams.get('limit') || '25', 10);
	const registryId = url.searchParams.get('registry');

	if (!term) {
		return json({ error: 'Search term is required' }, { status: 400 });
	}

	try {
		let results: SearchResult[];

		if (!registryId) {
			// No registry specified, search Docker Hub
			results = await searchDockerHub(term, limit);
		} else {
			const registry = await getRegistry(parseInt(registryId));
			if (!registry) {
				return json({ error: 'Registry not found' }, { status: 404 });
			}

			if (isDockerHub(registry.url)) {
				results = await searchDockerHub(term, limit);
			} else {
				results = await searchPrivateRegistry(registry, term, limit);
			}
		}

		return json(results);
	} catch (error: any) {
		console.error('Failed to search images:', error);

		if (error.code === 'ECONNREFUSED') {
			return json({ error: 'Could not connect to registry' }, { status: 503 });
		}
		if (error.code === 'ENOTFOUND') {
			return json({ error: 'Registry host not found' }, { status: 503 });
		}

		return json({ error: error.message || 'Failed to search images' }, { status: 500 });
	}
};
