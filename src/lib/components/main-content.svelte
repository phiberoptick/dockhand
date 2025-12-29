<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<main class="bg-background flex w-full flex-1 flex-col min-w-0">
	{@render children?.()}
</main>
