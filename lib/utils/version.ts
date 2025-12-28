/**
 * Compares two semantic version strings.
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
	const normalize = (v: string) =>
		v
			.replace(/^v/, '')
			.split('.')
			.map(Number);
	const parts1 = normalize(v1);
	const parts2 = normalize(v2);

	for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
		const p1 = parts1[i] || 0;
		const p2 = parts2[i] || 0;
		if (p1 > p2) return 1;
		if (p1 < p2) return -1;
	}
	return 0;
}

/**
 * Determines if the "What's New" popup should be shown.
 * @param currentVersion - The current app version (from git tag)
 * @param lastSeenVersion - The last version the user has seen (from localStorage)
 */
export function shouldShowWhatsNew(
	currentVersion: string | null,
	lastSeenVersion: string | null
): boolean {
	if (!currentVersion || currentVersion === 'unknown') return false;
	if (!lastSeenVersion) return true; // Never seen any version
	return compareVersions(currentVersion, lastSeenVersion) > 0;
}
