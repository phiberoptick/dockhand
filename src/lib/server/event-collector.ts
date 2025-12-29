/**
 * Container Event Emitter
 *
 * Shared EventEmitter for broadcasting container events to SSE clients.
 * Events are emitted by the subprocess-manager when it receives them from the event-subprocess.
 */

import { EventEmitter } from 'node:events';

// Event emitter for broadcasting new events to SSE clients
// Used by:
// - subprocess-manager.ts: emits events received from event-subprocess via IPC
// - api/activity/events/+server.ts: listens for events to broadcast via SSE
export const containerEventEmitter = new EventEmitter();

// Allow up to 100 concurrent SSE listeners (default is 10)
// This prevents MaxListenersExceededWarning with many dashboard clients
containerEventEmitter.setMaxListeners(100);
