<script lang="ts">
	import { tick } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { TogglePill, ToggleGroup } from '$lib/components/ui/toggle-pill';
	import { Plus, Trash2, Settings2, RefreshCw, Network, X, Ban, RotateCw, AlertTriangle, PauseCircle, Share2, Server, CircleOff, ChevronDown, ChevronRight, ArrowBigRight, Cpu, Shield, HeartPulse, Wifi, HardDrive, Lock, User, Loader2, Download, CheckCircle2, XCircle, ShieldCheck, ShieldAlert, ShieldX, Package, AlertCircle, Play } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import AutoUpdateSettings from './AutoUpdateSettings.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';
	import { focusFirstInput } from '$lib/utils';
	import PullTab from '$lib/components/PullTab.svelte';
	import ScanTab from '$lib/components/ScanTab.svelte';
	import type { ScanResult } from '$lib/components/ScanTab.svelte';

	// Protocol options for ports
	const protocolOptions = [
		{ value: 'tcp', label: 'TCP' },
		{ value: 'udp', label: 'UDP' }
	];

	// Mode options for volumes
	const volumeModeOptions = [
		{ value: 'rw', label: 'RW' },
		{ value: 'ro', label: 'RO' }
	];

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
		onClose?: () => void;
		onSuccess?: () => void;
		prefilledImage?: string;
		skipPullTab?: boolean;
		autoPull?: boolean;
	}

	let { open = $bindable(), onClose, onSuccess, prefilledImage, skipPullTab = false, autoPull = false }: Props = $props();

	// Track if we've already auto-pulled for this modal session
	let hasAutoPulled = $state(false);

	// Tab state - start on settings if skipping pull tab
	let activeTab = $state<'pull' | 'scan' | 'container'>(skipPullTab ? 'container' : 'pull');

	// Config sets
	let configSets = $state<ConfigSet[]>([]);
	let selectedConfigSetId = $state<string>('');

	// Form state
	let name = $state('');
	let image = $state('');
	let command = $state('');
	let restartPolicy = $state('no');
	let networkMode = $state('bridge');
	let startAfterCreate = $state(true);

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

	// Collapsible sections state
	let showResources = $state(false);
	let showSecurity = $state(false);
	let showHealth = $state(false);
	let showDns = $state(false);
	let showDevices = $state(false);
	let showUlimits = $state(false);

	// User/Group
	let containerUser = $state('');

	// Privileged mode
	let privilegedMode = $state(false);

	// Healthcheck settings
	let healthcheckEnabled = $state(false);
	let healthcheckCommand = $state('');
	let healthcheckInterval = $state(30);
	let healthcheckTimeout = $state(30);
	let healthcheckRetries = $state(3);
	let healthcheckStartPeriod = $state(0);

	// Resource limits
	let memoryLimit = $state('');
	let memoryReservation = $state('');
	let cpuShares = $state('');
	let nanoCpus = $state('');

	// Capabilities
	let capAdd = $state<string[]>([]);
	let capDrop = $state<string[]>([]);
	let capabilityInput = $state('');

	const commonCapabilities = [
		'SYS_ADMIN', 'SYS_PTRACE', 'NET_ADMIN', 'NET_RAW', 'IPC_LOCK',
		'SYS_TIME', 'SYS_RESOURCE', 'MKNOD', 'AUDIT_WRITE', 'SETFCAP',
		'CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'FSETID', 'KILL', 'SETGID',
		'SETUID', 'SETPCAP', 'NET_BIND_SERVICE', 'SYS_CHROOT', 'AUDIT_CONTROL'
	];

	// Devices
	let deviceMappings = $state<{ hostPath: string; containerPath: string; permissions: string }[]>([]);

	// DNS settings
	let dnsServers = $state<string[]>([]);
	let dnsSearch = $state<string[]>([]);
	let dnsOptions = $state<string[]>([]);
	let dnsInput = $state('');
	let dnsSearchInput = $state('');
	let dnsOptionInput = $state('');

	// Security options
	let securityOptions = $state<string[]>([]);
	let securityOptionInput = $state('');

	// Ulimits
	let ulimits = $state<{ name: string; soft: string; hard: string }[]>([]);
	const commonUlimits = ['nofile', 'nproc', 'core', 'memlock', 'stack', 'cpu', 'fsize', 'locks'];

	let loading = $state(false);
	let errors = $state<{ name?: string; image?: string }>({});

	// Component refs
	let pullTabRef: PullTab | undefined;
	let scanTabRef: ScanTab | undefined;

	// Pull & Scan status (tracked via component callbacks)
	let pullStatus = $state<'idle' | 'pulling' | 'complete' | 'error'>('idle');
	let pullStarted = $state(false);
	let scanStatus = $state<'idle' | 'scanning' | 'complete' | 'error'>('idle');
	let scanStarted = $state(false);
	let scanResults = $state<ScanResult[]>([]);

	// Scanner settings - scanning is enabled if a scanner is configured
	let envHasScanning = $state(false);

	// Fetch config sets and networks when modal opens
	$effect(() => {
		if (open) {
			fetchConfigSets();
			fetchNetworks();
			fetchScannerSettings();
		}
	});

	// Track previous open state to detect when modal opens
	let wasOpen = $state(false);

	$effect(() => {
		if (open && !wasOpen) {
			// Modal just opened - reset state
			pullStatus = 'idle';
			pullStarted = !skipPullTab;
			scanStatus = 'idle';
			scanStarted = false;
			scanResults = [];
			hasAutoPulled = false;
			autoSwitchedToScan = false;
			autoSwitchedToContainer = false;
			activeTab = skipPullTab ? 'container' : 'pull';

			// Reset components
			pullTabRef?.reset();
			scanTabRef?.reset();

			// Set image from prefilledImage if provided
			if (prefilledImage) {
				image = prefilledImage;
			}
		}
		wasOpen = open;
	});

	// Auto-pull when autoPull is true and modal opens with an image
	$effect(() => {
		if (autoPull && open && prefilledImage && !hasAutoPulled && pullStatus === 'idle') {
			hasAutoPulled = true;
			// Small delay to ensure component is mounted
			setTimeout(() => pullTabRef?.startPull(), 100);
		}
	});

	// Track auto-switch state to prevent re-triggering when user manually clicks tabs
	let autoSwitchedToScan = $state(false);
	let autoSwitchedToContainer = $state(false);

	// Handle pull completion
	function handlePullComplete() {
		pullStatus = 'complete';
		// Auto-start scan if enabled
		if (envHasScanning && !autoSwitchedToScan) {
			autoSwitchedToScan = true;
			scanStarted = true;
			activeTab = 'scan';
			// Start scan with small delay for tab switch
			setTimeout(() => scanTabRef?.startScan(), 100);
		} else if (!envHasScanning && !autoSwitchedToContainer) {
			// Go to container tab if no scan
			autoSwitchedToContainer = true;
			activeTab = 'container';
		}
	}

	function handlePullError(error: string) {
		pullStatus = 'error';
	}

	function handlePullStatusChange(status: 'idle' | 'pulling' | 'complete' | 'error') {
		pullStatus = status;
	}

	function handleScanComplete(results: ScanResult[]) {
		scanStatus = 'complete';
		scanResults = results;
		// Auto-switch to container tab
		if (!autoSwitchedToContainer) {
			autoSwitchedToContainer = true;
			activeTab = 'container';
		}
	}

	function handleScanError(error: string) {
		scanStatus = 'error';
	}

	function handleScanStatusChange(status: 'idle' | 'scanning' | 'complete' | 'error') {
		scanStatus = status;
	}

	async function fetchNetworks() {
		try {
			const envParam = $currentEnvironment ? `?env=${$currentEnvironment.id}` : '';
			const response = await fetch(`/api/networks${envParam}`);
			if (response.ok) {
				availableNetworks = await response.json();
			}
		} catch (err) {
			console.error('Failed to fetch networks:', err);
		}
	}

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

	async function fetchScannerSettings() {
		try {
			const envId = $currentEnvironment?.id;
			const url = envId ? `/api/settings/scanner?env=${envId}&settingsOnly=true` : '/api/settings/scanner?settingsOnly=true';
			const response = await fetch(url);
			if (response.ok) {
				const data = await response.json();
				const scanner = data.settings?.scanner ?? 'none';
				// Scanning is enabled if a scanner is configured
				envHasScanning = scanner !== 'none';
			}
		} catch (err) {
			console.error('Failed to fetch scanner settings:', err);
		}
	}

	function applyConfigSet(configSetId: string) {
		selectedConfigSetId = configSetId;
		if (!configSetId) return;

		const configSet = configSets.find((c) => c.id === parseInt(configSetId));
		if (!configSet) return;

		if (configSet.env_vars && configSet.env_vars.length > 0) {
			envVars = configSet.env_vars.map((e) => ({ ...e }));
		}
		if (configSet.labels && configSet.labels.length > 0) {
			labels = configSet.labels.map((l) => ({ ...l }));
		}
		if (configSet.ports && configSet.ports.length > 0) {
			portMappings = configSet.ports.map((p) => ({ ...p }));
		}
		if (configSet.volumes && configSet.volumes.length > 0) {
			volumeMappings = configSet.volumes.map((v) => ({ ...v }));
		}
		if (configSet.network_mode) {
			networkMode = configSet.network_mode;
		}
		if (configSet.restart_policy) {
			restartPolicy = configSet.restart_policy;
		}
	}

	// Helper functions for form
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

	function addDeviceMapping() {
		deviceMappings = [...deviceMappings, { hostPath: '', containerPath: '', permissions: 'rwm' }];
	}

	function removeDeviceMapping(index: number) {
		deviceMappings = deviceMappings.filter((_, i) => i !== index);
	}

	function addUlimit() {
		ulimits = [...ulimits, { name: 'nofile', soft: '', hard: '' }];
	}

	function removeUlimit(index: number) {
		ulimits = ulimits.filter((_, i) => i !== index);
	}

	function addCapability(type: 'add' | 'drop', cap: string) {
		if (!cap) return;
		const capUpper = cap.toUpperCase();
		if (type === 'add') {
			if (!capAdd.includes(capUpper)) {
				capAdd = [...capAdd, capUpper];
			}
		} else {
			if (!capDrop.includes(capUpper)) {
				capDrop = [...capDrop, capUpper];
			}
		}
	}

	function removeCapability(type: 'add' | 'drop', cap: string) {
		if (type === 'add') {
			capAdd = capAdd.filter(c => c !== cap);
		} else {
			capDrop = capDrop.filter(c => c !== cap);
		}
	}

	function addDnsServer() {
		if (dnsInput.trim() && !dnsServers.includes(dnsInput.trim())) {
			dnsServers = [...dnsServers, dnsInput.trim()];
			dnsInput = '';
		}
	}

	function removeDnsServer(server: string) {
		dnsServers = dnsServers.filter(s => s !== server);
	}

	function addDnsSearch() {
		if (dnsSearchInput.trim() && !dnsSearch.includes(dnsSearchInput.trim())) {
			dnsSearch = [...dnsSearch, dnsSearchInput.trim()];
			dnsSearchInput = '';
		}
	}

	function removeDnsSearch(domain: string) {
		dnsSearch = dnsSearch.filter(d => d !== domain);
	}

	function addDnsOption() {
		if (dnsOptionInput.trim() && !dnsOptions.includes(dnsOptionInput.trim())) {
			dnsOptions = [...dnsOptions, dnsOptionInput.trim()];
			dnsOptionInput = '';
		}
	}

	function removeDnsOption(option: string) {
		dnsOptions = dnsOptions.filter(o => o !== option);
	}

	function addSecurityOption() {
		if (securityOptionInput.trim() && !securityOptions.includes(securityOptionInput.trim())) {
			securityOptions = [...securityOptions, securityOptionInput.trim()];
			securityOptionInput = '';
		}
	}

	function removeSecurityOption(option: string) {
		securityOptions = securityOptions.filter(o => o !== option);
	}

	function parseMemory(value: string): number | undefined {
		if (!value) return undefined;
		const match = value.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?b?)?$/);
		if (!match) return undefined;
		const num = parseFloat(match[1]);
		const unit = match[2] || '';
		switch (unit) {
			case 'k': case 'kb': return Math.floor(num * 1024);
			case 'm': case 'mb': return Math.floor(num * 1024 * 1024);
			case 'g': case 'gb': return Math.floor(num * 1024 * 1024 * 1024);
			case 't': case 'tb': return Math.floor(num * 1024 * 1024 * 1024 * 1024);
			default: return Math.floor(num);
		}
	}

	function parseNanoCpus(value: string): number | undefined {
		if (!value) return undefined;
		const num = parseFloat(value);
		if (isNaN(num)) return undefined;
		return Math.floor(num * 1e9);
	}

	function getDriverBadgeClasses(driver: string): string {
		const base = 'text-2xs px-1.5 py-0.5 rounded font-medium';
		switch (driver.toLowerCase()) {
			case 'bridge': return `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300`;
			case 'host': return `${base} bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300`;
			case 'null': case 'none': return `${base} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400`;
			case 'overlay': return `${base} bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300`;
			case 'macvlan': return `${base} bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300`;
			default: return `${base} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400`;
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errors = {};

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

		try {
			const ports: any = {};
			portMappings
				.filter((p) => p.containerPort && p.hostPort)
				.forEach((p) => {
					const key = `${p.containerPort}/${p.protocol}`;
					ports[key] = { HostPort: String(p.hostPort) };
				});

			const volumeBinds = volumeMappings
				.filter((v) => v.hostPath && v.containerPath)
				.map((v) => `${v.hostPath}:${v.containerPath}:${v.mode}`);

			const env = envVars
				.filter((e) => e.key && e.value)
				.map((e) => `${e.key}=${e.value}`);

			const labelsObj: any = {};
			labels
				.filter((l) => l.key && l.value)
				.forEach((l) => {
					labelsObj[l.key] = l.value;
				});

			const cmd = command.trim() ? parseShellCommand(command.trim()) : undefined;

			let healthcheck: any = undefined;
			if (healthcheckEnabled && healthcheckCommand.trim()) {
				healthcheck = {
					test: ['CMD-SHELL', healthcheckCommand.trim()],
					interval: healthcheckInterval * 1e9,
					timeout: healthcheckTimeout * 1e9,
					retries: healthcheckRetries,
					startPeriod: healthcheckStartPeriod * 1e9
				};
			}

			const devices = deviceMappings
				.filter(d => d.hostPath && d.containerPath)
				.map(d => ({
					hostPath: d.hostPath,
					containerPath: d.containerPath,
					permissions: d.permissions || 'rwm'
				}));

			const ulimitsArray = ulimits
				.filter(u => u.name && u.soft && u.hard)
				.map(u => ({
					name: u.name,
					soft: parseInt(u.soft) || 0,
					hard: parseInt(u.hard) || 0
				}));

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
				startAfterCreate,
				user: containerUser.trim() || undefined,
				privileged: privilegedMode || undefined,
				healthcheck,
				memory: parseMemory(memoryLimit),
				memoryReservation: parseMemory(memoryReservation),
				cpuShares: cpuShares ? parseInt(cpuShares) : undefined,
				nanoCpus: parseNanoCpus(nanoCpus),
				capAdd: capAdd.length > 0 ? capAdd : undefined,
				capDrop: capDrop.length > 0 ? capDrop : undefined,
				devices: devices.length > 0 ? devices : undefined,
				dns: dnsServers.length > 0 ? dnsServers : undefined,
				dnsSearch: dnsSearch.length > 0 ? dnsSearch : undefined,
				dnsOptions: dnsOptions.length > 0 ? dnsOptions : undefined,
				securityOpt: securityOptions.length > 0 ? securityOptions : undefined,
				ulimits: ulimitsArray.length > 0 ? ulimitsArray : undefined
			};

			const envParam = $currentEnvironment ? `?env=${$currentEnvironment.id}` : '';
			const response = await fetch(`/api/containers${envParam}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await response.json();

			if (!response.ok) {
				let errorMsg = result.error || 'Failed to create container';
				if (result.details) {
					errorMsg += ': ' + result.details;
				}
				toast.error(errorMsg);
				return;
			}

			if (autoUpdateEnabled) {
				try {
					const envParam = $currentEnvironment ? `?env=${$currentEnvironment.id}` : '';
					await fetch(`/api/auto-update/${encodeURIComponent(name.trim())}${envParam}`, {
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

			if (result.imagePulled) {
				toast.success(`Container created (image ${image.trim()} was pulled automatically)`);
			} else {
				toast.success('Container created successfully');
			}

			open = false;
			resetForm();
			onSuccess?.();
			onClose?.();
		} catch (err) {
			toast.error('Failed to create container: ' + String(err));
		} finally {
			loading = false;
		}
	}

	function resetForm() {
		name = '';
		image = '';
		command = '';
		restartPolicy = 'no';
		networkMode = 'bridge';
		startAfterCreate = true;
		portMappings = [{ hostPort: '', containerPort: '', protocol: 'tcp' }];
		volumeMappings = [{ hostPath: '', containerPath: '', mode: 'rw' }];
		envVars = [{ key: '', value: '' }];
		labels = [{ key: '', value: '' }];
		selectedNetworks = [];
		autoUpdateEnabled = false;
		autoUpdateCronExpression = '0 3 * * *';
		vulnerabilityCriteria = 'never';
		errors = {};
		selectedConfigSetId = '';
		showResources = false;
		showSecurity = false;
		showHealth = false;
		showDns = false;
		showDevices = false;
		showUlimits = false;
		containerUser = '';
		privilegedMode = false;
		healthcheckEnabled = false;
		healthcheckCommand = '';
		healthcheckInterval = 30;
		healthcheckTimeout = 30;
		healthcheckRetries = 3;
		healthcheckStartPeriod = 0;
		memoryLimit = '';
		memoryReservation = '';
		cpuShares = '';
		nanoCpus = '';
		capAdd = [];
		capDrop = [];
		capabilityInput = '';
		deviceMappings = [];
		dnsServers = [];
		dnsSearch = [];
		dnsOptions = [];
		dnsInput = '';
		dnsSearchInput = '';
		dnsOptionInput = '';
		securityOptions = [];
		securityOptionInput = '';
		ulimits = [];
		// Reset pull/scan state
		activeTab = skipPullTab ? 'container' : 'pull';
		pullStatus = 'idle';
		pullStarted = false;
		scanStatus = 'idle';
		scanStarted = false;
		scanResults = [];
		hasAutoPulled = false;
		autoSwitchedToScan = false;
		autoSwitchedToContainer = false;
		// Reset components
		pullTabRef?.reset();
		scanTabRef?.reset();
	}

	function handleClose() {
		open = false;
		resetForm();
		onClose?.();
	}

	const totalVulnerabilities = $derived(
		scanResults.reduce((total, r) => total + r.vulnerabilities.length, 0)
	);

	const hasCriticalOrHigh = $derived(
		scanResults.some(r => r.summary.critical > 0 || r.summary.high > 0)
	);

	const isPulling = $derived(pullStatus === 'pulling');
	const isScanning = $derived(scanStatus === 'scanning');
	const imageReady = $derived(pullStatus === 'complete');
</script>

<Dialog.Root bind:open onOpenChange={(isOpen) => isOpen && focusFirstInput()}>
	<Dialog.Content class="max-w-4xl w-full h-[85vh] p-0 flex flex-col overflow-hidden !zoom-in-0 !zoom-out-0" showCloseButton={false}>
		<Dialog.Header class="px-5 py-4 border-b bg-muted/30 shrink-0 sticky top-0 z-10">
			<Dialog.Title class="text-base font-semibold">Create new container</Dialog.Title>
			<button
				type="button"
				onclick={handleClose}
				disabled={loading || isPulling || isScanning}
				class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-30"
			>
				<X class="h-4 w-4" />
				<span class="sr-only">Close</span>
			</button>
		</Dialog.Header>

		<!-- Tabs (hidden when skipPullTab) -->
		{#if !skipPullTab}
		<div class="flex items-center border-b shrink-0 px-5 bg-muted/10">
			<!-- Pull Tab -->
			<button
				class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-2 {activeTab === 'pull' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
				onclick={() => activeTab = 'pull'}
			>
				<Download class="w-4 h-4" />
				Pull
				{#if pullStatus === 'complete'}
					<CheckCircle2 class="w-3.5 h-3.5 text-green-500" />
				{:else if pullStatus === 'pulling'}
					<Loader2 class="w-3.5 h-3.5 animate-spin" />
				{:else if pullStatus === 'error'}
					<XCircle class="w-3.5 h-3.5 text-red-500" />
				{/if}
			</button>
			{#if envHasScanning}
				<ArrowBigRight class="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
				<!-- Scan Tab -->
				<button
					class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-2 {activeTab === 'scan' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
					onclick={() => activeTab = 'scan'}
					disabled={pullStatus === 'idle' || pullStatus === 'pulling'}
				>
					<Shield class="w-4 h-4" />
					Scan
					{#if scanStatus === 'complete' && scanResults.length > 0}
						{#if hasCriticalOrHigh}
							<ShieldX class="w-3.5 h-3.5 text-red-500" />
						{:else if totalVulnerabilities > 0}
							<ShieldAlert class="w-3.5 h-3.5 text-yellow-500" />
						{:else}
							<ShieldCheck class="w-3.5 h-3.5 text-green-500" />
						{/if}
					{:else if scanStatus === 'scanning'}
						<Loader2 class="w-3.5 h-3.5 animate-spin" />
					{/if}
				</button>
			{/if}
			<ArrowBigRight class="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
			<!-- Container Tab -->
			<button
				class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-2 {activeTab === 'container' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
				onclick={() => activeTab = 'container'}
			>
				<Settings2 class="w-4 h-4" />
				Container
			</button>
		</div>
		{/if}

		<!-- Tab Content -->
		<!-- Pull Tab - using PullTab component -->
		<div class="px-5 py-4 flex-1 min-h-0 flex flex-col" class:hidden={activeTab !== 'pull'}>
			<PullTab
				bind:this={pullTabRef}
				imageName={image}
				envId={$currentEnvironment?.id}
				showImageInput={!autoPull}
				autoStart={pullStarted && pullStatus === 'idle'}
				onComplete={handlePullComplete}
				onError={handlePullError}
				onStatusChange={handlePullStatusChange}
				onImageChange={(newImage) => image = newImage}
			/>
		</div>

		<!-- Scan Tab - using ScanTab component -->
		<div class="px-5 py-4 flex-1 min-h-0 flex flex-col" class:hidden={activeTab !== 'scan'}>
			{#if envHasScanning}
				<ScanTab
					bind:this={scanTabRef}
					imageName={image}
					envId={$currentEnvironment?.id}
					autoStart={scanStarted && scanStatus === 'idle'}
					onComplete={handleScanComplete}
					onError={handleScanError}
					onStatusChange={handleScanStatusChange}
				/>
			{:else}
				<!-- Scanning disabled -->
				<div class="flex-1 flex items-center justify-center">
					<div class="text-center">
						<Shield class="w-12 h-12 text-muted-foreground/50 mx-auto mb-2" />
						<p class="text-sm text-muted-foreground">Vulnerability scanning is disabled for this environment.</p>
						<p class="text-xs text-muted-foreground mt-1">Enable it in Settings → Environments to scan images.</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Container Settings Tab -->
		<div class="px-5 py-4 space-y-5 flex-1 overflow-y-auto" class:hidden={activeTab !== 'container'}>
			<!-- Image Summary -->
				<div class="p-3 rounded-lg bg-muted/50 border">
					<div class="flex items-center gap-3">
						<Package class="w-5 h-5 text-muted-foreground" />
						<div>
							<p class="text-sm font-medium">Image: <code class="bg-muted px-1.5 py-0.5 rounded">{image || 'Not set'}</code></p>
							{#if isPulling || isScanning}
								<p class="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
									<Loader2 class="w-3 h-3 animate-spin" />
									{isScanning ? 'Scanning...' : 'Pulling...'}
								</p>
							{:else if imageReady}
								<p class="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
									<CheckCircle2 class="w-3 h-3" />
									Image pulled and ready
									{#if scanResults.length > 0}
										• <span class="{hasCriticalOrHigh ? 'text-red-600' : totalVulnerabilities > 0 ? 'text-amber-600' : 'text-green-600'}">{totalVulnerabilities} vulnerabilities</span>
									{/if}
								</p>
							{:else if !image && !skipPullTab}
								<p class="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
									<AlertTriangle class="w-3 h-3" />
									Go to "Pull" tab to set the image
								</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- Config Set Selector -->
				{#if configSets.length > 0}
					<div class="space-y-2">
						<div class="flex items-center gap-2 pb-2 border-b">
							<Settings2 class="w-4 h-4 text-muted-foreground" />
							<h3 class="text-sm font-semibold text-foreground">Config set</h3>
						</div>
						<div class="flex gap-2 items-end">
							<div class="flex-1">
								<Select.Root type="single" value={selectedConfigSetId} onValueChange={applyConfigSet}>
									<Select.Trigger class="w-full h-9">
										<span>{selectedConfigSetId ? configSets.find(c => c.id === parseInt(selectedConfigSetId))?.name : 'Select a config set to pre-fill values...'}</span>
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
					</div>
				{/if}

				<!-- Basic Settings -->
				<div class="space-y-3">
					<div class="flex items-center gap-2 pb-2 border-b">
						<h3 class="text-sm font-semibold text-foreground">Basic settings</h3>
					</div>

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
						<Label for="command" class="text-xs font-medium">Command (optional)</Label>
						<Input id="command" bind:value={command} placeholder="/bin/sh -c 'echo hello'" class="h-9" />
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<Label class="text-xs font-medium">Restart policy</Label>
							<Select.Root type="single" bind:value={restartPolicy}>
								<Select.Trigger id="restartPolicy" tabindex={0} class="w-full h-9">
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
							<Label class="text-xs font-medium">Network mode</Label>
							<Select.Root type="single" bind:value={networkMode}>
								<Select.Trigger id="networkMode" tabindex={0} class="w-full h-9">
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

					<div class="flex items-center gap-3 pt-1">
						<Label class="text-xs font-normal">Start container after creation</Label>
						<TogglePill bind:checked={startAfterCreate} />
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
								<Select.Trigger tabindex={0} class="w-full h-9">
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
								<ToggleGroup
									value={mapping.protocol}
									options={protocolOptions}
									onchange={(v) => { portMappings[index].protocol = v; }}
								/>
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
								<ToggleGroup
									value={mapping.mode}
									options={volumeModeOptions}
									onchange={(v) => { volumeMappings[index].mode = v; }}
								/>
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

				<!-- Advanced Options Header -->
				<div class="pt-2">
					<p class="text-xs text-muted-foreground mb-3">Advanced container options (click to expand)</p>
				</div>

				<!-- Resources Section (Collapsible) -->
				<div class="border rounded-lg">
					<button
						type="button"
						onclick={() => showResources = !showResources}
						class="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
					>
						<div class="flex items-center gap-2">
							<Cpu class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-medium">Resources</span>
							{#if memoryLimit || nanoCpus || cpuShares}
								<Badge variant="secondary" class="text-2xs">configured</Badge>
							{/if}
						</div>
						{#if showResources}
							<ChevronDown class="w-4 h-4 text-muted-foreground" />
						{:else}
							<ChevronRight class="w-4 h-4 text-muted-foreground" />
						{/if}
					</button>
					{#if showResources}
						<div class="px-3 pb-3 space-y-3 border-t">
							<p class="text-xs text-muted-foreground pt-2">Configure memory and CPU limits for this container</p>
							<div class="grid grid-cols-2 gap-3">
								<div class="space-y-1.5">
									<Label for="memoryLimit" class="text-xs font-medium">Memory limit</Label>
									<Input id="memoryLimit" bind:value={memoryLimit} placeholder="e.g., 512m, 1g" class="h-9" />
								</div>
								<div class="space-y-1.5">
									<Label for="memoryReservation" class="text-xs font-medium">Memory reservation</Label>
									<Input id="memoryReservation" bind:value={memoryReservation} placeholder="e.g., 256m" class="h-9" />
								</div>
							</div>
							<div class="grid grid-cols-2 gap-3">
								<div class="space-y-1.5">
									<Label for="nanoCpus" class="text-xs font-medium">CPU limit</Label>
									<Input id="nanoCpus" bind:value={nanoCpus} placeholder="e.g., 0.5, 1.5, 2" class="h-9" />
								</div>
								<div class="space-y-1.5">
									<Label for="cpuShares" class="text-xs font-medium">CPU shares</Label>
									<Input id="cpuShares" bind:value={cpuShares} type="number" placeholder="1024" class="h-9" />
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Security Section (Collapsible) -->
				<div class="border rounded-lg">
					<button
						type="button"
						onclick={() => showSecurity = !showSecurity}
						class="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
					>
						<div class="flex items-center gap-2">
							<Shield class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-medium">Security</span>
							{#if privilegedMode || containerUser || capAdd.length > 0 || capDrop.length > 0}
								<Badge variant="secondary" class="text-2xs">configured</Badge>
							{/if}
						</div>
						{#if showSecurity}
							<ChevronDown class="w-4 h-4 text-muted-foreground" />
						{:else}
							<ChevronRight class="w-4 h-4 text-muted-foreground" />
						{/if}
					</button>
					{#if showSecurity}
						<div class="px-3 pb-3 space-y-3 border-t">
							<div class="grid grid-cols-2 gap-3 pt-2">
								<div class="space-y-1.5">
									<Label for="containerUser" class="text-xs font-medium">User</Label>
									<Input id="containerUser" bind:value={containerUser} placeholder="user:group or UID:GID" class="h-9" />
								</div>
								<div class="space-y-1.5 flex flex-col justify-center pt-4">
									<div class="flex items-center space-x-2">
										<Checkbox id="privilegedMode" bind:checked={privilegedMode} />
										<Label for="privilegedMode" class="text-xs font-normal flex items-center gap-1">
											<Lock class="w-3 h-3 text-amber-500" />
											Privileged mode
										</Label>
									</div>
								</div>
							</div>

							<div class="space-y-2">
								<Label class="text-xs font-medium">Add capabilities</Label>
								<Select.Root type="single" value="" onValueChange={(v) => { addCapability('add', v); }}>
									<Select.Trigger class="h-9">
										<span class="text-muted-foreground">Select capability to add...</span>
									</Select.Trigger>
									<Select.Content>
										{#each commonCapabilities.filter(c => !capAdd.includes(c)) as cap}
											<Select.Item value={cap} label={cap} />
										{/each}
									</Select.Content>
								</Select.Root>
								{#if capAdd.length > 0}
									<div class="flex flex-wrap gap-1.5">
										{#each capAdd as cap}
											<Badge variant="outline" class="text-2xs bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
												+{cap}
												<button type="button" onclick={() => removeCapability('add', cap)} class="ml-1 hover:text-destructive">
													<X class="w-3 h-3" />
												</button>
											</Badge>
										{/each}
									</div>
								{/if}
							</div>

							<div class="space-y-2">
								<Label class="text-xs font-medium">Drop capabilities</Label>
								<Select.Root type="single" value="" onValueChange={(v) => { addCapability('drop', v); }}>
									<Select.Trigger class="h-9">
										<span class="text-muted-foreground">Select capability to drop...</span>
									</Select.Trigger>
									<Select.Content>
										{#each commonCapabilities.filter(c => !capDrop.includes(c)) as cap}
											<Select.Item value={cap} label={cap} />
										{/each}
									</Select.Content>
								</Select.Root>
								{#if capDrop.length > 0}
									<div class="flex flex-wrap gap-1.5">
										{#each capDrop as cap}
											<Badge variant="outline" class="text-2xs bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
												-{cap}
												<button type="button" onclick={() => removeCapability('drop', cap)} class="ml-1 hover:text-destructive">
													<X class="w-3 h-3" />
												</button>
											</Badge>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Health Section (Collapsible) -->
				<div class="border rounded-lg">
					<button
						type="button"
						onclick={() => showHealth = !showHealth}
						class="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
					>
						<div class="flex items-center gap-2">
							<HeartPulse class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-medium">Healthcheck</span>
							{#if healthcheckEnabled}
								<Badge variant="secondary" class="text-2xs">enabled</Badge>
							{/if}
						</div>
						{#if showHealth}
							<ChevronDown class="w-4 h-4 text-muted-foreground" />
						{:else}
							<ChevronRight class="w-4 h-4 text-muted-foreground" />
						{/if}
					</button>
					{#if showHealth}
						<div class="px-3 pb-3 space-y-3 border-t">
							<div class="flex items-center space-x-2 pt-2">
								<Checkbox id="healthcheckEnabled" bind:checked={healthcheckEnabled} />
								<Label for="healthcheckEnabled" class="text-xs font-normal">Enable healthcheck</Label>
							</div>
							{#if healthcheckEnabled}
								<div class="space-y-1.5">
									<Label for="healthcheckCommand" class="text-xs font-medium">Command</Label>
									<Input id="healthcheckCommand" bind:value={healthcheckCommand} placeholder="e.g., curl -f http://localhost/ || exit 1" class="h-9" />
								</div>
								<div class="grid grid-cols-4 gap-3">
									<div class="space-y-1.5">
										<Label for="healthcheckInterval" class="text-xs font-medium">Interval (s)</Label>
										<Input id="healthcheckInterval" type="number" bind:value={healthcheckInterval} min="1" class="h-9" />
									</div>
									<div class="space-y-1.5">
										<Label for="healthcheckTimeout" class="text-xs font-medium">Timeout (s)</Label>
										<Input id="healthcheckTimeout" type="number" bind:value={healthcheckTimeout} min="1" class="h-9" />
									</div>
									<div class="space-y-1.5">
										<Label for="healthcheckRetries" class="text-xs font-medium">Retries</Label>
										<Input id="healthcheckRetries" type="number" bind:value={healthcheckRetries} min="1" class="h-9" />
									</div>
									<div class="space-y-1.5">
										<Label for="healthcheckStartPeriod" class="text-xs font-medium">Start (s)</Label>
										<Input id="healthcheckStartPeriod" type="number" bind:value={healthcheckStartPeriod} min="0" class="h-9" />
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- DNS Section (Collapsible) -->
				<div class="border rounded-lg">
					<button
						type="button"
						onclick={() => showDns = !showDns}
						class="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
					>
						<div class="flex items-center gap-2">
							<Wifi class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-medium">DNS settings</span>
							{#if dnsServers.length > 0 || dnsSearch.length > 0}
								<Badge variant="secondary" class="text-2xs">configured</Badge>
							{/if}
						</div>
						{#if showDns}
							<ChevronDown class="w-4 h-4 text-muted-foreground" />
						{:else}
							<ChevronRight class="w-4 h-4 text-muted-foreground" />
						{/if}
					</button>
					{#if showDns}
						<div class="px-3 pb-3 space-y-3 border-t">
							<div class="space-y-2 pt-2">
								<Label class="text-xs font-medium">DNS servers</Label>
								<div class="flex gap-2">
									<Input
										bind:value={dnsInput}
										placeholder="e.g., 8.8.8.8"
										class="h-9 flex-1"
										onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDnsServer(); } }}
									/>
									<Button type="button" size="sm" variant="outline" onclick={addDnsServer} class="h-9">
										<Plus class="w-4 h-4" />
									</Button>
								</div>
								{#if dnsServers.length > 0}
									<div class="flex flex-wrap gap-1.5">
										{#each dnsServers as server}
											<Badge variant="secondary" class="text-2xs">
												{server}
												<button type="button" onclick={() => removeDnsServer(server)} class="ml-1 hover:text-destructive">
													<X class="w-3 h-3" />
												</button>
											</Badge>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Devices Section (Collapsible) -->
				<div class="border rounded-lg">
					<button
						type="button"
						onclick={() => showDevices = !showDevices}
						class="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
					>
						<div class="flex items-center gap-2">
							<HardDrive class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-medium">Devices</span>
							{#if deviceMappings.length > 0}
								<Badge variant="secondary" class="text-2xs">{deviceMappings.length}</Badge>
							{/if}
						</div>
						{#if showDevices}
							<ChevronDown class="w-4 h-4 text-muted-foreground" />
						{:else}
							<ChevronRight class="w-4 h-4 text-muted-foreground" />
						{/if}
					</button>
					{#if showDevices}
						<div class="px-3 pb-3 space-y-3 border-t">
							<div class="flex justify-end pt-2">
								<Button type="button" size="sm" variant="ghost" onclick={addDeviceMapping} class="h-7 text-xs">
									<Plus class="w-3.5 h-3.5 mr-1" />
									Add device
								</Button>
							</div>
							{#each deviceMappings as mapping, index}
								<div class="flex gap-2 items-center">
									<Input bind:value={mapping.hostPath} placeholder="/dev/sda" class="h-9 flex-1" />
									<Input bind:value={mapping.containerPath} placeholder="/dev/sda" class="h-9 flex-1" />
									<Button
										type="button"
										size="icon"
										variant="ghost"
										onclick={() => removeDeviceMapping(index)}
										class="h-9 w-9 text-muted-foreground hover:text-destructive"
									>
										<Trash2 class="w-4 h-4" />
									</Button>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Ulimits Section (Collapsible) -->
				<div class="border rounded-lg">
					<button
						type="button"
						onclick={() => showUlimits = !showUlimits}
						class="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
					>
						<div class="flex items-center gap-2">
							<Settings2 class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-medium">Ulimits</span>
							{#if ulimits.length > 0}
								<Badge variant="secondary" class="text-2xs">{ulimits.length}</Badge>
							{/if}
						</div>
						{#if showUlimits}
							<ChevronDown class="w-4 h-4 text-muted-foreground" />
						{:else}
							<ChevronRight class="w-4 h-4 text-muted-foreground" />
						{/if}
					</button>
					{#if showUlimits}
						<div class="px-3 pb-3 space-y-3 border-t">
							<div class="flex justify-end pt-2">
								<Button type="button" size="sm" variant="ghost" onclick={addUlimit} class="h-7 text-xs">
									<Plus class="w-3.5 h-3.5 mr-1" />
									Add ulimit
								</Button>
							</div>
							{#each ulimits as ulimit, index}
								<div class="flex gap-2 items-center">
									<Select.Root type="single" bind:value={ulimit.name}>
										<Select.Trigger class="w-32 h-9">
											<span>{ulimit.name}</span>
										</Select.Trigger>
										<Select.Content>
											{#each commonUlimits as name}
												<Select.Item value={name} label={name} />
											{/each}
										</Select.Content>
									</Select.Root>
									<Input bind:value={ulimit.soft} type="number" placeholder="Soft" class="h-9 flex-1" />
									<Input bind:value={ulimit.hard} type="number" placeholder="Hard" class="h-9 flex-1" />
									<Button
										type="button"
										size="icon"
										variant="ghost"
										onclick={() => removeUlimit(index)}
										class="h-9 w-9 text-muted-foreground hover:text-destructive"
									>
										<Trash2 class="w-4 h-4" />
									</Button>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Auto-update Settings -->
				<div class="space-y-3">
					<div class="flex items-center gap-2 pb-2 border-b">
						<RefreshCw class="w-4 h-4 text-muted-foreground" />
						<h3 class="text-sm font-semibold text-foreground">Auto-update</h3>
					</div>
					<AutoUpdateSettings
						bind:enabled={autoUpdateEnabled}
						bind:cronExpression={autoUpdateCronExpression}
						bind:vulnerabilityCriteria={vulnerabilityCriteria}
					/>
				</div>
		</div>

		<div class="flex justify-between gap-2 px-5 py-3 border-t bg-muted/30 shrink-0">
			<div>
				{#if activeTab === 'container' && hasCriticalOrHigh}
					<div class="flex items-center gap-2 text-amber-600 text-xs">
						<AlertTriangle class="w-4 h-4" />
						<span>Critical/high vulnerabilities found in image</span>
					</div>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button type="button" variant="outline" onclick={handleClose} disabled={loading || isPulling || isScanning}>
					Cancel
				</Button>
				<Button type="button" disabled={loading || isPulling || isScanning || activeTab !== 'container'} onclick={handleSubmit}>
					{#if loading}
						<Loader2 class="w-4 h-4 mr-2 animate-spin" />
						Creating...
					{:else}
						<Play class="w-4 h-4 mr-2" />
						Create container
					{/if}
				</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
