<script lang="ts">
	import type { StepType } from '$lib/utils/update-steps';
	import { getStepIcon, getStepLabel, getStepColor } from '$lib/utils/update-steps';

	interface Props {
		step: StepType;
		isActive?: boolean;
		showLabel?: boolean;
	}

	let { step, isActive = false, showLabel = true }: Props = $props();

	const Icon = $derived(getStepIcon(step));
	const label = $derived(getStepLabel(step));
	const colorClass = $derived(getStepColor(step));
</script>

<div class="flex items-center gap-1.5">
	<svelte:component
		this={Icon}
		class="w-4 h-4 shrink-0 {colorClass} {isActive ? 'animate-spin' : ''}"
	/>
	{#if showLabel}
		<span class="text-xs {colorClass}">{label}</span>
	{/if}
</div>
