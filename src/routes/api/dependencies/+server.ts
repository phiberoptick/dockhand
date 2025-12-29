import { json, type RequestHandler } from '@sveltejs/kit';
import dependencies from '$lib/data/dependencies.json';

// External tools used by Dockhand (Docker images)
const externalTools = [
	{
		name: 'anchore/grype',
		version: 'latest',
		license: 'Apache-2.0',
		repository: 'https://github.com/anchore/grype'
	},
	{
		name: 'aquasec/trivy',
		version: 'latest',
		license: 'Apache-2.0',
		repository: 'https://github.com/aquasecurity/trivy'
	}
];

export const GET: RequestHandler = async () => {
	// Combine npm dependencies with external tools, exclude dockhand itself
	const allDependencies = [...dependencies, ...externalTools]
		.filter((dep) => dep.name !== 'dockhand')
		.sort((a, b) => a.name.localeCompare(b.name));
	return json(allDependencies);
};
