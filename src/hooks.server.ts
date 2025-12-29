import { initDatabase, hasAdminUser } from '$lib/server/db';
import { startSubprocesses, stopSubprocesses } from '$lib/server/subprocess-manager';
import { startScheduler } from '$lib/server/scheduler';
import { isAuthEnabled, validateSession } from '$lib/server/auth';
import { setServerStartTime } from '$lib/server/uptime';
import { checkLicenseExpiry, getHostname } from '$lib/server/license';
import type { HandleServerError, Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

// License expiry check interval (24 hours)
const LICENSE_CHECK_INTERVAL = 86400000;

// HMR guard for license check interval
declare global {
	var __licenseCheckInterval: ReturnType<typeof setInterval> | undefined;
}

// Initialize database on server start (synchronous with SQLite)
let initialized = false;

if (!initialized) {
	try {
		setServerStartTime(); // Track when server started
		initDatabase();
		// Log hostname for license validation (set by entrypoint in Docker, or os.hostname() outside)
		console.log('Hostname for license validation:', getHostname());
		// Start background subprocesses for metrics and event collection (isolated processes)
		startSubprocesses().catch(err => {
			console.error('Failed to start background subprocesses:', err);
		});
		startScheduler(); // Start unified scheduler for auto-updates and git syncs (async)

		// Check license expiry on startup and then daily (with HMR guard)
		checkLicenseExpiry().catch(err => {
			console.error('Failed to check license expiry:', err);
		});
		if (!globalThis.__licenseCheckInterval) {
			globalThis.__licenseCheckInterval = setInterval(() => {
				checkLicenseExpiry().catch(err => {
					console.error('Failed to check license expiry:', err);
				});
			}, LICENSE_CHECK_INTERVAL);
		}

		// Graceful shutdown handling
		const shutdown = async () => {
			console.log('[Server] Shutting down...');
			await stopSubprocesses();
			process.exit(0);
		};
		process.on('SIGTERM', shutdown);
		process.on('SIGINT', shutdown);

		initialized = true;
	} catch (error) {
		console.error('Failed to initialize database:', error);
	}
}

// Routes that don't require authentication
const PUBLIC_PATHS = [
	'/login',
	'/api/auth/login',
	'/api/auth/logout',
	'/api/auth/session',
	'/api/auth/settings',
	'/api/auth/providers',
	'/api/auth/oidc',
	'/api/license',
	'/api/changelog',
	'/api/dependencies'
];

// Check if path is public
function isPublicPath(pathname: string): boolean {
	return PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(path + '/'));
}

// Check if path is a static asset
function isStaticAsset(pathname: string): boolean {
	return pathname.startsWith('/_app/') ||
		pathname.startsWith('/favicon') ||
		pathname.endsWith('.webp') ||
		pathname.endsWith('.png') ||
		pathname.endsWith('.jpg') ||
		pathname.endsWith('.svg') ||
		pathname.endsWith('.ico') ||
		pathname.endsWith('.css') ||
		pathname.endsWith('.js');
}

export const handle: Handle = async ({ event, resolve }) => {
	// Skip auth for static assets
	if (isStaticAsset(event.url.pathname)) {
		return resolve(event);
	}

	// WebSocket upgrade for terminal connections is handled by the build patch (scripts/patch-build.ts)
	// This is necessary because svelte-adapter-bun expects server.websocket() which doesn't exist in SvelteKit

	// Check if auth is enabled
	const authEnabled = await isAuthEnabled();

	// If auth is disabled, allow everything (app works as before)
	if (!authEnabled) {
		event.locals.user = null;
		event.locals.authEnabled = false;
		return resolve(event);
	}

	// Auth is enabled - check session
	const user = await validateSession(event.cookies);
	event.locals.user = user;
	event.locals.authEnabled = true;

	// Public paths don't require authentication
	if (isPublicPath(event.url.pathname)) {
		return resolve(event);
	}

	// If not authenticated
	if (!user) {
		// Special case: allow user creation when auth is enabled but no admin exists yet
		// This enables the first admin user to be created during initial setup
		const noAdminSetupMode = !(await hasAdminUser());
		if (noAdminSetupMode && event.url.pathname === '/api/users' && event.request.method === 'POST') {
			return resolve(event);
		}

		// API routes return 401
		if (event.url.pathname.startsWith('/api/')) {
			return new Response(
				JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// UI routes redirect to login
		const redirectUrl = encodeURIComponent(event.url.pathname + event.url.search);
		redirect(307, `/login?redirect=${redirectUrl}`);
	}

	return resolve(event);
};

export const handleError: HandleServerError = ({ error, event }) => {
	// Skip logging 404 errors - they're expected for missing routes
	const status = (error as { status?: number })?.status;
	if (status === 404) {
		return {
			message: 'Not found',
			code: 'NOT_FOUND'
		};
	}

	// Log only essential error info without code snippets
	const message = error instanceof Error ? error.message : 'Unknown error';
	console.error(`[Error] ${event.url.pathname}: ${message}`);

	return {
		message,
		code: 'INTERNAL_ERROR'
	};
};
// CI trigger 1766327149
