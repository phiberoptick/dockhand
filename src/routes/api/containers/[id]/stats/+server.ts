import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getContainerStats } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { hasEnvironments } from '$lib/server/db';

function calculateCpuPercent(stats: any): number {
	const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
	const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
	const cpuCount = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;

	if (systemDelta > 0 && cpuDelta > 0) {
		return (cpuDelta / systemDelta) * cpuCount * 100;
	}
	return 0;
}

function calculateNetworkIO(stats: any): { rx: number; tx: number } {
	let rx = 0;
	let tx = 0;

	if (stats.networks) {
		for (const iface of Object.values(stats.networks) as any[]) {
			rx += iface.rx_bytes || 0;
			tx += iface.tx_bytes || 0;
		}
	}

	return { rx, tx };
}

function calculateBlockIO(stats: any): { read: number; write: number } {
	let read = 0;
	let write = 0;

	const ioStats = stats.blkio_stats?.io_service_bytes_recursive;
	if (Array.isArray(ioStats)) {
		for (const entry of ioStats) {
			if (entry.op === 'read' || entry.op === 'Read') {
				read += entry.value || 0;
			} else if (entry.op === 'write' || entry.op === 'Write') {
				write += entry.value || 0;
			}
		}
	}

	return { read, write };
}

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	// Permission check with environment context (stats uses view permission)
	if (auth.authEnabled && !await auth.can('containers', 'view', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	// Early return if no environments configured (fresh install)
	if (!await hasEnvironments()) {
		return json({ error: 'No environment configured' }, { status: 404 });
	}

	try {
		const stats = await getContainerStats(params.id, envIdNum) as any;

		const cpuPercent = calculateCpuPercent(stats);
		const memoryUsage = stats.memory_stats?.usage || 0;
		const memoryLimit = stats.memory_stats?.limit || 1;
		const memoryPercent = (memoryUsage / memoryLimit) * 100;
		const networkIO = calculateNetworkIO(stats);
		const blockIO = calculateBlockIO(stats);

		return json({
			cpuPercent: Math.round(cpuPercent * 100) / 100,
			memoryUsage,
			memoryLimit,
			memoryPercent: Math.round(memoryPercent * 100) / 100,
			networkRx: networkIO.rx,
			networkTx: networkIO.tx,
			blockRead: blockIO.read,
			blockWrite: blockIO.write,
			timestamp: Date.now()
		});
	} catch (error: any) {
		console.error('Failed to get container stats:', error);
		return json({ error: error.message || 'Failed to get stats' }, { status: 500 });
	}
};
