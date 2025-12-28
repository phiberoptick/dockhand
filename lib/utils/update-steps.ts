/**
 * Shared utilities for update step visualization across:
 * - BatchUpdateModal (manual update from containers grid)
 * - Scheduled container auto-updates
 * - Scheduled environment update checks
 */

import {
	Download,
	Shield,
	Square,
	Trash2,
	Box,
	Play,
	CheckCircle2,
	XCircle,
	ShieldBan,
	Circle,
	Loader2,
	ShieldAlert,
	ShieldCheck,
	ShieldOff,
	ShieldX
} from 'lucide-svelte';
import type { ComponentType } from 'svelte';
import type { VulnerabilityCriteria } from '$lib/server/db';

// Step types for update process
export type StepType =
	| 'pulling'
	| 'scanning'
	| 'stopping'
	| 'removing'
	| 'creating'
	| 'starting'
	| 'done'
	| 'failed'
	| 'blocked'
	| 'checked'
	| 'skipped'
	| 'updated';

// Get icon component for a step
export function getStepIcon(step: StepType): ComponentType {
	switch (step) {
		case 'pulling':
			return Download;
		case 'scanning':
			return Shield;
		case 'stopping':
			return Square;
		case 'removing':
			return Trash2;
		case 'creating':
			return Box;
		case 'starting':
			return Play;
		case 'done':
		case 'updated':
			return CheckCircle2;
		case 'failed':
			return XCircle;
		case 'blocked':
			return ShieldBan;
		case 'checked':
		case 'skipped':
			return Circle;
		default:
			return Loader2;
	}
}

// Get human-readable label for a step
export function getStepLabel(step: StepType): string {
	switch (step) {
		case 'pulling':
			return 'Pulling image';
		case 'scanning':
			return 'Scanning for vulnerabilities';
		case 'stopping':
			return 'Stopping';
		case 'removing':
			return 'Removing';
		case 'creating':
			return 'Creating';
		case 'starting':
			return 'Starting';
		case 'done':
			return 'Done';
		case 'updated':
			return 'Updated';
		case 'failed':
			return 'Failed';
		case 'blocked':
			return 'Blocked by vulnerabilities';
		case 'checked':
			return 'Checked';
		case 'skipped':
			return 'Up-to-date';
		default:
			return step;
	}
}

// Get color classes for a step
export function getStepColor(step: StepType): string {
	switch (step) {
		case 'done':
		case 'updated':
			return 'text-green-600 dark:text-green-400';
		case 'failed':
			return 'text-red-600 dark:text-red-400';
		case 'blocked':
			return 'text-amber-600 dark:text-amber-400';
		case 'scanning':
			return 'text-purple-600 dark:text-purple-400';
		case 'checked':
		case 'skipped':
			return 'text-muted-foreground';
		default:
			return 'text-blue-600 dark:text-blue-400';
	}
}

// Vulnerability criteria labels
export const vulnerabilityCriteriaLabels: Record<VulnerabilityCriteria, string> = {
	never: 'Never block',
	any: 'Any vulnerability',
	critical_high: 'Critical or high',
	critical: 'Critical only',
	more_than_current: 'More than current image'
};

// Vulnerability criteria icons with colors and titles
export const vulnerabilityCriteriaIcons: Record<
	VulnerabilityCriteria,
	{ component: ComponentType; class: string; title: string }
> = {
	never: { component: ShieldOff, class: 'w-3.5 h-3.5 text-muted-foreground', title: 'No vulnerability blocking' },
	any: { component: ShieldAlert, class: 'w-3.5 h-3.5 text-amber-500', title: 'Block on any vulnerability' },
	critical_high: { component: ShieldX, class: 'w-3.5 h-3.5 text-orange-500', title: 'Block on critical or high' },
	critical: { component: ShieldX, class: 'w-3.5 h-3.5 text-red-500', title: 'Block on critical only' },
	more_than_current: { component: Shield, class: 'w-3.5 h-3.5 text-blue-500', title: 'Block if more than current' }
};

// Get badge variant based on criteria severity
export function getCriteriaBadgeClass(criteria: VulnerabilityCriteria): string {
	switch (criteria) {
		case 'any':
			return 'bg-red-500/10 text-red-600 border-red-500/30';
		case 'critical_high':
			return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
		case 'critical':
			return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
		case 'more_than_current':
			return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
		default:
			return 'bg-slate-500/10 text-slate-600 border-slate-500/30';
	}
}
