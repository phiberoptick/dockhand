<script lang="ts">
	/**
	 * ToggleSwitch - A pill-style toggle for switching between two custom values.
	 * Unlike TogglePill which shows On/Off with check icons, this shows both options
	 * side by side with one highlighted, perfect for settings like "12h / 24h".
	 */
	interface Props {
		value: string;
		leftValue: string;
		rightValue: string;
		leftLabel?: string;
		rightLabel?: string;
		disabled?: boolean;
		onchange?: (value: string) => void;
	}

	let {
		value = $bindable(),
		leftValue,
		rightValue,
		leftLabel,
		rightLabel,
		disabled = false,
		onchange
	}: Props = $props();

	// Use labels if provided, otherwise use values
	const displayLeft = $derived(leftLabel ?? leftValue);
	const displayRight = $derived(rightLabel ?? rightValue);

	function selectLeft() {
		if (disabled || value === leftValue) return;
		value = leftValue;
		onchange?.(value);
	}

	function selectRight() {
		if (disabled || value === rightValue) return;
		value = rightValue;
		onchange?.(value);
	}
</script>

<div
	class="inline-flex items-center rounded-md bg-muted p-0.5 text-xs font-medium {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
>
	<button
		type="button"
		class="px-2 py-1 rounded transition-colors {value === leftValue
			? 'bg-slate-300 text-slate-900 shadow-sm dark:bg-amber-900/50 dark:text-amber-100'
			: 'text-muted-foreground hover:text-foreground'} {disabled ? 'cursor-not-allowed' : ''}"
		onclick={selectLeft}
		{disabled}
	>
		{displayLeft}
	</button>
	<button
		type="button"
		class="px-2 py-1 rounded transition-colors {value === rightValue
			? 'bg-slate-300 text-slate-900 shadow-sm dark:bg-amber-900/50 dark:text-amber-100'
			: 'text-muted-foreground hover:text-foreground'} {disabled ? 'cursor-not-allowed' : ''}"
		onclick={selectRight}
		{disabled}
	>
		{displayRight}
	</button>
</div>
