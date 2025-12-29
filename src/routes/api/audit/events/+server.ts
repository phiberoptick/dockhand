import type { RequestHandler } from './$types';
import { authorize, enterpriseRequired } from '$lib/server/authorize';
import { auditEvents, type AuditEventData } from '$lib/server/audit-events';

export const GET: RequestHandler = async ({ cookies }) => {
	const auth = await authorize(cookies);

	// Audit log is Enterprise-only
	if (!auth.isEnterprise) {
		return new Response(JSON.stringify(enterpriseRequired()), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Check permission
	if (!await auth.canViewAuditLog()) {
		return new Response(JSON.stringify({ error: 'Permission denied' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// Send SSE event
			const sendEvent = (type: string, data: any) => {
				const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
				try {
					controller.enqueue(encoder.encode(event));
				} catch (e) {
					// Client disconnected
				}
			};

			// Send initial connection event
			sendEvent('connected', { timestamp: new Date().toISOString() });

			// Send heartbeat to keep connection alive (every 5s to prevent Traefik 10s idle timeout)
			const heartbeatInterval = setInterval(() => {
				try {
					sendEvent('heartbeat', { timestamp: new Date().toISOString() });
				} catch {
					clearInterval(heartbeatInterval);
				}
			}, 5000);

			// Listen for audit events
			const onAuditEvent = (data: AuditEventData) => {
				sendEvent('audit', data);
			};

			auditEvents.on('audit', onAuditEvent);

			// Cleanup when client disconnects
			const cleanup = () => {
				clearInterval(heartbeatInterval);
				auditEvents.off('audit', onAuditEvent);
			};

			// Note: SvelteKit doesn't provide a direct way to detect client disconnect
			// The cleanup will happen when the stream errors or the server shuts down
			// For production, consider using a WebSocket instead for better connection management

			return cleanup;
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no' // Disable nginx buffering
		}
	});
};
