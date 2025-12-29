<script lang="ts">
	import { onMount } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import CodeEditor, { type VariableMarker } from '$lib/components/CodeEditor.svelte';
	import StackEnvVarsPanel from '$lib/components/StackEnvVarsPanel.svelte';
	import { type EnvVar, type ValidationResult } from '$lib/components/StackEnvVarsEditor.svelte';
	import { Layers, Save, Play, Code, GitGraph, Loader2, AlertCircle, X, Sun, Moon, TriangleAlert, ChevronsLeft, ChevronsRight, Variable } from 'lucide-svelte';
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';
	import { focusFirstInput } from '$lib/utils';
	import * as Alert from '$lib/components/ui/alert';
	import ComposeGraphViewer from './ComposeGraphViewer.svelte';

	interface Props {
		open: boolean;
		mode: 'create' | 'edit';
		stackName?: string; // Required for edit mode, optional for create
		onClose: () => void;
		onSuccess: () => void; // Called after create or save
	}

	let { open = $bindable(), mode, stackName = '', onClose, onSuccess }: Props = $props();

	// Form state
	let newStackName = $state('');
	let loading = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let loadError = $state<string | null>(null);
	let errors = $state<{ stackName?: string; compose?: string }>({});
	let composeContent = $state('');
	let originalContent = $state('');
	let activeTab = $state<'editor' | 'graph'>('editor');
	let showConfirmClose = $state(false);
	let editorTheme = $state<'light' | 'dark'>('dark');

	// Environment variables state
	let envVars = $state<EnvVar[]>([]);
	let originalEnvVars = $state<EnvVar[]>([]);
	let envValidation = $state<ValidationResult | null>(null);
	let validating = $state(false);
	let existingSecretKeys = $state<Set<string>>(new Set());

	// CodeEditor reference for explicit marker updates
	let codeEditorRef: CodeEditor | null = $state(null);

	// ComposeGraphViewer reference for resize on panel toggle
	let graphViewerRef: ComposeGraphViewer | null = $state(null);

	// Debounce timer for validation
	let validateTimer: ReturnType<typeof setTimeout> | null = null;

	const defaultCompose = `version: "3.8"

services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
    environment:
      - APP_ENV=\${APP_ENV:-production}
    volumes:
      - ./html:/usr/share/nginx/html:ro
    restart: unless-stopped

# Add more services as needed
# networks:
#   default:
#     driver: bridge
`;

	// Count of defined environment variables (with non-empty keys)
	const envVarCount = $derived(envVars.filter(v => v.key.trim()).length);

	// Build a lookup map from envVars for quick access
	const envVarMap = $derived.by(() => {
		const map = new Map<string, { value: string; isSecret: boolean }>();
		for (const v of envVars) {
			if (v.key.trim()) {
				map.set(v.key.trim(), { value: v.value, isSecret: v.isSecret });
			}
		}
		return map;
	});

	// Compute variable markers for the code editor (with values for overlay)
	const variableMarkers = $derived.by<VariableMarker[]>(() => {
		if (!envValidation) return [];

		const markers: VariableMarker[] = [];

		// Add missing required variables
		for (const name of envValidation.missing) {
			const env = envVarMap.get(name);
			markers.push({
				name,
				type: 'missing',
				value: env?.value,
				isSecret: env?.isSecret
			});
		}

		// Add defined required variables
		for (const name of envValidation.required) {
			if (!envValidation.missing.includes(name)) {
				const env = envVarMap.get(name);
				markers.push({
					name,
					type: 'required',
					value: env?.value,
					isSecret: env?.isSecret
				});
			}
		}

		// Add optional variables
		for (const name of envValidation.optional) {
			const env = envVarMap.get(name);
			markers.push({
				name,
				type: 'optional',
				value: env?.value,
				isSecret: env?.isSecret
			});
		}

		return markers;
	});

	// Check for compose changes
	const hasComposeChanges = $derived(composeContent !== originalContent);

	// Stable callback for compose content changes - avoids stale closure issues
	function handleComposeChange(value: string) {
		composeContent = value;
		debouncedValidate();
	}

	// Debounced validation to avoid too many API calls while typing
	function debouncedValidate() {
		if (validateTimer) clearTimeout(validateTimer);
		validateTimer = setTimeout(() => {
			validateEnvVars();
		}, 500);
	}

	// Explicitly push markers to the editor
	function updateEditorMarkers() {
		if (!codeEditorRef) return;
		codeEditorRef.updateVariableMarkers(variableMarkers);
	}

	// Check for env var changes (compare by serializing)
	const hasEnvVarChanges = $derived.by(() => {
		const current = JSON.stringify(envVars.filter(v => v.key));
		const original = JSON.stringify(originalEnvVars);
		return current !== original;
	});

	const hasChanges = $derived(hasComposeChanges || hasEnvVarChanges);

	// Display title
	const displayName = $derived(mode === 'edit' ? stackName : (newStackName || 'New stack'));

	onMount(() => {
		// Follow app theme from localStorage
		const appTheme = localStorage.getItem('theme');
		if (appTheme === 'dark' || appTheme === 'light') {
			editorTheme = appTheme;
		} else {
			// Fallback to system preference
			editorTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
	});

	async function loadComposeFile() {
		if (mode !== 'edit' || !stackName) return;

		loading = true;
		loadError = null;
		error = null;

		try {
			const envId = $currentEnvironment?.id ?? null;

			// Load compose file
			const response = await fetch(`/api/stacks/${encodeURIComponent(stackName)}/compose`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to load compose file');
			}

			composeContent = data.content;
			originalContent = data.content;

			// Load environment variables
			const envResponse = await fetch(appendEnvParam(`/api/stacks/${encodeURIComponent(stackName)}/env`, envId));
			if (envResponse.ok) {
				const envData = await envResponse.json();
				envVars = envData.variables || [];
				originalEnvVars = JSON.parse(JSON.stringify(envData.variables || []));
				// Track existing secret keys (secrets loaded from DB cannot have visibility toggled)
				existingSecretKeys = new Set(
					envVars.filter(v => v.isSecret && v.key.trim()).map(v => v.key.trim())
				);
			}
		} catch (e: any) {
			loadError = e.message;
		} finally {
			loading = false;
		}
	}

	async function validateEnvVars() {
		const content = composeContent || defaultCompose;
		if (!content.trim()) return;

		validating = true;
		try {
			const envId = $currentEnvironment?.id ?? null;
			// Use 'new' as placeholder stack name for new stacks
			const stackNameForValidation = mode === 'edit' ? stackName : (newStackName.trim() || 'new');
			// Pass current UI env vars for validation
			const currentVars = envVars.filter(v => v.key.trim()).map(v => v.key.trim());
			const response = await fetch(appendEnvParam(`/api/stacks/${encodeURIComponent(stackNameForValidation)}/env/validate`, envId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ compose: content, variables: currentVars })
			});

			if (response.ok) {
				envValidation = await response.json();
				// Explicitly update markers in the editor after validation
				// Use setTimeout to ensure derived variableMarkers has updated
				setTimeout(() => updateEditorMarkers(), 0);
			}
		} catch (e) {
			console.error('Failed to validate env vars:', e);
		} finally {
			validating = false;
		}
	}

	function toggleEditorTheme() {
		editorTheme = editorTheme === 'light' ? 'dark' : 'light';
		localStorage.setItem('dockhand-editor-theme', editorTheme);
	}

	function handleGraphContentChange(newContent: string) {
		composeContent = newContent;
	}

	async function handleCreate(start: boolean = false) {
		errors = {};
		let hasErrors = false;

		if (!newStackName.trim()) {
			errors.stackName = 'Stack name is required';
			hasErrors = true;
		}

		const content = composeContent || defaultCompose;
		if (!content.trim()) {
			errors.compose = 'Compose file content is required';
			hasErrors = true;
		}

		if (hasErrors) return;

		saving = true;
		error = null;

		try {
			const envId = $currentEnvironment?.id ?? null;

			// Create the stack
			const response = await fetch(appendEnvParam('/api/stacks', envId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newStackName.trim(),
					compose: content,
					start
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to create stack');
			}

			// Save environment variables if any are defined
			const definedVars = envVars.filter(v => v.key.trim());
			if (definedVars.length > 0) {
				const envResponse = await fetch(appendEnvParam(`/api/stacks/${encodeURIComponent(newStackName.trim())}/env`, envId), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						variables: definedVars.map(v => ({
							key: v.key.trim(),
							value: v.value,
							isSecret: v.isSecret
						}))
					})
				});

				if (!envResponse.ok) {
					console.error('Failed to save environment variables');
				}
			}

			onSuccess();
			handleClose();
		} catch (e: any) {
			error = e.message;
		} finally {
			saving = false;
		}
	}

	async function handleSave(restart = false) {
		errors = {};

		if (!composeContent.trim()) {
			errors.compose = 'Compose file content cannot be empty';
			return;
		}

		saving = true;
		error = null;

		try {
			const envId = $currentEnvironment?.id ?? null;

			// Save compose file
			const response = await fetch(
				appendEnvParam(`/api/stacks/${encodeURIComponent(stackName)}/compose`, envId),
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						content: composeContent,
						restart
					})
				}
			);

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to save compose file');
			}

			// Save environment variables if any are defined
			const definedVars = envVars.filter(v => v.key.trim());
			if (definedVars.length > 0 || originalEnvVars.length > 0) {
				const envResponse = await fetch(
					appendEnvParam(`/api/stacks/${encodeURIComponent(stackName)}/env`, envId),
					{
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							variables: definedVars.map(v => ({
								key: v.key.trim(),
								value: v.value,
								isSecret: v.isSecret
							}))
						})
					}
				);

				if (!envResponse.ok) {
					console.error('Failed to save environment variables');
				}
			}

			originalContent = composeContent;
			originalEnvVars = JSON.parse(JSON.stringify(definedVars));
			onSuccess();

			if (!restart) {
				// Show success briefly then close
				setTimeout(() => handleClose(), 500);
			} else {
				handleClose();
			}
		} catch (e: any) {
			error = e.message;
		} finally {
			saving = false;
		}
	}

	function tryClose() {
		if (hasChanges) {
			showConfirmClose = true;
		} else {
			handleClose();
		}
	}

	function handleClose() {
		// Clear any pending validation timer
		if (validateTimer) {
			clearTimeout(validateTimer);
			validateTimer = null;
		}
		// Reset all state
		newStackName = '';
		error = null;
		loadError = null;
		errors = {};
		composeContent = '';
		originalContent = '';
		envVars = [];
		originalEnvVars = [];
		envValidation = null;
		existingSecretKeys = new Set();
		activeTab = 'editor';
		showConfirmClose = false;
		codeEditorRef = null;
		onClose();
	}

	function discardAndClose() {
		showConfirmClose = false;
		handleClose();
	}

	// Initialize when dialog opens - ONLY ONCE per open
	let hasInitialized = $state(false);
	$effect(() => {
		if (open && !hasInitialized) {
			hasInitialized = true;
			if (mode === 'edit' && stackName) {
				loadComposeFile().then(() => {
					// Auto-validate after loading
					validateEnvVars();
				});
			} else if (mode === 'create') {
				// Set default compose content for create mode
				composeContent = defaultCompose;
				originalContent = defaultCompose; // Track original for change detection
				loading = false;
				// Auto-validate default compose
				validateEnvVars();
			}
		} else if (!open) {
			hasInitialized = false; // Reset when modal closes
		}
	});

	// Re-validate when envVars change (adding/removing variables affects missing/defined status)
	$effect(() => {
		// Track envVars changes (this triggers on any modification to envVars array)
		const vars = envVars;
		if (!open || !envValidation) return;

		// Debounce to avoid too many API calls while typing
		const timeout = setTimeout(() => {
			validateEnvVars();
		}, 300);

		return () => clearTimeout(timeout);
	});
