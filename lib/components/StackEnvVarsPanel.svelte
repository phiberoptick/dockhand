<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import StackEnvVarsEditor, { type EnvVar, type ValidationResult } from '$lib/components/StackEnvVarsEditor.svelte';
	import ConfirmPopover from '$lib/components/ConfirmPopover.svelte';
	import { Plus, Info, Upload, Trash2 } from 'lucide-svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	interface Props {
		variables: EnvVar[];
		validation?: ValidationResult | null;
		readonly?: boolean;
		showSource?: boolean;
		sources?: Record<string, 'file' | 'override'>;
		placeholder?: { key: string; value: string };
		infoText?: string;
		existingSecretKeys?: Set<string>;
		class?: string;
		onchange?: () => void;
	}

	let {
		variables = $bindable(),
		validation = null,
		readonly = false,
		showSource = false,
		sources = {},
		placeholder = { key: 'VARIABLE_NAME', value: 'value' },
		infoText,
		existingSecretKeys = new Set<string>(),
		class: className = '',
		onchange
	}: Props = $props();

	let fileInputRef: HTMLInputElement;

	function addEnvVariable() {
		variables = [...variables, { key: '', value: '', isSecret: false }];
	}

	function handleLoadFromFile() {
		fileInputRef?.click();
	}

	function parseEnvFile(content: string): EnvVar[] {
		const lines = content.split('\n');
		const envVars: EnvVar[] = [];

		for (const line of lines) {
			// Skip empty lines and comments
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;

			// Parse KEY=VALUE format
			const eqIndex = trimmed.indexOf('=');
			if (eqIndex === -1) continue;

			const key = trimmed.slice(0, eqIndex).trim();
			let value = trimmed.slice(eqIndex + 1).trim();

			// Remove surrounding quotes if present
			if ((value.startsWith('"') && value.endsWith('"')) ||
			    (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}

			if (key) {
				envVars.push({ key, value, isSecret: false });
			}
		}

		return envVars;
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			const parsedVars = parseEnvFile(content);

			if (parsedVars.length > 0) {
				// Get existing keys to avoid duplicates
				const existingKeys = new Set(variables.filter(v => v.key.trim()).map(v => v.key.trim()));

				// Filter empty entries from current variables
				const nonEmptyVars = variables.filter(v => v.key.trim());

				// Add new variables, updating existing ones or appending new
				for (const newVar of parsedVars) {
					if (existingKeys.has(newVar.key)) {
						// Update existing variable
						const idx = nonEmptyVars.findIndex(v => v.key.trim() === newVar.key);
						if (idx !== -1) {
							nonEmptyVars[idx] = { ...nonEmptyVars[idx], value: newVar.value };
						}
					} else {
						// Add new variable
						nonEmptyVars.push(newVar);
						existingKeys.add(newVar.key);
					}
				}

				variables = nonEmptyVars;
				// Notify parent of change (important for async file load)
				onchange?.();
			}
		};
		reader.readAsText(file);

		// Reset input so the same file can be selected again
		input.value = '';
	}

	function clearAllVariables() {
		variables = [];
	}

	// Count of non-empty variables
	const hasVariables = $derived(variables.some(v => v.key.trim()));
</script>

<div class="flex flex-col h-full {className}">
	<!-- Header -->
	<div class="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 flex flex-col gap-1.5">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span class="text-xs text-zinc-500 dark:text-zinc-400">Environment variables</span>
				{#if infoText}
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Info class="w-3.5 h-3.5 text-blue-400" />
						</Tooltip.Trigger>
						<Tooltip.Content class="max-w-md">
							<p class="text-xs">{infoText}</p>
						</Tooltip.Content>
					</Tooltip.Root>
				{/if}
			</div>
			{#if !readonly}
				<div class="flex items-center gap-1">
					<Button type="button" size="sm" variant="ghost" onclick={handleLoadFromFile} class="h-6 text-xs px-2">
						<Upload class="w-3.5 h-3.5 mr-1" />
						Load .env
					</Button>
					<Button type="button" size="sm" variant="ghost" onclick={addEnvVariable} class="h-6 text-xs px-2">
						<Plus class="w-3.5 h-3.5 mr-1" />
						Add
					</Button>
					{#if hasVariables}
						<ConfirmPopover
							title="Clear all variables"
							description="This will remove all environment variables. This cannot be undone."
							confirmText="Clear all"
							onConfirm={clearAllVariables}
						>
							<Button type="button" size="sm" variant="ghost" class="h-6 text-xs px-2 text-destructive hover:text-destructive">
								<Trash2 class="w-3.5 h-3.5 mr-1" />
								Clear
							</Button>
						</ConfirmPopover>
					{/if}
				</div>
				<input
					bind:this={fileInputRef}
					type="file"
					accept=".env,.env.*,text/plain"
					class="hidden"
					onchange={handleFileSelect}
				/>
			{/if}
		</div>
		<!-- Variable syntax help -->
		<div class="flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-zinc-400 dark:text-zinc-500 font-mono">
			<span><span class="text-zinc-500 dark:text-zinc-400">${`{VAR}`}</span> required</span>
			<span><span class="text-zinc-500 dark:text-zinc-400">${`{VAR:-default}`}</span> optional</span>
			<span><span class="text-zinc-500 dark:text-zinc-400">${`{VAR:?error}`}</span> required w/ error</span>
		</div>
		<!-- Validation status pills -->
		{#if validation}
			<div class="flex flex-wrap gap-1">
				{#if validation.missing.length > 0}
					<span class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
						{validation.missing.length} missing
					</span>
				{/if}
				{#if validation.required.length > 0}
					<span class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
						{validation.required.length - validation.missing.length} required
					</span>
				{/if}
				{#if validation.optional.length > 0}
					<span class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
						{validation.optional.length} optional
					</span>
				{/if}
				{#if validation.unused.length > 0}
					<span class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
						{validation.unused.length} unused
					</span>
				{/if}
			</div>
		{/if}
		<!-- Add missing variables -->
		{#if validation && validation.missing.length > 0 && !readonly}
			<div class="flex flex-wrap gap-1 items-center">
				<span class="text-xs text-muted-foreground mr-1">Add missing:</span>
				{#each validation.missing as missing}
					<button
						type="button"
						onclick={() => {
							variables = [...variables, { key: missing, value: '', isSecret: false }];
						}}
						class="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors"
					>
						{missing}
					</button>
				{/each}
			</div>
		{/if}
	</div>
	<!-- Variables list -->
	<div class="flex-1 overflow-auto px-4 py-3">
		<StackEnvVarsEditor
			bind:variables
			{validation}
			{readonly}
			{showSource}
			{sources}
			{placeholder}
			{existingSecretKeys}
		/>
	</div>
</div>
