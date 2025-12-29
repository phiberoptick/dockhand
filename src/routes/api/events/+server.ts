import type { RequestHandler } from './$types';
import { getDockerEvents } from '$lib/server/docker';
import { getEnvironment } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	// Early return if no environment specified
	if (!envIdNum) {
		return new Response(
			`event: info\ndata: ${JSON.stringify({ message: 'No environment selected' })}\n\n`,
			{
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache'
				}
			}
		);
	}

	// Check if this is an edge mode environment - events are pushed by the agent, not pulled
	const env = await getEnvironment(envIdNum);
	if (env?.connectionType === 'hawser-edge') {
		return new Response(
			`event: error\ndata: ${JSON.stringify({ message: 'Edge environments receive events via agent push, not this endpoint' })}\n\n`,
			{
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache'
				}
			}
		);
	}

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			// Send initial connection event
			const sendEvent = (type: string, data: any) => {
				const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
				controller.enqueue(encoder.encode(event));
			};

			// Send heartbeat to keep connection alive (every 5s to prevent Traefik 10s idle timeout)
			const heartbeatInterval = setInterval(() => {
				try {
					sendEvent('heartbeat', { timestamp: new Date().toISOString() });
				} catch {
					clearInterval(heartbeatInterval);
				}
			}, 5000);

			sendEvent('connected', { timestamp: new Date().toISOString(), envId: envIdNum });

			try {
				// Get Docker events stream
				const eventStream = await getDockerEvents(
					{ type: ['container', 'image', 'volume', 'network'] },
					envIdNum
				);

				if (!eventStream) {
					sendEvent('error', { message: 'Failed to connect to Docker events' });
					clearInterval(heartbeatInterval);
					controller.close();
					return;
				}

				const reader = eventStream.getReader();
				const decoder = new TextDecoder();
				let buffer = '';

				const processEvents = async () => {
					try {
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;

							buffer += decoder.decode(value, { stream: true });
							const lines = buffer.split('\n');
							buffer = lines.pop() || '';

							for (const line of lines) {
								if (line.trim()) {
									try {
										const event = JSON.parse(line);

										// Map Docker event to our format
										const mappedEvent = {
											type: event.Type,
											action: event.Action,
											actor: {
												id: event.Actor?.ID,
												name: event.Actor?.Attributes?.name || event.Actor?.Attributes?.image,
												attributes: event.Actor?.Attributes
											},
											time: event.time,
											timeNano: event.timeNano
										};

										sendEvent('docker', mappedEvent);
									} catch {
										// Ignore parse errors for partial chunks
									}
								}
							}
						}
					} catch (error: any) {
						console.error('Docker event stream error:', error);
						sendEvent('error', { message: error.message });
					} finally {
						clearInterval(heartbeatInterval);
						controller.close();
					}
				};

				processEvents();
			} catch (error: any) {
				console.error('Failed to connect to Docker events:', error);
				sendEvent('error', { message: error.message || 'Failed to connect to Docker' });
				clearInterval(heartbeatInterval);
				controller.close();
			}
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
