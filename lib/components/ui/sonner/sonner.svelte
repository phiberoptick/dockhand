<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";
	import { onMount } from "svelte";

	let { ...restProps }: SonnerProps = $props();

	let theme = $state<"light" | "dark">("light");

	onMount(() => {
		// Get initial theme from localStorage or detect from class
		const updateTheme = () => {
			const isDark = document.documentElement.classList.contains("dark");
			theme = isDark ? "dark" : "light";
		};

		updateTheme();

		// Watch for class changes on documentElement (theme toggle)
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.attributeName === "class") {
					updateTheme();
				}
			}
		});

		observer.observe(document.documentElement, { attributes: true });

		return () => observer.disconnect();
	});
</script>

<Sonner
	{theme}
	class="toaster group"
	style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
	{...restProps}
/>
