<script lang="ts">
	import { authStore, canAccess } from '$lib/stores/auth';
	import type { Snippet } from 'svelte';

	interface Props {
		resource: string;
		action: string;
		children: Snippet;
		fallback?: Snippet;
	}

	let { resource, action, children, fallback }: Props = $props();

	// Check if user can access the resource/action
	const hasAccess = $derived($canAccess(resource, action));
</script>

{#if hasAccess}
	{@render children()}
{:else if fallback}
	{@render fallback()}
{/if}
