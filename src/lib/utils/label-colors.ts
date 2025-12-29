/**
 * Label color utilities for environment labels
 *
 * Provides consistent, deterministic color assignment based on label string hash.
 * Colors are from Tailwind's color palette for visual consistency.
 */

// Tailwind color palette - vibrant, distinguishable colors
const LABEL_COLORS = [
	'#ef4444', // red-500
	'#f97316', // orange-500
	'#eab308', // yellow-500
	'#22c55e', // green-500
	'#14b8a6', // teal-500
	'#3b82f6', // blue-500
	'#8b5cf6', // violet-500
	'#ec4899', // pink-500
	'#06b6d4', // cyan-500
	'#84cc16', // lime-500
	'#6366f1', // indigo-500
	'#d946ef' // fuchsia-500
];

// Lighter variants for backgrounds (with alpha)
const LABEL_BG_COLORS = [
	'rgba(239, 68, 68, 0.15)', // red
	'rgba(249, 115, 22, 0.15)', // orange
	'rgba(234, 179, 8, 0.15)', // yellow
	'rgba(34, 197, 94, 0.15)', // green
	'rgba(20, 184, 166, 0.15)', // teal
	'rgba(59, 130, 246, 0.15)', // blue
	'rgba(139, 92, 246, 0.15)', // violet
	'rgba(236, 72, 153, 0.15)', // pink
	'rgba(6, 182, 212, 0.15)', // cyan
	'rgba(132, 204, 22, 0.15)', // lime
	'rgba(99, 102, 241, 0.15)', // indigo
	'rgba(217, 70, 239, 0.15)' // fuchsia
];

/**
 * Generate a hash from a string for consistent color assignment
 */
function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash);
}

/**
 * Get the primary color for a label (for text/borders)
 */
export function getLabelColor(label: string): string {
	const index = hashString(label) % LABEL_COLORS.length;
	return LABEL_COLORS[index];
}

/**
 * Get the background color for a label (lighter, with transparency)
 */
export function getLabelBgColor(label: string): string {
	const index = hashString(label) % LABEL_BG_COLORS.length;
	return LABEL_BG_COLORS[index];
}

/**
 * Get both colors for a label as an object
 */
export function getLabelColors(label: string): { color: string; bgColor: string } {
	const index = hashString(label) % LABEL_COLORS.length;
	return {
		color: LABEL_COLORS[index],
		bgColor: LABEL_BG_COLORS[index]
	};
}

/**
 * Maximum number of labels allowed per environment
 */
export const MAX_LABELS = 10;

/**
 * Parse labels from JSON string or array (handles both database and API formats)
 */
export function parseLabels(labels: string | string[] | null | undefined): string[] {
	if (!labels) return [];
	// Already an array - return as-is
	if (Array.isArray(labels)) return labels;
	// JSON string from database
	try {
		const parsed = JSON.parse(labels);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/**
 * Serialize labels to JSON string for database storage
 */
export function serializeLabels(labels: string[]): string | null {
	if (!labels || labels.length === 0) return null;
	return JSON.stringify(labels);
}
