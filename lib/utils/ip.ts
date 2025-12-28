/**
 * Convert IP address (with optional CIDR) to numeric value for sorting
 * e.g., "192.168.1.0/24" -> 3232235776, "10.0.0.1" -> 167772161
 */
export function ipToNumber(ip: string | undefined | null): number {
	if (!ip || ip === '-') return Infinity; // Push empty IPs to the end
	// Strip CIDR notation if present
	const ipOnly = ip.split('/')[0];
	const parts = ipOnly.split('.');
	if (parts.length !== 4) return Infinity;
	return parts.reduce((acc, octet) => {
		const num = parseInt(octet, 10);
		return isNaN(num) ? Infinity : (acc << 8) + num;
	}, 0) >>> 0; // Convert to unsigned 32-bit
}
