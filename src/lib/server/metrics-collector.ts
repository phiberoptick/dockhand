import { saveHostMetric, getEnvironments, getEnvSetting } from './db';
import { listContainers, getContainerStats, getDockerInfo, getDiskUsage } from './docker';
import { sendEventNotification } from './notifications';
import os from 'node:os';

const COLLECT_INTERVAL = 10000; // 10 seconds
const DISK_CHECK_INTERVAL = 300000; // 5 minutes
const DEFAULT_DISK_THRESHOLD = 80; // 80% threshold for disk warnings

let collectorInterval: ReturnType<typeof setInterval> | null = null;
let diskCheckInterval: ReturnType<typeof setInterval> | null = null;

// Track last disk warning sent per environment to avoid spamming
const lastDiskWarning: Map<number, number> = new Map();
const DISK_WARNING_COOLDOWN = 3600000; // 1 hour between warnings

/**
 * Collect metrics for a single environment
 */
async function collectEnvMetrics(env: { id: number; name: string; collectMetrics?: boolean }) {
	try {
		// Skip environments where metrics collection is disabled
		if (env.collectMetrics === false) {
			return;
		}

		// Get running containers
		const containers = await listContainers(false, env.id); // Only running
		let totalCpuPercent = 0;
		let totalMemUsed = 0;

		// Get stats for each running container
		const statsPromises = containers.map(async (container) => {
			try {
				const stats = await getContainerStats(container.id, env.id) as any;

				// Calculate CPU percentage
				const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
				const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
				const cpuCount = stats.cpu_stats.online_cpus || os.cpus().length;

				let cpuPercent = 0;
				if (systemDelta > 0 && cpuDelta > 0) {
					cpuPercent = (cpuDelta / systemDelta) * cpuCount * 100;
				}

				// Get container memory usage
				const memUsage = stats.memory_stats?.usage || 0;
				const memCache = stats.memory_stats?.stats?.cache || 0;
				// Subtract cache from usage to get actual memory used by the container
				const actualMemUsed = memUsage - memCache;

				return { cpu: cpuPercent, mem: actualMemUsed > 0 ? actualMemUsed : memUsage };
			} catch {
				return { cpu: 0, mem: 0 };
			}
		});

		const statsResults = await Promise.all(statsPromises);
		totalCpuPercent = statsResults.reduce((sum, v) => sum + v.cpu, 0);
		totalMemUsed = statsResults.reduce((sum, v) => sum + v.mem, 0);

		// Get host total memory from Docker info (this is the remote host's memory)
		const info = await getDockerInfo(env.id) as any;
		const memTotal = info.MemTotal || os.totalmem();

		// Calculate memory percentage based on container usage vs host total
		const memPercent = memTotal > 0 ? (totalMemUsed / memTotal) * 100 : 0;

		// Normalize CPU by number of cores from the remote host
		const cpuCount = info.NCPU || os.cpus().length;
		const normalizedCpu = totalCpuPercent / cpuCount;

		// Save to database
		await saveHostMetric(
			normalizedCpu,
			memPercent,
			totalMemUsed,
			memTotal,
			env.id
		);
	} catch (error) {
		// Skip this environment if it fails (might be offline)
		console.error(`Failed to collect metrics for ${env.name}:`, error);
	}
}

async function collectMetrics() {
	try {
		const environments = await getEnvironments();

		// Filter enabled environments and collect metrics in parallel
		const enabledEnvs = environments.filter(env => env.collectMetrics !== false);

		// Process all environments in parallel for better performance
		await Promise.all(enabledEnvs.map(env => collectEnvMetrics(env)));
	} catch (error) {
		console.error('Metrics collection error:', error);
	}
}

/**
 * Check disk space for a single environment
 */
