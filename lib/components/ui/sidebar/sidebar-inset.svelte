<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";
	import { useSidebar } from "./context.svelte.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();

	const sidebar = useSidebar();

	let margin = $derived(sidebar.isMobile ? '0' : (sidebar.state === 'expanded' ? '10rem' : '2.75rem'));
</script>

<main
	bind:this={ref}
	data-slot="sidebar-inset"
	class={cn(
		"bg-background flex w-full flex-1 flex-col min-w-0 transition-[margin] duration-200 ease-linear",
		className
	)}
	style:margin-left={margin}
	{...restProps}
>
	{@render children?.()}
</main>
