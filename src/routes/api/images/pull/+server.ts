import { json } from '@sveltejs/kit';
import { pullImage } from '$lib/server/docker';
import type { RequestHandler } from './$types';
import { getScannerSettings, scanImage } from '$lib/server/scanner';
import { saveVulnerabilityScan, getEnvironment } from '$lib/server/db';
import { authorize } from '$lib/server/authorize';
import { auditImage } from '$lib/server/audit';
import { sendEdgeStreamRequest, isEdgeConnected } from '$lib/server/hawser';

/**
 * Check if environment is edge mode
 */
async function isEdgeMode(envId?: number): Promise<{ isEdge: boolean; environmentId?: number }> {
	if (!envId) {
		return { isEdge: false };
	}
	const env = await getEnvironment(envId);
	if (env?.connectionType === 'hawser-edge') {
		return { isEdge: true, environmentId: envId };
	}
	return { isEdge: false };
}

/**
 * Build image pull URL with proper tag handling
 */
function buildPullUrl(imageName: string): string {
	let fromImage = imageName;
	let tag = 'latest';

	if (imageName.includes('@')) {
		fromImage = imageName;
		tag = '';
	} else if (imageName.includes(':')) {
		const lastColonIndex = imageName.lastIndexOf(':');
		const potentialTag = imageName.substring(lastColonIndex + 1);
		if (!potentialTag.includes('/')) {
			fromImage = imageName.substring(0, lastColonIndex);
			tag = potentialTag;
		}
	}

	return tag
		? `/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`
		: `/images/create?fromImage=${encodeURIComponent(fromImage)}`;
}

