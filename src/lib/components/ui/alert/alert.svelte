<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const alertVariants = tv({
		base: "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
		variants: {
			variant: {
				default: "bg-card text-card-foreground",
				destructive:
					"text-destructive bg-destructive/10 border-destructive/20 *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current",
				warning:
					"text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/20 *:data-[slot=alert-description]:text-amber-600 dark:*:data-[slot=alert-description]:text-amber-400/90 [&>svg]:text-current",
				success:
					"text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/20 *:data-[slot=alert-description]:text-green-600 dark:*:data-[slot=alert-description]:text-green-400/90 [&>svg]:text-current",
				info:
					"text-blue-700 dark:text-blue-400 bg-blue-500/10 border-blue-500/20 *:data-[slot=alert-description]:text-blue-600 dark:*:data-[slot=alert-description]:text-blue-400/90 [&>svg]:text-current",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	});

	export type AlertVariant = VariantProps<typeof alertVariants>["variant"];
</script>

<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: AlertVariant;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert"
	class={cn(alertVariants({ variant }), className)}
	{...restProps}
	role="alert"
>
	{@render children?.()}
</div>
