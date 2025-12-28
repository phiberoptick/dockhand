// Track server start time for uptime calculation
let serverStartTime: number | null = null;

export function setServerStartTime(): void {
	if (serverStartTime === null) {
		serverStartTime = Date.now();
	}
}

export function getServerUptime(): number {
	if (serverStartTime === null) {
		return 0;
	}
	return Math.floor((Date.now() - serverStartTime) / 1000);
}
