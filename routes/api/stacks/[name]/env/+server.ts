import { json } from '@sveltejs/kit';
import { getStackEnvVars, setStackEnvVars } from '$lib/server/db';
import { authorize } from '$lib/server/authorize';
import type { RequestHandler } from './$types';

/**
 * GET /api/stacks/[name]/env?env=X
 * Get all environment variables for a stack.
 * Secrets are masked with '***' in the response.
 */
export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const auth = await authorize(cookies);
	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : null;

	// Permission check with environment context
	if (auth.authEnabled && !await auth.can('stacks', 'view', envIdNum ?? undefined)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	// Environment access check (enterprise only)
	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	try {
		const stackName = decodeURIComponent(params.name);
		const variables = await getStackEnvVars(stackName, envIdNum, true);

		return json({
			variables: variables.map(v => ({
				key: v.key,
				value: v.value,
				isSecret: v.isSecret
			}))
		});
	} catch (error) {
		console.error('Error getting stack env vars:', error);
		return json({ error: 'Failed to get environment variables' }, { status: 500 });
	}
};

/**
 * PUT /api/stacks/[name]/env?env=X
 * Set/replace all environment variables for a stack.
 * Body: { variables: [{ key, value, isSecret? }] }
 *
 * Note: For secrets, if the value is '***' (the masked placeholder), the original
 * secret value from the database is preserved instead of overwriting with '***'.
 */
export const PUT: RequestHandler = async ({ params, url, cookies, request }) => {
	const auth = await authorize(cookies);
	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : null;

	// Permission check with environment context
	if (auth.authEnabled && !await auth.can('stacks', 'edit', envIdNum ?? undefined)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	// Environment access check (enterprise only)
	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	try {
		const stackName = decodeURIComponent(params.name);
		const body = await request.json();

		if (!body.variables || !Array.isArray(body.variables)) {
			return json({ error: 'Invalid request body: variables array required' }, { status: 400 });
		}

		// Validate variables
		for (const v of body.variables) {
			if (!v.key || typeof v.key !== 'string') {
				return json({ error: 'Invalid variable: key is required and must be a string' }, { status: 400 });
			}
			if (typeof v.value !== 'string') {
				return json({ error: `Invalid variable "${v.key}": value must be a string` }, { status: 400 });
			}
			// Validate key format (env var naming convention)
			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.key)) {
				return json({ error: `Invalid variable name "${v.key}": must start with a letter or underscore and contain only alphanumeric characters and underscores` }, { status: 400 });
			}
		}

		// Check if any secrets have the masked placeholder '***'
		// If so, we need to preserve their original values from the database
		const secretsWithMaskedValue = body.variables.filter(
			(v: { key: string; value: string; isSecret?: boolean }) =>
				v.isSecret && v.value === '***'
		);

		let variablesToSave = body.variables;

		if (secretsWithMaskedValue.length > 0) {
			// Get existing variables (unmasked) to preserve secret values
			const existingVars = await getStackEnvVars(stackName, envIdNum, false);
			const existingByKey = new Map(existingVars.map(v => [v.key, v]));

			// Replace masked secrets with their original values
			variablesToSave = body.variables.map((v: { key: string; value: string; isSecret?: boolean }) => {
				if (v.isSecret && v.value === '***') {
					const existing = existingByKey.get(v.key);
					if (existing && existing.isSecret) {
						// Preserve the original secret value
						return { ...v, value: existing.value };
					}
				}
				return v;
			});
		}

		await setStackEnvVars(stackName, envIdNum, variablesToSave);

		return json({ success: true, count: variablesToSave.length });
	} catch (error) {
		console.error('Error setting stack env vars:', error);
		return json({ error: 'Failed to set environment variables' }, { status: 500 });
	}
};