export const POST: RequestHandler = async (event) => {
	const { request, url, cookies } = event;
	const auth = await authorize(cookies);

	const envIdParam = url.searchParams.get('env');
	const envId = envIdParam ? parseInt(envIdParam) : undefined;

	// Permission check with environment context
	if (auth.authEnabled && !await auth.can('images', 'pull', envId)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	// Environment access check (enterprise only)
	if (envId && auth.isEnterprise && !await auth.canAccessEnvironment(envId)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	const { image, scanAfterPull } = await request.json();

	// If scanAfterPull is explicitly false, skip scan-on-pull (caller will handle scanning)
	const skipScanOnPull = scanAfterPull === false;

	// Audit log the pull attempt
	await auditImage(event, 'pull', image, image, envId);

	// Check if this is an edge environment
	const edgeCheck = await isEdgeMode(envId);

	const encoder = new TextEncoder();
	let controllerClosed = false;
	let controller: ReadableStreamDefaultController<Uint8Array>;
	let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	let cancelEdgeStream: (() => void) | null = null;

	const safeEnqueue = (data: string) => {
		if (!controllerClosed) {
			try {
				controller.enqueue(encoder.encode(data));
			} catch {
				controllerClosed = true;
			}
		}
	};

	const cleanup = () => {
		if (heartbeatInterval) {
			clearInterval(heartbeatInterval);
			heartbeatInterval = null;
		}
		if (cancelEdgeStream) {
			cancelEdgeStream();
			cancelEdgeStream = null;
		}
		controllerClosed = true;
	};

	/**
	 * Handle scan-on-pull after image is pulled
	 */
	const handleScanOnPull = async () => {
		// Skip if caller explicitly requested no scan (e.g., CreateContainerModal handles scanning separately)
		if (skipScanOnPull) return;

		const { scanner } = await getScannerSettings(envId);
		// Scan if scanning is enabled (scanner !== 'none')
		if (scanner !== 'none') {
			safeEnqueue(`data: ${JSON.stringify({ status: 'scanning', message: 'Starting vulnerability scan...' })}\n\n`);

			try {
				const results = await scanImage(image, envId, (progress) => {
					safeEnqueue(`data: ${JSON.stringify({ status: 'scan-progress', ...progress })}\n\n`);
				});

				for (const result of results) {
					await saveVulnerabilityScan({
						environmentId: envId ?? null,
						imageId: result.imageId,
						imageName: result.imageName,
						scanner: result.scanner,
						scannedAt: result.scannedAt,
						scanDuration: result.scanDuration,
						criticalCount: result.summary.critical,
						highCount: result.summary.high,
						mediumCount: result.summary.medium,
						lowCount: result.summary.low,
						negligibleCount: result.summary.negligible,
						unknownCount: result.summary.unknown,
						vulnerabilities: result.vulnerabilities,
						error: result.error ?? null
					});
				}

				const totalVulns = results.reduce((sum, r) => sum + r.vulnerabilities.length, 0);
				safeEnqueue(`data: ${JSON.stringify({
					status: 'scan-complete',
					message: `Scan complete - found ${totalVulns} vulnerabilities`,
					results
				})}\n\n`);
			} catch (scanError) {
				console.error('Scan-on-pull failed:', scanError);
				safeEnqueue(`data: ${JSON.stringify({
					status: 'scan-error',
					error: scanError instanceof Error ? scanError.message : String(scanError)
				})}\n\n`);
			}
		}
	};

	const stream = new ReadableStream({
		async start(ctrl) {
			controller = ctrl;

			// Start heartbeat to keep connection alive through Traefik (10s idle timeout)
			heartbeatInterval = setInterval(() => {
				safeEnqueue(`: keepalive\n\n`);
			}, 5000);

			console.log(`Starting pull for image: ${image}${edgeCheck.isEdge ? ' (edge mode)' : ''}`);

			// Handle edge mode with streaming
			if (edgeCheck.isEdge && edgeCheck.environmentId) {
				if (!isEdgeConnected(edgeCheck.environmentId)) {
					safeEnqueue(`data: ${JSON.stringify({ status: 'error', error: 'Edge agent not connected' })}\n\n`);
					cleanup();
					controller.close();
					return;
				}

				const pullUrl = buildPullUrl(image);

				const { cancel } = sendEdgeStreamRequest(
					edgeCheck.environmentId,
					'POST',
					pullUrl,
					{
						onData: (data: string) => {
							// Data is base64 encoded JSON lines from Docker
							try {
								const decoded = Buffer.from(data, 'base64').toString('utf-8');
								// Docker sends newline-delimited JSON
								const lines = decoded.split('\n').filter(line => line.trim());
								for (const line of lines) {
									try {
										const progress = JSON.parse(line);
										safeEnqueue(`data: ${JSON.stringify(progress)}\n\n`);
									} catch {
										// Ignore parse errors for partial lines
									}
								}
							} catch {
								// If not base64, try as-is
								try {
									const progress = JSON.parse(data);
									safeEnqueue(`data: ${JSON.stringify(progress)}\n\n`);
								} catch {
									// Ignore
								}
							}
						},
						onEnd: async () => {
							safeEnqueue(`data: ${JSON.stringify({ status: 'complete' })}\n\n`);

							// Handle scan-on-pull
							await handleScanOnPull();

							cleanup();
							controller.close();
						},
						onError: (error: string) => {
							console.error('Edge pull error:', error);
							safeEnqueue(`data: ${JSON.stringify({ status: 'error', error })}\n\n`);
							cleanup();
							controller.close();
						}
					}
				);

				cancelEdgeStream = cancel;
			} else {
				// Non-edge mode: use existing pullImage function
				try {
					await pullImage(image, (progress) => {
						const data = JSON.stringify(progress) + '\n';
						safeEnqueue(`data: ${data}\n\n`);
					}, envId);

					safeEnqueue(`data: ${JSON.stringify({ status: 'complete' })}\n\n`);

					// Handle scan-on-pull
					await handleScanOnPull();

					cleanup();
					controller.close();
				} catch (error) {
					console.error('Error pulling image:', error);
					safeEnqueue(`data: ${JSON.stringify({
						status: 'error',
						error: String(error)
					})}\n\n`);
					cleanup();
					controller.close();
				}
			}
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
