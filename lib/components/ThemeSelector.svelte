<script lang="ts">
	import { Sun, Moon, Type, AArrowUp, Table, Terminal } from 'lucide-svelte';
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';
	import { lightThemes, darkThemes, fonts, monospaceFonts } from '$lib/themes';
	import { themeStore, applyTheme, type FontSize } from '$lib/stores/theme';

	// Font size options
	const fontSizes: { id: FontSize; name: string }[] = [
		{ id: 'xsmall', name: 'Extra Small' },
		{ id: 'small', name: 'Small' },
		{ id: 'normal', name: 'Normal' },
		{ id: 'medium', name: 'Medium' },
		{ id: 'large', name: 'Large' },
		{ id: 'xlarge', name: 'Extra Large' }
	];

	interface Props {
		userId?: number; // Pass userId for per-user settings, undefined for global
	}

	let { userId }: Props = $props();

	// Local state bound to selects
	let selectedLightTheme = $state($themeStore.lightTheme);
	let selectedDarkTheme = $state($themeStore.darkTheme);
	let selectedFont = $state($themeStore.font);
	let selectedFontSize = $state($themeStore.fontSize);
	let selectedGridFontSize = $state($themeStore.gridFontSize);
	let selectedTerminalFont = $state($themeStore.terminalFont);

	// Sync local state with store changes
	$effect(() => {
		selectedLightTheme = $themeStore.lightTheme;
		selectedDarkTheme = $themeStore.darkTheme;
		selectedFont = $themeStore.font;
		selectedFontSize = $themeStore.fontSize;
		selectedGridFontSize = $themeStore.gridFontSize;
		selectedTerminalFont = $themeStore.terminalFont;
	});

	async function handleLightThemeChange(value: string | undefined) {
		if (!value) return;
		selectedLightTheme = value;
		await themeStore.setPreference('lightTheme', value, userId);
	}

	async function handleDarkThemeChange(value: string | undefined) {
		if (!value) return;
		selectedDarkTheme = value;
		await themeStore.setPreference('darkTheme', value, userId);
	}

	async function handleFontChange(value: string | undefined) {
		if (!value) return;
		selectedFont = value;
		await themeStore.setPreference('font', value, userId);
	}

	async function handleFontSizeChange(value: string | undefined) {
		if (!value) return;
		selectedFontSize = value as FontSize;
		await themeStore.setPreference('fontSize', value as FontSize, userId);
	}

	async function handleGridFontSizeChange(value: string | undefined) {
		if (!value) return;
		selectedGridFontSize = value as FontSize;
		await themeStore.setPreference('gridFontSize', value as FontSize, userId);
	}

	async function handleTerminalFontChange(value: string | undefined) {
		if (!value) return;
		selectedTerminalFont = value;
		await themeStore.setPreference('terminalFont', value, userId);
	}
</script>

<div class="space-y-4">
	<!-- Light Theme -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Sun class="w-4 h-4 text-muted-foreground" />
			<Label>Light theme</Label>
		</div>
		<Select.Root type="single" value={selectedLightTheme} onValueChange={handleLightThemeChange}>
			<Select.Trigger class="w-56">
				<div class="flex items-center gap-2">
					{#each lightThemes as theme}
						{#if theme.id === selectedLightTheme}
							<span
								class="w-3 h-3 rounded-full border border-border"
								style="background-color: {theme.preview}"
							></span>
							<span>{theme.name}</span>
						{/if}
					{/each}
				</div>
			</Select.Trigger>
			<Select.Content>
				{#each lightThemes as theme}
					<Select.Item value={theme.id}>
						<div class="flex items-center gap-2">
							<span
								class="w-3 h-3 rounded-full border border-border"
								style="background-color: {theme.preview}"
							></span>
							<span>{theme.name}</span>
						</div>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<!-- Dark Theme -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Moon class="w-4 h-4 text-muted-foreground" />
			<Label>Dark theme</Label>
		</div>
		<Select.Root type="single" value={selectedDarkTheme} onValueChange={handleDarkThemeChange}>
			<Select.Trigger class="w-56">
				<div class="flex items-center gap-2">
					{#each darkThemes as theme}
						{#if theme.id === selectedDarkTheme}
							<span
								class="w-3 h-3 rounded-full border border-border"
								style="background-color: {theme.preview}"
							></span>
							<span>{theme.name}</span>
						{/if}
					{/each}
				</div>
			</Select.Trigger>
			<Select.Content>
				{#each darkThemes as theme}
					<Select.Item value={theme.id}>
						<div class="flex items-center gap-2">
							<span
								class="w-3 h-3 rounded-full border border-border"
								style="background-color: {theme.preview}"
							></span>
							<span>{theme.name}</span>
						</div>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<!-- Font -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Type class="w-4 h-4 text-muted-foreground" />
			<Label>Font</Label>
		</div>
		<Select.Root type="single" value={selectedFont} onValueChange={handleFontChange}>
			<Select.Trigger class="w-56">
				{#each fonts as font}
					{#if font.id === selectedFont}
						<span>{font.name}</span>
					{/if}
				{/each}
			</Select.Trigger>
			<Select.Content>
				{#each fonts as font}
					<Select.Item value={font.id}>
						<span style="font-family: {font.family}">{font.name}</span>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<!-- Font Size -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<AArrowUp class="w-4 h-4 text-muted-foreground" />
			<Label>Font size</Label>
		</div>
		<Select.Root type="single" value={selectedFontSize} onValueChange={handleFontSizeChange}>
			<Select.Trigger class="w-56">
				{#each fontSizes as size}
					{#if size.id === selectedFontSize}
						<span>{size.name}</span>
					{/if}
				{/each}
			</Select.Trigger>
			<Select.Content>
				{#each fontSizes as size}
					<Select.Item value={size.id}>
						<span>{size.name}</span>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<!-- Grid Font Size -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Table class="w-4 h-4 text-muted-foreground" />
			<Label>Grid font size</Label>
		</div>
		<Select.Root type="single" value={selectedGridFontSize} onValueChange={handleGridFontSizeChange}>
			<Select.Trigger class="w-56">
				{#each fontSizes as size}
					{#if size.id === selectedGridFontSize}
						<span>{size.name}</span>
					{/if}
				{/each}
			</Select.Trigger>
			<Select.Content>
				{#each fontSizes as size}
					<Select.Item value={size.id}>
						<span>{size.name}</span>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<!-- Terminal Font -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Terminal class="w-4 h-4 text-muted-foreground" />
			<Label>Terminal font</Label>
		</div>
		<Select.Root type="single" value={selectedTerminalFont} onValueChange={handleTerminalFontChange}>
			<Select.Trigger class="w-56">
				{#each monospaceFonts as font}
					{#if font.id === selectedTerminalFont}
						<span style="font-family: {font.family}">{font.name}</span>
					{/if}
				{/each}
			</Select.Trigger>
			<Select.Content>
				{#each monospaceFonts as font}
					<Select.Item value={font.id}>
						<span style="font-family: {font.family}">{font.name}</span>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
</div>