</script>

<Dialog.Root
	bind:open
	onOpenChange={(isOpen) => {
		if (isOpen) {
			focusFirstInput();
		} else {
			// Prevent closing if there are unsaved changes - show confirmation instead
			if (hasChanges) {
				// Re-open the dialog and show confirmation
				open = true;
				showConfirmClose = true;
			}
			// If no changes, let it close naturally
		}
	}}
>
	<Dialog.Content class="max-w-7xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0 shadow-xl border-zinc-200 dark:border-zinc-700" showCloseButton={false}>
		<Dialog.Header class="px-5 py-3 border-b border-zinc-200 dark:border-zinc-700 flex-shrink-0 bg-zinc-50 dark:bg-zinc-800">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="flex items-center gap-2">
						<div class="p-1.5 rounded-md bg-zinc-200 dark:bg-zinc-700">
							<Layers class="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
						</div>
						<div>
							<Dialog.Title class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
								{#if mode === 'create'}
									Create compose stack
								{:else}
									{stackName}
								{/if}
							</Dialog.Title>
							<Dialog.Description class="text-xs text-zinc-500 dark:text-zinc-400">
								{#if mode === 'create'}
									Create a new Docker Compose stack
								{:else}
									Edit compose file and view stack structure
								{/if}
							</Dialog.Description>
						</div>
					</div>

					<!-- View toggle -->
					<div class="flex items-center gap-0.5 bg-zinc-200 dark:bg-zinc-700 rounded-md p-0.5 ml-3">
						<button
							class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors {activeTab === 'editor' ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}"
							onclick={() => activeTab = 'editor'}
						>
							<Code class="w-3.5 h-3.5" />
							Editor
						</button>
						<button
							class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors {activeTab === 'graph' ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}"
							onclick={() => activeTab = 'graph'}
						>
							<GitGraph class="w-3.5 h-3.5" />
							Graph
						</button>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<!-- Theme toggle (only in editor mode) -->
					{#if activeTab === 'editor'}
						<button
							onclick={toggleEditorTheme}
							class="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
							title={editorTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
						>
							{#if editorTheme === 'light'}
								<Moon class="w-4 h-4" />
							{:else}
								<Sun class="w-4 h-4" />
							{/if}
						</button>
					{/if}

					<!-- Close button -->
					<button
						onclick={tryClose}
						class="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
					>
						<X class="w-4 h-4" />
					</button>
				</div>
			</div>
		</Dialog.Header>

		<div class="flex-1 overflow-hidden flex flex-col min-h-0">
			{#if error}
				<Alert.Root variant="destructive" class="mx-6 mt-4">
					<TriangleAlert class="h-4 w-4" />
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if errors.compose}
				<Alert.Root variant="destructive" class="mx-6 mt-4">
					<TriangleAlert class="h-4 w-4" />
					<Alert.Description>{errors.compose}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if mode === 'edit' && loading}
				<div class="flex-1 flex items-center justify-center">
					<div class="flex items-center gap-3 text-zinc-400 dark:text-zinc-500">
						<Loader2 class="w-5 h-5 animate-spin" />
						<span>Loading compose file...</span>
					</div>
				</div>
			{:else if mode === 'edit' && loadError}
				<div class="flex-1 flex items-center justify-center p-6">
					<div class="text-center max-w-md">
						<div class="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
							<AlertCircle class="w-6 h-6 text-amber-400" />
						</div>
						<h3 class="text-lg font-medium mb-2">Could not load compose file</h3>
						<p class="text-sm text-zinc-400 dark:text-zinc-500 mb-4">{loadError}</p>
						<p class="text-xs text-zinc-500 dark:text-zinc-400">
							This stack may have been created outside of Dockhand or the compose file may have been moved.
						</p>
					</div>
				</div>
			{:else}
				<!-- Stack name input (create mode only) -->
				{#if mode === 'create'}
					<div class="px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
						<div class="max-w-md space-y-1">
							<Label for="stack-name">Stack name</Label>
							<Input
								id="stack-name"
								bind:value={newStackName}
								placeholder="my-stack"
								class={errors.stackName ? 'border-destructive focus-visible:ring-destructive' : ''}
								oninput={() => errors.stackName = undefined}
							/>
							{#if errors.stackName}
								<p class="text-xs text-destructive">{errors.stackName}</p>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Content area -->
				<div class="flex-1 min-h-0 flex">
					{#if activeTab === 'editor'}
						<!-- Editor tab: Code editor + Env panel side by side -->
						<div class="w-[60%] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-700 flex flex-col min-w-0">
							{#if open}
								<div class="flex-1 p-3 min-h-0">
									<CodeEditor
										bind:this={codeEditorRef}
										value={composeContent}
										language="yaml"
										theme={editorTheme}
										onchange={handleComposeChange}
										variableMarkers={variableMarkers}
										class="h-full rounded-md overflow-hidden border border-zinc-200 dark:border-zinc-700"
									/>
								</div>
							{/if}
						</div>
						<!-- Environment variables panel -->
						<div class="flex-1 min-w-0 flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-800/50">
							<div class="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300">
								<Variable class="w-3.5 h-3.5" />
								Environment variables
							</div>
							<div class="flex-1 min-h-0 overflow-hidden">
								<StackEnvVarsPanel
									bind:variables={envVars}
									validation={envValidation}
									existingSecretKeys={mode === 'edit' ? existingSecretKeys : new Set()}
									onchange={() => validateEnvVars()}
								/>
							</div>
						</div>
					{:else if activeTab === 'graph'}
						<!-- Graph tab: Full width -->
						<ComposeGraphViewer
							bind:this={graphViewerRef}
							composeContent={composeContent || defaultCompose}
							class="h-full flex-1"
							onContentChange={handleGraphContentChange}
						/>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Footer -->
		<div class="px-5 py-2.5 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between flex-shrink-0 bg-zinc-50 dark:bg-zinc-800">
			<div class="text-xs text-zinc-500 dark:text-zinc-400">
				{#if hasChanges}
					<span class="text-amber-600 dark:text-amber-500">Unsaved changes</span>
				{:else}
					No changes
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<Button variant="outline" onclick={tryClose} disabled={saving}>
					Cancel
				</Button>

				{#if mode === 'create'}
					<!-- Create mode buttons -->
					<Button variant="outline" onclick={() => handleCreate(false)} disabled={saving}>
						{#if saving}
							<Loader2 class="w-4 h-4 mr-2 animate-spin" />
							Creating...
						{:else}
							<Save class="w-4 h-4 mr-2" />
							Create
						{/if}
					</Button>
					<Button onclick={() => handleCreate(true)} disabled={saving}>
						{#if saving}
							<Loader2 class="w-4 h-4 mr-2 animate-spin" />
							Starting...
						{:else}
							<Play class="w-4 h-4 mr-2" />
							Create & Start
						{/if}
					</Button>
				{:else}
					<!-- Edit mode buttons -->
					<Button variant="outline" onclick={() => handleSave(false)} disabled={saving || !hasChanges || loading || !!loadError}>
						{#if saving}
							<Loader2 class="w-4 h-4 mr-2 animate-spin" />
							Saving...
						{:else}
							<Save class="w-4 h-4 mr-2" />
							Save
						{/if}
					</Button>
					<Button onclick={() => handleSave(true)} disabled={saving || !hasChanges || loading || !!loadError}>
						{#if saving}
							<Loader2 class="w-4 h-4 mr-2 animate-spin" />
							Applying...
						{:else}
							<Play class="w-4 h-4 mr-2" />
							Save & apply
						{/if}
					</Button>
				{/if}
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>

<!-- Unsaved changes confirmation dialog -->
<Dialog.Root bind:open={showConfirmClose}>
	<Dialog.Content class="max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Unsaved changes</Dialog.Title>
			<Dialog.Description>
				You have unsaved changes. Are you sure you want to close without saving?
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex justify-end gap-1.5 mt-4">
			<Button variant="outline" size="sm" onclick={() => showConfirmClose = false}>
				Continue editing
			</Button>
			<Button variant="destructive" size="sm" onclick={discardAndClose}>
				Discard changes
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
