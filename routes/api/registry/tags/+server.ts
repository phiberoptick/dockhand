import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRegistry } from '$lib/server/db';

interface TagInfo {
	name: string;
	size?: number;
	lastUpdated?: string;
	digest?: string;
}

function isDockerHub(url: string): boolean {
	const lower = url.toLowerCase();
	return lower.includes('docker.io') ||
		   lower.includes('hub.docker.com') ||
		   lower.includes('registry.hub.docker.com');
}

async function fetchDockerHubTags(imageName: string): Promise<TagInfo[]> {
	// Docker Hub uses a different API
	// For official images: https://hub.docker.com/v2/repositories/library/<image>/tags
	// For user images: https://hub.docker.com/v2/repositories/<user>/<image>/tags

	let repoPath = imageName;
	if (!imageName.includes('/')) {
		// Official image (e.g., nginx -> library/nginx)
		repoPath = `library/${imageName}`;
	}

	const url = `https://hub.docker.com/v2/repositories/${repoPath}/tags?page_size=100&ordering=last_updated`;

	const response = await fetch(url, {
		headers: {
			'Accept': 'application/json'
		}
	});

	if (!response.ok) {
		if (response.status === 404) {
			throw new Error('Image not found on Docker Hub');
		}
		throw new Error(`Docker Hub returned error: ${response.status}`);
	}

	const data = await response.json();
	const results = data.results || [];

	return results.map((tag: any) => ({
		name: tag.name,
		size: tag.full_size || tag.images?.[0]?.size,
		lastUpdated: tag.last_updated || tag.tag_last_pushed,
		digest: tag.images?.[0]?.digest
	}));
}

async function fetchRegistryTags(registry: any, imageName: string): Promise<TagInfo[]> {
	// Standard V2 registry API
	let baseUrl = registry.url;
	if (!baseUrl.endsWith('/')) {
		baseUrl += '/';
	}

	const tagsUrl = `${baseUrl}v2/${imageName}/tags/list`;

	const headers: HeadersInit = {
		'Accept': 'application/json'
	};

	if (registry.username && registry.password) {
		const credentials = Buffer.from(`${registry.username}:${registry.password}`).toString('base64');
		headers['Authorization'] = `Basic ${credentials}`;
	}

	const response = await fetch(tagsUrl, {
		method: 'GET',
		headers
	});

	if (!response.ok) {
		if (response.status === 401) {
			throw new Error('Authentication failed');
		}
		if (response.status === 404) {
			throw new Error('Image not found in registry');
		}
		throw new Error(`Registry returned error: ${response.status}`);
	}

	const data = await response.json();
	const tags = data.tags || [];

	// For V2 registries, we only get tag names, not sizes or dates
	// We could fetch manifests for each tag to get more info, but that's expensive
	// Just return the basic info for now
	return tags.map((name: string) => ({
		name,
		size: undefined,
		lastUpdated: undefined,
		digest: undefined
	}));
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const registryId = url.searchParams.get('registry');
		const imageName = url.searchParams.get('image');

		if (!imageName) {
			return json({ error: 'Image name is required' }, { status: 400 });
		}

		let tags: TagInfo[];

		if (!registryId) {
			// No registry specified, assume Docker Hub
			tags = await fetchDockerHubTags(imageName);
		} else {
			const registry = await getRegistry(parseInt(registryId));
			if (!registry) {
				return json({ error: 'Registry not found' }, { status: 404 });
			}

			if (isDockerHub(registry.url)) {
				tags = await fetchDockerHubTags(imageName);
			} else {
				tags = await fetchRegistryTags(registry, imageName);
			}
		}

		return json(tags);
	} catch (error: any) {
		console.error('Error fetching tags:', error);

		if (error.code === 'ECONNREFUSED') {
			return json({ error: 'Could not connect to registry' }, { status: 503 });
		}
		if (error.code === 'ENOTFOUND') {
			return json({ error: 'Registry host not found' }, { status: 503 });
		}

		return json({ error: error.message || 'Failed to fetch tags' }, { status: 500 });
	}
};
