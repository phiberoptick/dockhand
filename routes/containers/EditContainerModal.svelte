<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Plus, Trash2, Settings2, RefreshCw, Network, X, Ban, RotateCw, AlertTriangle, PauseCircle, Share2, Server, CircleOff, Pencil, Check, Loader2, CircleArrowUp, Info, Layers } from 'lucide-svelte';
	import { TogglePill } from '$lib/components/ui/toggle-pill';
	import { Badge } from '$lib/components/ui/badge';
	import { onMount } from 'svelte';
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';
	import { focusFirstInput } from '$lib/utils';
	import AutoUpdateSettings from './AutoUpdateSettings.svelte';

	// Parse shell command respecting quotes
	function parseShellCommand(cmd: string): string[] {
		const args: string[] = [];
		let current = '';
		let inQuotes = false;
		let quoteChar = '';

		for (let i = 0; i < cmd.length; i++) {
			const char = cmd[i];

			if ((char === '"' || char === "'") && !inQuotes) {
				inQuotes = true;
				quoteChar = char;
			} else if (char === quoteChar && inQuotes) {
				inQuotes = false;
				quoteChar = '';
			} else if (char === ' ' && !inQuotes) {
				if (current) {
					args.push(current);
					current = '';
				}
			} else {
				current += char;
			}
		}

		if (current) {
			args.push(current);
		}

		return args;
	}

	interface ConfigSet {
		id: number;
		name: string;
		description?: string;
		env_vars?: { key: string; value: string }[];
		labels?: { key: string; value: string }[];
		ports?: { hostPort: string; containerPort: string; protocol: string }[];
		volumes?: { hostPath: string; containerPath: string; mode: string }[];
		network_mode: string;
		restart_policy: string;
	}

	interface Props {
		open: boolean;
		containerId: string;
		onClose: () => void;
		onSuccess: () => void;
	}

	let { open = $bindable(), containerId, onClose, onSuccess }: Props = $props();

	// Config sets
	let configSets = $state<ConfigSet[]>([]);
	let selectedConfigSetId = $state<string>('');

	async function fetchConfigSets() {
		try {
			const response = await fetch('/api/config-sets');
			if (response.ok) {
				configSets = await response.json();
			}
		} catch (err) {
			console.error('Failed to fetch config sets:', err);
		}
	}

	function applyConfigSet(configSetId: string) {
		selectedConfigSetId = configSetId;
		if (!configSetId) return;

		const configSet = configSets.find((c) => c.id === parseInt(configSetId));
		if (!configSet) return;

		// Apply env vars (merge with existing)
		if (configSet.env_vars && configSet.env_vars.length > 0) {
			const existingKeys = new Set(envVars.map(e => e.key).filter(k => k));
			const newEnvVars = configSet.env_vars.filter(e => !existingKeys.has(e.key));
			envVars = [...envVars.filter(e => e.key), ...newEnvVars.map(e => ({ ...e }))];
			if (envVars.length === 0) envVars = [{ key: '', value: '' }];
		}

		// Apply labels (merge with existing)
		if (configSet.labels && configSet.labels.length > 0) {
			const existingKeys = new Set(labels.map(l => l.key).filter(k => k));
			const newLabels = configSet.labels.filter(l => !existingKeys.has(l.key));
			labels = [...labels.filter(l => l.key), ...newLabels.map(l => ({ ...l }))];
			if (labels.length === 0) labels = [{ key: '', value: '' }];
		}

		// Apply ports (merge with existing)
		if (configSet.ports && configSet.ports.length > 0) {
			const existingPorts = new Set(portMappings.map(p => `${p.hostPort}:${p.containerPort}`).filter(p => p !== ':'));
			const newPorts = configSet.ports.filter(p => !existingPorts.has(`${p.hostPort}:${p.containerPort}`));
			portMappings = [...portMappings.filter(p => p.hostPort || p.containerPort), ...newPorts.map(p => ({ ...p }))];
			if (portMappings.length === 0) portMappings = [{ hostPort: '', containerPort: '', protocol: 'tcp' }];
		}

		// Apply volumes (merge with existing)
		if (configSet.volumes && configSet.volumes.length > 0) {
			const existingPaths = new Set(volumeMappings.map(v => v.containerPath).filter(p => p));
			const newVolumes = configSet.volumes.filter(v => !existingPaths.has(v.containerPath));
			volumeMappings = [...volumeMappings.filter(v => v.hostPath || v.containerPath), ...newVolumes.map(v => ({ ...v }))];
			if (volumeMappings.length === 0) volumeMappings = [{ hostPath: '', containerPath: '', mode: 'rw' }];
		}

		// Apply network mode
		if (configSet.network_mode) {
			networkMode = configSet.network_mode;
		}

		// Apply restart policy
		if (configSet.restart_policy) {
			restartPolicy = configSet.restart_policy;
		}
	}

	// Form state
	let name = $state('');
	let image = $state('');
	let command = $state('');
	let restartPolicy = $state('no');
	let networkMode = $state('bridge');
	let startAfterUpdate = $state(true);

	// Port mappings
	let portMappings = $state<{ hostPort: string; containerPort: string; protocol: string }[]>([
		{ hostPort: '', containerPort: '', protocol: 'tcp' }
	]);

	// Volume mappings
	let volumeMappings = $state<{ hostPath: string; containerPath: string; mode: string }[]>([
		{ hostPath: '', containerPath: '', mode: 'rw' }
	]);

	// Environment variables
	let envVars = $state<{ key: string; value: string }[]>([{ key: '', value: '' }]);

	// Labels
	let labels = $state<{ key: string; value: string }[]>([{ key: '', value: '' }]);

	// Networks
	interface DockerNetwork {
		id: string;
		name: string;
		driver: string;
	}
	let availableNetworks = $state<DockerNetwork[]>([]);
	let selectedNetworks = $state<string[]>([]);

	// Auto-update settings
	let autoUpdateEnabled = $state(false);
	let autoUpdateCronExpression = $state('0 3 * * *');
	let vulnerabilityCriteria = $state<string>('never');
	let envHasScanning = $state(false);
	let currentEnvId = $state<number | null>(null);
	currentEnvironment.subscribe(env => currentEnvId = env?.id || null);

	// Track original values to detect changes
	let originalConfig = $state<{
		name: string;
		image: string;
		command: string;
		restartPolicy: string;
		networkMode: string;
		portMappings: typeof portMappings;
		volumeMappings: typeof volumeMappings;
		envVars: typeof envVars;
		labels: typeof labels;
		selectedNetworks: string[];
	} | null>(null);

	// Compose container detection
	let isComposeContainer = $state(false);
	let composeStackName = $state('');

	let originalAutoUpdate = $state<{
		enabled: boolean;
		cronExpression: string;
		vulnerabilityCriteria: string;
	} | null>(null);

	let loading = $state(false);
	let loadingData = $state(true);
	let error = $state('');
	let statusMessage = $state('');
	let visible = $state(false);

	// Field-specific errors for inline validation
	let errors = $state<{ name?: string; image?: string }>({});

	// Inline rename state (for title bar)
	let isEditingTitle = $state(false);
	let editTitleName = $state('');
	let renamingTitle = $state(false);

	async function fetchNetworks() {
		try {
			const envParam = currentEnvId ? `?env=${currentEnvId}` : '';
			const response = await fetch(`/api/networks${envParam}`);
			if (response.ok) {
				availableNetworks = await response.json();
			}
		} catch (err) {
			console.error('Failed to fetch networks:', err);
		}
	}

	// Inline title rename functions
	let titleInputRef: HTMLInputElement | null = null;

	function startEditingTitle() {
		editTitleName = name;
		isEditingTitle = true;
		// Focus after DOM updates
		setTimeout(() => {
			titleInputRef?.focus();
			titleInputRef?.select();
		}, 0);
	}

	function cancelEditingTitle() {
		isEditingTitle = false;
		editTitleName = '';
	}

	function saveEditingTitle() {
		if (!editTitleName.trim() || editTitleName === name) {
			cancelEditingTitle();
			return;
		}
		// Just update the local name state - the actual rename happens on form submit
		name = editTitleName.trim();
		isEditingTitle = false;
	}

	async function checkScannerSettings() {
		if (!currentEnvId) {
			envHasScanning = false;
			return;
		}
		try {
			const response = await fetch(`/api/settings/scanner?env=${currentEnvId}&settingsOnly=true`);
			if (response.ok) {
				const data = await response.json();
				// Scanner settings are nested under 'settings' key
				const settings = data.settings || data;
				envHasScanning = settings.scanner !== 'none';
			}
		} catch (err) {
			console.error('Failed to check scanner settings:', err);
			envHasScanning = false;
		}
	}

	async function fetchAutoUpdateSettings(containerName: string) {
		try {
			const envParam = currentEnvId ? `?env=${currentEnvId}` : '';
			const [autoUpdateResponse] = await Promise.all([
				fetch(`/api/auto-update/${encodeURIComponent(containerName)}${envParam}`),
				checkScannerSettings()
			]);
			if (autoUpdateResponse.ok) {
				const data = await autoUpdateResponse.json();
				autoUpdateEnabled = data.enabled || false;
				autoUpdateCronExpression = data.cronExpression || '0 3 * * *';
				vulnerabilityCriteria = data.vulnerabilityCriteria || 'never';
				// Store original auto-update settings
				originalAutoUpdate = {
					enabled: autoUpdateEnabled,
					cronExpression: autoUpdateCronExpression,
					vulnerabilityCriteria: vulnerabilityCriteria
				};
			}
		} catch (err) {
			console.error('Failed to fetch auto-update settings:', err);
		}
	}

	async function saveAutoUpdateSettings(containerName: string) {
		try {
			const envParam = currentEnvId ? `?env=${currentEnvId}` : '';
			await fetch(`/api/auto-update/${encodeURIComponent(containerName)}${envParam}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					enabled: autoUpdateEnabled,
					cronExpression: autoUpdateCronExpression,
					vulnerabilityCriteria: vulnerabilityCriteria
				})
			});
		} catch (err) {
			console.error('Failed to save auto-update settings:', err);
		}
	}

	async function loadContainerData() {
		loadingData = true;
		try {
			const response = await fetch(appendEnvParam(`/api/containers/${containerId}`, $currentEnvironment?.id));
			const data = await response.json();

			// Check if API returned an error
			if (!response.ok || data.error) {
				throw new Error(data.error || `Failed to fetch container: ${response.status}`);
			}

			// Parse container data
			name = data.Name.replace(/^\//, '');
			image = data.Config.Image;
			// Preserve command by quoting arguments that contain spaces
			command = data.Config.Cmd ? data.Config.Cmd.map((arg: string) =>
				arg.includes(' ') ? `"${arg}"` : arg
			).join(' ') : '';
			restartPolicy = data.HostConfig.RestartPolicy?.Name || 'no';

			// Normalize network mode - Docker returns custom network names as NetworkMode
			// but we only support bridge/host/none in the dropdown
			const rawNetworkMode = data.HostConfig.NetworkMode || 'bridge';
			if (['bridge', 'host', 'none', 'default'].includes(rawNetworkMode)) {
				networkMode = rawNetworkMode === 'default' ? 'bridge' : rawNetworkMode;
			} else {
				// Custom network - default to bridge mode (container is already connected via Networks)
				networkMode = 'bridge';
			}

			// Parse port mappings
			const ports = data.HostConfig.PortBindings || {};
			portMappings = Object.keys(ports).length > 0
				? Object.entries(ports).map(([containerPort, bindings]: [string, any]) => {
						const [port, protocol] = containerPort.split('/');
						return {
							containerPort: port,
							hostPort: bindings[0]?.HostPort || '',
							protocol: protocol || 'tcp'
						};
				  })
				: [{ hostPort: '', containerPort: '', protocol: 'tcp' }];

			// Parse volume mappings
			const binds = data.HostConfig.Binds || [];
			volumeMappings = binds.length > 0
				? binds.map((bind: string) => {
						const [hostPath, containerPath, mode] = bind.split(':');
						return {
							hostPath,
							containerPath,
							mode: mode || 'rw'
						};
				  })
				: [{ hostPath: '', containerPath: '', mode: 'rw' }];

			// Parse environment variables
			const env = data.Config.Env || [];
			envVars = env.length > 0
				? env
						.filter((e: string) => !e.startsWith('PATH='))
						.map((e: string) => {
							const [key, ...valueParts] = e.split('=');
							return { key, value: valueParts.join('=') };
						})
				: [{ key: '', value: '' }];

			// Parse labels
			const containerLabels = data.Config.Labels || {};
			const labelEntries = Object.entries(containerLabels).filter(
				([key]) => !key.startsWith('com.docker.')
			);
			labels = labelEntries.length > 0
				? labelEntries.map(([key, value]) => ({ key, value: String(value) }))
				: [{ key: '', value: '' }];

			// Detect if container belongs to a compose stack
			const composeProject = containerLabels['com.docker.compose.project'];
			if (composeProject) {
				isComposeContainer = true;
				composeStackName = composeProject;
			} else {
				isComposeContainer = false;
				composeStackName = '';
			}

			// Parse connected networks
			const networks = data.NetworkSettings?.Networks || {};
			selectedNetworks = Object.keys(networks);

			// Fetch available networks and auto-update settings
			await fetchNetworks();
			await fetchAutoUpdateSettings(name);

			// Store original config for change detection
			originalConfig = {
				name,
				image,
				command,
				restartPolicy,
				networkMode,
				portMappings: JSON.parse(JSON.stringify(portMappings)),
				volumeMappings: JSON.parse(JSON.stringify(volumeMappings)),
				envVars: JSON.parse(JSON.stringify(envVars)),
				labels: JSON.parse(JSON.stringify(labels)),
				selectedNetworks: [...selectedNetworks]
			};
		} catch (err) {
			error = 'Failed to load container data: ' + String(err);
		} finally {
			loadingData = false;
			// Show dialog after data is loaded and a frame to let it render
			requestAnimationFrame(() => {
				visible = true;
				// Focus first input after form renders
				focusFirstInput();
			});
		}
	}

	function addPortMapping() {
		portMappings = [...portMappings, { hostPort: '', containerPort: '', protocol: 'tcp' }];
	}

	function removePortMapping(index: number) {
		portMappings = portMappings.filter((_, i) => i !== index);
	}

	function addVolumeMapping() {
		volumeMappings = [...volumeMappings, { hostPath: '', containerPath: '', mode: 'rw' }];
	}

	function removeVolumeMapping(index: number) {
		volumeMappings = volumeMappings.filter((_, i) => i !== index);
	}

	function addEnvVar() {
		envVars = [...envVars, { key: '', value: '' }];
	}

	function removeEnvVar(index: number) {
		envVars = envVars.filter((_, i) => i !== index);
	}

	function addLabel() {
		labels = [...labels, { key: '', value: '' }];
	}

	function removeLabel(index: number) {
		labels = labels.filter((_, i) => i !== index);
	}

	function addNetwork(networkId: string) {
		if (networkId && !selectedNetworks.includes(networkId)) {
			selectedNetworks = [...selectedNetworks, networkId];
		}
	}

	function removeNetwork(networkId: string) {
		selectedNetworks = selectedNetworks.filter((n) => n !== networkId);
	}

	function getDriverBadgeClasses(driver: string): string {
		const base = 'text-2xs px-1.5 py-0.5 rounded font-medium';
		switch (driver.toLowerCase()) {
			case 'bridge':
				return `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300`;
			case 'host':
				return `${base} bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300`;
			case 'null':
			case 'none':
				return `${base} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400`;
			case 'overlay':
				return `${base} bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300`;
			case 'macvlan':
				return `${base} bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300`;
			default:
				return `${base} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400`;
		}
	}

	// Check if container configuration has changed
	function hasContainerConfigChanged(): boolean {
		if (!originalConfig) return true;

		// Compare simple fields
		if (name.trim() !== originalConfig.name) return true;
		if (image.trim() !== originalConfig.image) return true;
		if (command.trim() !== originalConfig.command) return true;
		if (restartPolicy !== originalConfig.restartPolicy) return true;
		if (networkMode !== originalConfig.networkMode) return true;

		// Compare arrays (filter out empty entries for comparison)
		const currentPorts = portMappings.filter(p => p.containerPort && p.hostPort);
		const originalPorts = originalConfig.portMappings.filter(p => p.containerPort && p.hostPort);
		if (JSON.stringify(currentPorts) !== JSON.stringify(originalPorts)) return true;

		const currentVolumes = volumeMappings.filter(v => v.hostPath && v.containerPath);
		const originalVolumes = originalConfig.volumeMappings.filter(v => v.hostPath && v.containerPath);
		if (JSON.stringify(currentVolumes) !== JSON.stringify(originalVolumes)) return true;

		const currentEnvs = envVars.filter(e => e.key);
		const originalEnvs = originalConfig.envVars.filter(e => e.key);
		if (JSON.stringify(currentEnvs) !== JSON.stringify(originalEnvs)) return true;

		const currentLabels = labels.filter(l => l.key);
		const originalLabels = originalConfig.labels.filter(l => l.key);
		if (JSON.stringify(currentLabels) !== JSON.stringify(originalLabels)) return true;

		// Compare networks
		if (JSON.stringify([...selectedNetworks].sort()) !== JSON.stringify([...originalConfig.selectedNetworks].sort())) return true;

		return false;
	}

	// Check if auto-update settings have changed
	function hasAutoUpdateChanged(): boolean {
		if (!originalAutoUpdate) return true;
		return (
			autoUpdateEnabled !== originalAutoUpdate.enabled ||
			autoUpdateCronExpression !== originalAutoUpdate.cronExpression ||
			vulnerabilityCriteria !== originalAutoUpdate.vulnerabilityCriteria
		);
	}

	// Serialize current form state for comparison (excluding name for rename detection)
	function serializeConfigWithoutName() {
		return JSON.stringify({
			image: image.trim(),
			command: command.trim(),
			restartPolicy,
			networkMode,
			portMappings: portMappings.filter(p => p.containerPort && p.hostPort),
			volumeMappings: volumeMappings.filter(v => v.hostPath && v.containerPath),
			envVars: envVars.filter(e => e.key),
			labels: labels.filter(l => l.key),
			selectedNetworks: [...selectedNetworks].sort()
		});
	}

	// Serialize original config without name
	function serializeOriginalConfigWithoutName() {
		if (!originalConfig) return null;
		return JSON.stringify({
			image: originalConfig.image,
			command: originalConfig.command,
			restartPolicy: originalConfig.restartPolicy,
			networkMode: originalConfig.networkMode,
			portMappings: originalConfig.portMappings.filter(p => p.containerPort && p.hostPort),
			volumeMappings: originalConfig.volumeMappings.filter(v => v.hostPath && v.containerPath),
			envVars: originalConfig.envVars.filter(e => e.key),
			labels: originalConfig.labels.filter(l => l.key),
			selectedNetworks: [...originalConfig.selectedNetworks].sort()
		});
	}

	// Check if ONLY the container name changed (no other config)
	function hasOnlyNameChanged(): boolean {
		if (!originalConfig) return false;
		if (name.trim() === originalConfig.name) return false; // Name didn't change

		// Compare everything except name
		return serializeConfigWithoutName() === serializeOriginalConfigWithoutName();
	}

	// Check if config changes other than name occurred
	function hasConfigChangedBesidesName(): boolean {
		if (!originalConfig) return false;
		return serializeConfigWithoutName() !== serializeOriginalConfigWithoutName();
	}

	// Derived state for warnings
	let showComposeRenameWarning = $derived(isComposeContainer && hasOnlyNameChanged());
	let showComposeConfigWarning = $derived(isComposeContainer && hasConfigChangedBesidesName());

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		errors = {};
		statusMessage = '';

		// Validate required fields
		let hasErrors = false;
		if (!name.trim()) {
			errors.name = 'Container name is required';
			hasErrors = true;
		}

		if (!image.trim()) {
			errors.image = 'Image name is required';
			hasErrors = true;
		}

		if (hasErrors) {
			return;
		}

		loading = true;

		const containerConfigChanged = hasContainerConfigChanged();
		const autoUpdateChanged = hasAutoUpdateChanged();

		// If nothing changed, just close
		if (!containerConfigChanged && !autoUpdateChanged) {
			onClose();
			loading = false;
			return;
		}

		try {
			// If only name changed, use the rename endpoint (preserves labels, no restart)
			if (hasOnlyNameChanged()) {
				statusMessage = 'Renaming container...';

				const response = await fetch(appendEnvParam(
					`/api/containers/${containerId}/rename`,
					$currentEnvironment?.id
				), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: name.trim() })
				});

				const result = await response.json();

				if (!response.ok) {
					error = result.error || 'Failed to rename container';
					loading = false;
					return;
				}

				statusMessage = 'Container renamed successfully!';

				// Save auto-update settings if changed (use new name)
				if (autoUpdateChanged) {
					await saveAutoUpdateSettings(name.trim());
				}

				await new Promise(resolve => setTimeout(resolve, 500));
				onSuccess();
				onClose();
				loading = false;
				return;
			}

			// Full update required - recreate container
			if (containerConfigChanged) {
				statusMessage = 'Updating container...';

				// Build ports object
				const ports: any = {};
				portMappings
					.filter((p) => p.containerPort && p.hostPort)
					.forEach((p) => {
						const key = `${p.containerPort}/${p.protocol}`;
						ports[key] = { HostPort: String(p.hostPort) };
					});

				// Build volume binds
				const volumeBinds = volumeMappings
					.filter((v) => v.hostPath && v.containerPath)
					.map((v) => `${v.hostPath}:${v.containerPath}:${v.mode}`);

				// Build env array
				const env = envVars
					.filter((e) => e.key && e.value)
					.map((e) => `${e.key}=${e.value}`);

				// Build labels object
				const labelsObj: any = {};
				labels
					.filter((l) => l.key && l.value)
					.forEach((l) => {
						labelsObj[l.key] = l.value;
					});

				// Build command array - parse shell command properly respecting quotes
				const cmd = command.trim() ? parseShellCommand(command.trim()) : undefined;

				const payload = {
					name: name.trim(),
					image: image.trim(),
					ports: Object.keys(ports).length > 0 ? ports : undefined,
					volumeBinds: volumeBinds.length > 0 ? volumeBinds : undefined,
					env: env.length > 0 ? env : undefined,
					labels: Object.keys(labelsObj).length > 0 ? labelsObj : undefined,
					cmd,
					restartPolicy,
					networkMode,
					networks: selectedNetworks.length > 0 ? selectedNetworks : undefined,
					startAfterUpdate
				};

				const response = await fetch(appendEnvParam(`/api/containers/${containerId}/update`, $currentEnvironment?.id), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});

				const result = await response.json();

				if (!response.ok) {
					error = result.error || 'Failed to update container';
					if (result.details) {
						error += ': ' + result.details;
					}
					return;
				}

				statusMessage = 'Container updated successfully!';
			}

			// Save auto-update settings if changed
			if (autoUpdateChanged) {
				if (!containerConfigChanged) {
					statusMessage = 'Saving auto-update settings...';
				}
				await saveAutoUpdateSettings(name.trim());
				if (!containerConfigChanged) {
					statusMessage = 'Auto-update settings saved!';
				}
			}

			// Brief delay to show success message
			await new Promise(resolve => setTimeout(resolve, 500));

			onSuccess();
			onClose();
		} catch (err) {
			error = 'Failed to update container: ' + String(err);
		} finally {
			loading = false;
		}
	}

	function handleClose() {
		onClose();
	}

	$effect(() => {
		if (open && containerId) {
			visible = false;
			loadingData = true;
			statusMessage = '';
			error = '';
			loadContainerData();
			fetchConfigSets();
			selectedConfigSetId = '';
		} else if (!open) {
			// Reset states when closed
			loadingData = true;
			visible = false;
		}
	});
</script>

<Dialog.Root bind:open onOpenChange={(isOpen) => isOpen && focusFirstInput()}>
	<Dialog.Content class="max-w-4xl w-[56rem] max-h-[90vh] p-0 flex flex-col overflow-hidden" style="min-height: 85vh; height: 85vh;">
		<Dialog.Header class="px-5 py-4 border-b bg-muted/30 shrink-0 sticky top-0 z-10">
			<Dialog.Title class="text-base font-semibold flex items-center gap-1">
				Edit container
				{#if isEditingTitle}
					<span class="ml-1">-</span>
					<input
						type="text"
						bind:value={editTitleName}
						bind:this={titleInputRef}
						class="text-muted-foreground font-normal bg-muted border border-input rounded px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
						onkeydown={(e) => {
							if (e.key === 'Enter') saveEditingTitle();
							if (e.key === 'Escape') cancelEditingTitle();
						}}
					/>
					<button
						type="button"
						onclick={saveEditingTitle}
						title="Save"
						class="p-0.5 rounded hover:bg-muted transition-colors"
					>
						<Check class="w-3 h-3 text-green-500 hover:text-green-600" />
					</button>
					<button
						type="button"
						onclick={cancelEditingTitle}
						title="Cancel"
						class="p-0.5 rounded hover:bg-muted transition-colors"
					>
						<X class="w-3 h-3 text-muted-foreground hover:text-foreground" />
					</button>
				{:else if name}
					<span class="font-normal text-muted-foreground ml-1">- {name}</span>
					<button
						type="button"
						onclick={startEditingTitle}
						title="Rename container"
						class="p-0.5 rounded hover:bg-muted transition-colors ml-0.5"
					>
						<Pencil class="w-3 h-3 text-muted-foreground hover:text-foreground" />
					</button>
				{/if}
			</Dialog.Title>
		</Dialog.Header>

		{#if loadingData}
			<div class="flex-1 flex items-center justify-center text-muted-foreground text-sm" style="min-height: calc(85vh - 120px);">
				<Loader2 class="w-5 h-5 animate-spin mr-2" />
				Loading container data...
			</div>
		{:else}
			<div class="px-5 py-4 space-y-5 flex-1 overflow-y-auto">
				<!-- Config Set Selector -->
				{#if configSets.length > 0}
					<div class="space-y-2">
						<div class="flex items-center gap-2 pb-2 border-b">
							<Settings2 class="w-4 h-4 text-muted-foreground" />
							<h3 class="text-sm font-semibold text-foreground">Apply config set</h3>
						</div>
						<div class="flex gap-2 items-end">
							<div class="flex-1">
								<Select.Root type="single" value={selectedConfigSetId} onValueChange={applyConfigSet}>
									<Select.Trigger class="w-full h-9">
										<span>{selectedConfigSetId ? configSets.find(c => c.id === parseInt(selectedConfigSetId))?.name : 'Select a config set to merge values...'}</span>
									</Select.Trigger>
									<Select.Content>
										{#each configSets as configSet}
											<Select.Item value={String(configSet.id)} label={configSet.name}>
												<div class="flex flex-col">
													<span>{configSet.name}</span>
													{#if configSet.description}
														<span class="text-xs text-muted-foreground">{configSet.description}</span>
													{/if}
												</div>
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
						</div>
						{#if selectedConfigSetId}
							{@const selectedSet = configSets.find(c => c.id === parseInt(selectedConfigSetId))}
							{#if selectedSet?.description}
								<p class="text-xs text-muted-foreground">{selectedSet.description}</p>
							{/if}
						{/if}
						<p class="text-xs text-muted-foreground">Note: Values from the config set will be merged with existing settings. Existing keys won't be overwritten.</p>
					</div>
				{/if}

				<!-- Compose Container Warnings -->
				{#if showComposeConfigWarning}
					<div class="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-3">
						<AlertTriangle class="w-5 h-5 text-destructive shrink-0 mt-0.5" />
						<div class="text-sm">
							<p class="font-medium text-destructive">
								This container belongs to stack "{composeStackName}"
							</p>
							<p class="text-muted-foreground mt-1">
								Modifying settings will remove this container from the stack. The container will be recreated and lose its stack association. To avoid this, edit the stack's compose file instead.
							</p>
						</div>
					</div>
				{:else if showComposeRenameWarning}
					<div class="bg-sky-500/10 border border-sky-500/30 rounded-lg p-3 flex items-start gap-3">
						<Info class="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
						<div class="text-sm">
							<p class="font-medium text-sky-600 dark:text-sky-400">
								Renaming container from stack "{composeStackName}"
							</p>
							<p class="text-muted-foreground mt-1">
								The container will stay in the stack, but the compose file will be out of sync. Running <code class="text-xs bg-muted px-1 py-0.5 rounded">docker compose up</code> may recreate it with the original name.
							</p>
						</div>
					</div>
				{:else if isComposeContainer}
					<div class="bg-muted/50 border rounded-lg p-3 flex items-start gap-3">
						<Layers class="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
						<div class="text-sm">
							<p class="font-medium text-foreground">
								Stack container: {composeStackName}
							</p>
							<p class="text-muted-foreground mt-1">
								This container is managed by a Docker Compose stack.
							</p>
						</div>
					</div>
				{/if}

				<!-- Basic Settings -->
				<div class="space-y-3">
					<div class="flex items-center gap-2 pb-2 border-b">
						<h3 class="text-sm font-semibold text-foreground">Basic settings</h3>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<Label for="name" class="text-xs font-medium">Container name *</Label>
							<Input
								id="name"
								bind:value={name}
								placeholder="my-container"
								required
								class="h-9 {errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}"
								oninput={() => errors.name = undefined}
							/>
							{#if errors.name}
								<p class="text-xs text-destructive">{errors.name}</p>
							{/if}
						</div>
						<div class="space-y-1.5">
							<Label for="image" class="text-xs font-medium">Image *</Label>
							<Input
								id="image"
								bind:value={image}
								placeholder="nginx:latest"
								required
								class="h-9 {errors.image ? 'border-destructive focus-visible:ring-destructive' : ''}"
								oninput={() => errors.image = undefined}
							/>
							{#if errors.image}
								<p class="text-xs text-destructive">{errors.image}</p>
							{/if}
						</div>
					</div>

					<div class="space-y-1.5">
						<Label for="command" class="text-xs font-medium">Command (optional)</Label>
						<Input id="command" bind:value={command} placeholder="/bin/sh -c 'echo hello'" class="h-9" />
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<Label for="restartPolicy" class="text-xs font-medium">Restart policy</Label>
							<Select.Root type="single" bind:value={restartPolicy}>
								<Select.Trigger class="w-full h-9">
									<span class="flex items-center">
										{#if restartPolicy === 'no'}
											<Ban class="w-3.5 h-3.5 mr-2 text-muted-foreground" />
										{:else if restartPolicy === 'always'}
											<RotateCw class="w-3.5 h-3.5 mr-2 text-green-500" />
										{:else if restartPolicy === 'on-failure'}
											<AlertTriangle class="w-3.5 h-3.5 mr-2 text-amber-500" />
										{:else}
											<PauseCircle class="w-3.5 h-3.5 mr-2 text-blue-500" />
										{/if}
										{restartPolicy === 'no' ? 'No' : restartPolicy === 'always' ? 'Always' : restartPolicy === 'on-failure' ? 'On failure' : 'Unless stopped'}
									</span>
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="no">
										{#snippet children()}
											<Ban class="w-3.5 h-3.5 mr-2 text-muted-foreground" />
											No
										{/snippet}
									</Select.Item>
									<Select.Item value="always">
										{#snippet children()}
											<RotateCw class="w-3.5 h-3.5 mr-2 text-green-500" />
											Always
										{/snippet}
									</Select.Item>
									<Select.Item value="on-failure">
										{#snippet children()}
											<AlertTriangle class="w-3.5 h-3.5 mr-2 text-amber-500" />
											On failure
										{/snippet}
									</Select.Item>
									<Select.Item value="unless-stopped">
										{#snippet children()}
											<PauseCircle class="w-3.5 h-3.5 mr-2 text-blue-500" />
											Unless stopped
										{/snippet}
									</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>

						<div class="space-y-1.5">
							<Label for="networkMode" class="text-xs font-medium">Network mode</Label>
							<Select.Root type="single" bind:value={networkMode}>
								<Select.Trigger class="w-full h-9">
									<span class="flex items-center">
										{#if networkMode === 'bridge'}
											<Share2 class="w-3.5 h-3.5 mr-2 text-emerald-500" />
										{:else if networkMode === 'host'}
											<Server class="w-3.5 h-3.5 mr-2 text-sky-500" />
										{:else}
											<CircleOff class="w-3.5 h-3.5 mr-2 text-muted-foreground" />
										{/if}
										{networkMode === 'bridge' ? 'Bridge' : networkMode === 'host' ? 'Host' : 'None'}
									</span>
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="bridge">
										{#snippet children()}
											<Share2 class="w-3.5 h-3.5 mr-2 text-emerald-500" />
											Bridge
										{/snippet}
									</Select.Item>
									<Select.Item value="host">
										{#snippet children()}
											<Server class="w-3.5 h-3.5 mr-2 text-sky-500" />
											Host
										{/snippet}
									</Select.Item>
									<Select.Item value="none">
										{#snippet children()}
											<CircleOff class="w-3.5 h-3.5 mr-2 text-muted-foreground" />
											None
										{/snippet}
									</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>
					</div>

					<div class="flex items-center space-x-2 pt-1">
						<Checkbox id="startAfterUpdate" bind:checked={startAfterUpdate} />
						<Label for="startAfterUpdate" class="text-xs font-normal">Start container after update</Label>
					</div>
				</div>

				<!-- Networks -->
				{#if availableNetworks.length > 0}
					<div class="space-y-2">
						<div class="flex justify-between items-center pb-2 border-b">
							<div class="flex items-center gap-2">
								<Network class="w-4 h-4 text-muted-foreground" />
								<h3 class="text-sm font-semibold text-foreground">Networks</h3>
							</div>
						</div>

						<div class="space-y-2">
							<Select.Root type="single" value="" onValueChange={addNetwork}>
								<Select.Trigger class="w-full h-9">
									<span class="text-muted-foreground">Select network to add...</span>
								</Select.Trigger>
								<Select.Content>
									{#each availableNetworks.filter(n => !selectedNetworks.includes(n.name) && !['bridge', 'host', 'none'].includes(n.name)) as network}
										<Select.Item value={network.name}>
											{#snippet children()}
												<div class="flex items-center justify-between w-full">
													<span>{network.name}</span>
													<span class={getDriverBadgeClasses(network.driver)}>{network.driver}</span>
												</div>
											{/snippet}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>

							{#if selectedNetworks.length > 0}
								<div class="flex flex-wrap gap-2 pt-1">
									{#each selectedNetworks as networkName}
										{@const network = availableNetworks.find(n => n.name === networkName)}
										<Badge variant="secondary" class="flex items-center gap-1.5 pr-1">
											{networkName}
											{#if network}
												<span class={getDriverBadgeClasses(network.driver)}>{network.driver}</span>
											{/if}
											<button
												type="button"
												onclick={() => removeNetwork(networkName)}
												class="ml-0.5 hover:bg-destructive/20 rounded p-0.5"
											>
												<X class="w-3 h-3" />
											</button>
										</Badge>
									{/each}
								</div>
							{/if}
							<p class="text-xs text-muted-foreground">Container will be connected to selected networks in addition to the network mode above</p>
						</div>
					</div>
				{/if}

				<!-- Port Mappings -->
				<div class="space-y-2">
					<div class="flex justify-between items-center pb-2 border-b">
						<h3 class="text-sm font-semibold text-foreground">Port mappings</h3>
						<Button type="button" size="sm" variant="ghost" onclick={addPortMapping} class="h-7 text-xs">
							<Plus class="w-3.5 h-3.5 mr-1" />
							Add
						</Button>
					</div>

					<div class="space-y-2">
						{#each portMappings as mapping, index}
							<div class="flex gap-2 items-center">
								<div class="flex-1 relative">
									<span class="absolute -top-2 left-2 text-2xs text-muted-foreground bg-background px-1">Host</span>
									<Input bind:value={mapping.hostPort} type="number" class="h-9" />
								</div>
								<div class="flex-1 relative">
									<span class="absolute -top-2 left-2 text-2xs text-muted-foreground bg-background px-1">Container</span>
									<Input bind:value={mapping.containerPort} type="number" class="h-9" />
								</div>
								<div class="relative">
									<span class="absolute -top-2 left-2 text-2xs text-muted-foreground bg-background px-1 z-10">Protocol</span>
									<Select.Root type="single" bind:value={mapping.protocol}>
										<Select.Trigger class="w-20 h-9">
											<span>{mapping.protocol.toUpperCase()}</span>
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="tcp" label="TCP" />
											<Select.Item value="udp" label="UDP" />
										</Select.Content>
									</Select.Root>
								</div>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									onclick={() => removePortMapping(index)}
									disabled={portMappings.length === 1}
									class="h-9 w-9 text-muted-foreground hover:text-destructive"
								>
									<Trash2 class="w-4 h-4" />
								</Button>
							</div>
						{/each}
					</div>
				</div>

				<!-- Volume Mappings -->
				<div class="space-y-2">
					<div class="flex justify-between items-center pb-2 border-b">
						<h3 class="text-sm font-semibold text-foreground">Volume mappings</h3>
						<Button type="button" size="sm" variant="ghost" onclick={addVolumeMapping} class="h-7 text-xs">
							<Plus class="w-3.5 h-3.5 mr-1" />
							Add
						</Button>
					</div>

					<div class="space-y-2">
						{#each volumeMappings as mapping, index}
							<div class="flex gap-2 items-center">
								<div class="flex-1 relative">
									<span class="absolute -top-2 left-2 text-2xs text-muted-foreground bg-background px-1">Host path</span>
									<Input bind:value={mapping.hostPath} class="h-9" />
								</div>
								<div class="flex-1 relative">
									<span class="absolute -top-2 left-2 text-2xs text-muted-foreground bg-background px-1">Container path</span>
									<Input bind:value={mapping.containerPath} class="h-9" />
								</div>
								<div class="relative">
									<span class="absolute -top-2 left-2 text-2xs text-muted-foreground bg-background px-1 z-10">Mode</span>
									<Select.Root type="single" bind:value={mapping.mode}>
										<Select.Trigger class="w-16 h-9">
											<span>{mapping.mode.toUpperCase()}</span>
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="rw" label="RW" />
											<Select.Item value="ro" label="RO" />
										</Select.Content>
									</Select.Root>
								</div>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									onclick={() => removeVolumeMapping(index)}
									disabled={volumeMappings.length === 1}
									class="h-9 w-9 text-muted-foreground hover:text-destructive"
								>
									<Trash2 class="w-4 h-4" />
								</Button>
							</div>
						{/each}
					</div>
				</div>

				<!-- Environment Variables -->
				<div class="space-y-2">
					<div class="flex justify-between items-center pb-2 border-b">
						<h3 class="text-sm font-semibold text-foreground">Environment variables</h3>
						<Button type="button" size="sm" variant="ghost" onclick={addEnvVar} class="h-7 text-xs">
							<Plus class="w-3.5 h-3.5 mr-1" />
							Add
						</Button>
					</div>

					<div class="space-y-2">
						{#each envVars as envVar, index}
							<div class="flex gap-2 items-center">
								<div class="flex-1 relative">
									<span class="absolute -top-2 left-2 text-2xs text-muted-foreground bg-background px-1">Key</span>
									<Input bind:value={envVar.key} class="h-9" />
								</div>
								<div class="flex-1 relative">
									<span class="absolute -top-2 left-2 text-2xs text-muted-foreground bg-background px-1">Value</span>
									<Input bind:value={envVar.value} class="h-9" />
								</div>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									onclick={() => removeEnvVar(index)}
									disabled={envVars.length === 1}
									class="h-9 w-9 text-muted-foreground hover:text-destructive"
								>
									<Trash2 class="w-4 h-4" />
								</Button>
							</div>
						{/each}
					</div>
				</div>

				<!-- Labels -->
				<div class="space-y-2">
					<div class="flex justify-between items-center pb-2 border-b">
						<h3 class="text-sm font-semibold text-foreground">Labels</h3>
						<Button type="button" size="sm" variant="ghost" onclick={addLabel} class="h-7 text-xs">
							<Plus class="w-3.5 h-3.5 mr-1" />
							Add
						</Button>
					</div>

					<div class="space-y-2">
						{#each labels as label, index}
							<div class="flex gap-2 items-center">
								<div class="flex-1 relative">
									<span class="absolute -top-2 left-2 text-2xs text-muted-foreground bg-background px-1">Key</span>
									<Input bind:value={label.key} class="h-9" />
								</div>
								<div class="flex-1 relative">
									<span class="absolute -top-2 left-2 text-2xs text-muted-foreground bg-background px-1">Value</span>
									<Input bind:value={label.value} class="h-9" />
								</div>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									onclick={() => removeLabel(index)}
									disabled={labels.length === 1}
									class="h-9 w-9 text-muted-foreground hover:text-destructive"
								>
									<Trash2 class="w-4 h-4" />
								</Button>
							</div>
						{/each}
					</div>
				</div>

				<!-- Auto-update Settings -->
				<div class="space-y-3">
					<div class="flex items-center gap-2 pb-2 border-b">
						<CircleArrowUp class="w-4 h-4 text-muted-foreground" />
						<h3 class="text-sm font-semibold text-foreground">Auto-update</h3>
					</div>

				<AutoUpdateSettings
					bind:enabled={autoUpdateEnabled}
					bind:cronExpression={autoUpdateCronExpression}
					bind:vulnerabilityCriteria={vulnerabilityCriteria}
				/>
				</div>

				{#if statusMessage}
					<div class="px-3 py-2 text-xs text-primary bg-primary/10 rounded-md">
						{statusMessage}
					</div>
				{/if}

				{#if error}
					<div class="px-3 py-2 text-xs text-destructive bg-destructive/10 rounded-md">
						{error}
					</div>
				{/if}

			</div>
			<div class="flex justify-end gap-2 px-5 py-3 border-t bg-muted/30 shrink-0">
				<Button type="button" variant="outline" onclick={handleClose} disabled={loading} size="sm">
					Cancel
				</Button>
				<Button type="button" variant="secondary" disabled={loading} size="sm" onclick={handleSubmit}>
					{#if loading}
						<Loader2 class="w-4 h-4 mr-1 animate-spin" />
						Updating...
					{:else}
						Update container
					{/if}
				</Button>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