async function checkEnvDiskSpace(env: { id: number; name: string; collectMetrics?: boolean }) {
	try {
		// Skip environments where metrics collection is disabled
		if (env.collectMetrics === false) {
			return;
		}

		// Check if we're in cooldown for this environment
		const lastWarningTime = lastDiskWarning.get(env.id);
		if (lastWarningTime && Date.now() - lastWarningTime < DISK_WARNING_COOLDOWN) {
			return; // Skip this environment, still in cooldown
		}

		// Get Docker disk usage data
		const diskData = await getDiskUsage(env.id) as any;
		if (!diskData) return;

		// Calculate total Docker disk usage using reduce for cleaner code
		let totalUsed = 0;
		if (diskData.Images) {
			totalUsed += diskData.Images.reduce((sum: number, img: any) => sum + (img.Size || 0), 0);
		}
		if (diskData.Containers) {
			totalUsed += diskData.Containers.reduce((sum: number, c: any) => sum + (c.SizeRw || 0), 0);
		}
		if (diskData.Volumes) {
			totalUsed += diskData.Volumes.reduce((sum: number, v: any) => sum + (v.UsageData?.Size || 0), 0);
		}
		if (diskData.BuildCache) {
			totalUsed += diskData.BuildCache.reduce((sum: number, bc: any) => sum + (bc.Size || 0), 0);
		}

		// Get Docker root filesystem info from Docker info
		const info = await getDockerInfo(env.id) as any;
		const driverStatus = info?.DriverStatus;

		// Try to find "Data Space Total" from driver status
		let dataSpaceTotal = 0;
		let diskPercentUsed = 0;

		if (driverStatus) {
			for (const [key, value] of driverStatus) {
				if (key === 'Data Space Total' && typeof value === 'string') {
					dataSpaceTotal = parseSize(value);
					break;
				}
			}
		}

		// If we found total disk space, calculate percentage
		if (dataSpaceTotal > 0) {
			diskPercentUsed = (totalUsed / dataSpaceTotal) * 100;
		} else {
			// Fallback: just report absolute usage if we can't determine percentage
			const GB = 1024 * 1024 * 1024;
			if (totalUsed > 50 * GB) {
				await sendEventNotification('disk_space_warning', {
					title: 'High Docker disk usage',
					message: `Environment "${env.name}" is using ${formatSize(totalUsed)} of Docker disk space`,
					type: 'warning'
				}, env.id);
				lastDiskWarning.set(env.id, Date.now());
			}
			return;
		}

		// Check against threshold
		const threshold = await getEnvSetting('disk_warning_threshold', env.id) || DEFAULT_DISK_THRESHOLD;
		if (diskPercentUsed >= threshold) {
			console.log(`[Metrics] Docker disk usage for ${env.name}: ${diskPercentUsed.toFixed(1)}% (threshold: ${threshold}%)`);

			await sendEventNotification('disk_space_warning', {
				title: 'Disk space warning',
				message: `Environment "${env.name}" Docker disk usage is at ${diskPercentUsed.toFixed(1)}% (${formatSize(totalUsed)} used)`,
				type: 'warning'
			}, env.id);

			lastDiskWarning.set(env.id, Date.now());
		}
	} catch (error) {
		// Skip this environment if it fails
		console.error(`Failed to check disk space for ${env.name}:`, error);
	}
}

/**
 * Check Docker disk usage and send warnings if above threshold
 */
async function checkDiskSpace() {
	try {
		const environments = await getEnvironments();

		// Filter enabled environments and check disk space in parallel
		const enabledEnvs = environments.filter(env => env.collectMetrics !== false);

		// Process all environments in parallel for better performance
		await Promise.all(enabledEnvs.map(env => checkEnvDiskSpace(env)));
	} catch (error) {
		console.error('Disk space check error:', error);
	}
}

/**
 * Parse size string like "107.4GB" to bytes
 */
function parseSize(sizeStr: string): number {
	const units: Record<string, number> = {
		'B': 1,
		'KB': 1024,
		'MB': 1024 * 1024,
		'GB': 1024 * 1024 * 1024,
		'TB': 1024 * 1024 * 1024 * 1024
	};

	const match = sizeStr.match(/^([\d.]+)\s*([KMGT]?B)$/i);
	if (!match) return 0;

	const value = parseFloat(match[1]);
	const unit = match[2].toUpperCase();
	return value * (units[unit] || 1);
}

/**
 * Format bytes to human readable string
 */
function formatSize(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let unitIndex = 0;
	let size = bytes;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function startMetricsCollector() {
	if (collectorInterval) return; // Already running

	console.log('Starting server-side metrics collector (every 10s)');

	// Initial collection
	collectMetrics();

	// Schedule regular collection
	collectorInterval = setInterval(collectMetrics, COLLECT_INTERVAL);

	// Start disk space checking (every 5 minutes)
	console.log('Starting disk space monitoring (every 5 minutes)');
	checkDiskSpace(); // Initial check
	diskCheckInterval = setInterval(checkDiskSpace, DISK_CHECK_INTERVAL);
}

export function stopMetricsCollector() {
	if (collectorInterval) {
		clearInterval(collectorInterval);
		collectorInterval = null;
	}
	if (diskCheckInterval) {
		clearInterval(diskCheckInterval);
		diskCheckInterval = null;
	}
	lastDiskWarning.clear();
	console.log('Metrics collector stopped');
}
