import { writable, get } from 'svelte/store';
import { currentEnvironment, appendEnvParam } from './environment';

export interface ContainerStats {
	id: string;
	name: string;
	cpuPercent: number;
	memoryUsage: number;
	memoryLimit: number;
	memoryPercent: number;
}

export interface HostInfo {
	hostname: string;
	ipAddress: string;
	platform: string;
	arch: string;
	cpus: number;
	totalMemory: number;
	freeMemory: number;
	uptime: number;
	dockerVersion: string;
	dockerContainers: number;
	dockerContainersRunning: number;
	dockerImages: number;
}

export interface HostMetric {
	cpu_percent: number;
	memory_percent: number;
	memory_used: number;
	memory_total: number;
	timestamp: string;
}

// Historical data settings
const MAX_HISTORY = 60; // 10 minutes at 10s intervals (server collects every 10s)
const POLL_INTERVAL = 5000; // 5 seconds

// Stores
export const cpuHistory = writable<number[]>([]);
export const memoryHistory = writable<number[]>([]);
export const containerStats = writable<ContainerStats[]>([]);
export const hostInfo = writable<HostInfo | null>(null);
export const lastUpdated = writable<Date>(new Date());
export const isCollecting = writable<boolean>(false);

let pollInterval: ReturnType<typeof setInterval> | null = null;
let envId: number | null = null;
let initialFetchDone = false;

// Subscribe to environment changes
currentEnvironment.subscribe((env) => {
	envId = env?.id ?? null;
	// Reset history when environment changes
	if (initialFetchDone) {
		cpuHistory.set([]);
		memoryHistory.set([]);
		initialFetchDone = false;
	}
});

// Helper for fetch with timeout
async function fetchWithTimeout(url: string, timeout = 5000): Promise<any> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeoutId);
		return response.json();
	} catch {
		clearTimeout(timeoutId);
		return null;
	}
}

async function fetchStats() {
	// Don't fetch if no environment is selected
	if (!envId) return;

	// Fire all fetches independently - don't block on slow ones
	fetchWithTimeout(appendEnvParam('/api/containers/stats?limit=5', envId), 5000).then(data => {
		if (Array.isArray(data)) {
			containerStats.set(data);
		}
	});

	fetchWithTimeout(appendEnvParam('/api/host', envId), 5000).then(data => {
		if (data && !data.error) {
			hostInfo.set(data);
		}
	});

	fetchWithTimeout(appendEnvParam('/api/metrics?limit=60', envId), 5000).then(data => {
		if (data?.metrics && data.metrics.length > 0) {
			const metrics: HostMetric[] = data.metrics;
			const cpuValues = metrics.map(m => m.cpu_percent);
			const memValues = metrics.map(m => m.memory_percent);

			cpuHistory.set(cpuValues.slice(-MAX_HISTORY));
			memoryHistory.set(memValues.slice(-MAX_HISTORY));
			initialFetchDone = true;
		}
	});

	lastUpdated.set(new Date());
}

export function startStatsCollection() {
	if (pollInterval) return; // Already running

	isCollecting.set(true);
	fetchStats(); // Initial fetch
	pollInterval = setInterval(fetchStats, POLL_INTERVAL);
}

export function stopStatsCollection() {
	if (pollInterval) {
		clearInterval(pollInterval);
		pollInterval = null;
	}
	isCollecting.set(false);
}

// Get current values
export function getCurrentCpu(): number {
	const history = get(cpuHistory);
	return history.length > 0 ? history[history.length - 1] : 0;
}

export function getCurrentMemory(): number {
	const history = get(memoryHistory);
	return history.length > 0 ? history[history.length - 1] : 0;
}
