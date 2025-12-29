<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { CheckCircle2, XCircle, Download, ShieldCheck, ShieldAlert, ShieldX, ArrowBigRight } from 'lucide-svelte';
	import { currentEnvironment } from '$lib/stores/environment';
	import PullTab from '$lib/components/PullTab.svelte';
	import ScanTab from '$lib/components/ScanTab.svelte';
	import type { ScanResult } from '$lib/components/ScanTab.svelte';

	interface Props {
		open: boolean;
		imageName: string;
		envHasScanning?: boolean;
		envId?: number | null;
		onClose?: () => void;
		onComplete?: () => void;
	}

	let { open = $bindable(), imageName, envHasScanning = false, envId, onClose, onComplete }: Props = $props();

	// Component refs
	let pullTabRef = $state<PullTab | undefined>();
	let scanTabRef = $state<ScanTab | undefined>();

	// Tab state
	let activeTab = $state<'pull' | 'scan'>('pull');

	// Track status from components
	let pullStatus = $state<'idle' | 'pulling' | 'complete' | 'error'>('idle');
	let scanStatus = $state<'idle' | 'scanning' | 'complete' | 'error'>('idle');
	let scanResults = $state<ScanResult[]>([]);
	let hasStarted = $state(false);
	let pullStarted = $state(false);
	let scanStarted = $state(false);
	let autoSwitchedToScan = $state(false);

	$effect(() => {
		if (open && imageName && !hasStarted) {
			hasStarted = true;
			pullStarted = true;
		}
		if (!open && hasStarted) {
			// Reset when modal closes
			hasStarted = false;
			pullStarted = false;
			scanStarted = false;
			pullStatus = 'idle';
			scanStatus = 'idle';
			scanResults = [];
			activeTab = 'pull';
			autoSwitchedToScan = false;
			pullTabRef?.reset();
			scanTabRef?.reset();
		}
	});

	function handlePullComplete() {
		pullStatus = 'complete';
		if (envHasScanning && !autoSwitchedToScan) {
			autoSwitchedToScan = true;
			scanStarted = true;
			activeTab = 'scan';
			setTimeout(() => scanTabRef?.startScan(), 100);
		} else {
			onComplete?.();
		}
	}

	function handlePullError(_error: string) {
		pullStatus = 'error';
	}

	function handlePullStatusChange(status: 'idle' | 'pulling' | 'complete' | 'error') {
		pullStatus = status;
	}

	function handleScanComplete(results: ScanResult[]) {
		scanResults = results;
		onComplete?.();
	}

	function handleScanError(_error: string) {
		// Error is handled by ScanTab display
	}

	function handleScanStatusChange(status: 'idle' | 'scanning' | 'complete' | 'error') {
		scanStatus = status;
	}

	function handleClose() {
		if (pullStatus !== 'pulling' && scanStatus !== 'scanning') {
			open = false;
			onClose?.();
		}
	}

	const totalVulnerabilities = $derived(
		scanResults.reduce((total, r) => total + r.vulnerabilities.length, 0)
	);

	const hasCriticalOrHigh = $derived(
		scanResults.some(r => r.summary.critical > 0 || r.summary.high > 0)
	);

	const isProcessing = $derived(pullStatus === 'pulling' || scanStatus === 'scanning');

	const effectiveEnvId = $derived(envId ?? $currentEnvironment?.id ?? null);

	const title = $derived(envHasScanning ? 'Pull & scan image' : 'Pull image');
</script>

<Dialog.Root bind:open onOpenChange={handleClose}>
	<Dialog.Content class="max-w-4xl h-[85vh] flex flex-col">
		<Dialog.Header class="shrink-0 pb-2">
			<Dialog.Title class="flex items-center gap-2">
				{#if scanStatus === 'complete' && scanResults.length > 0}
					{#if hasCriticalOrHigh}
						<ShieldX class="w-5 h-5 text-red-500" />
					{:else if totalVulnerabilities > 0}
						<ShieldAlert class="w-5 h-5 text-yellow-500" />
					{:else}
						<ShieldCheck class="w-5 h-5 text-green-500" />
					{/if}
				{:else if pullStatus === 'complete' && !envHasScanning}
					<CheckCircle2 class="w-5 h-5 text-green-500" />
				{:else if pullStatus === 'error' || scanStatus === 'error'}
					<XCircle class="w-5 h-5 text-red-500" />
				{:else}
					<Download class="w-5 h-5" />
				{/if}
				{title}
				<code class="text-sm font-normal bg-muted px-1.5 py-0.5 rounded ml-1">{imageName}</code>
			</Dialog.Title>
		</Dialog.Header>

		<!-- Tabs -->
		{#if envHasScanning}
			<div class="flex items-center border-b shrink-0">
				<button
					class="px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer {activeTab === 'pull' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
					onclick={() => activeTab = 'pull'}
					disabled={isProcessing}
				>
					<Download class="w-3.5 h-3.5 inline mr-1.5" />
					Pull
					{#if pullStatus === 'complete'}
						<CheckCircle2 class="w-3.5 h-3.5 inline ml-1 text-green-500" />
					{:else if pullStatus === 'error'}
						<XCircle class="w-3.5 h-3.5 inline ml-1 text-red-500" />
					{:else}
						<CheckCircle2 class="w-3.5 h-3.5 inline ml-1 invisible" />
					{/if}
				</button>
				<ArrowBigRight class="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
				<button
					class="px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer {activeTab === 'scan' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
					onclick={() => activeTab = 'scan'}
					disabled={isProcessing || pullStatus !== 'complete'}
				>
					{#if scanStatus === 'complete' && scanResults.length > 0}
						{#if hasCriticalOrHigh}
							<ShieldX class="w-3.5 h-3.5 inline mr-1.5 text-red-500" />
						{:else if totalVulnerabilities > 0}
							<ShieldAlert class="w-3.5 h-3.5 inline mr-1.5 text-yellow-500" />
						{:else}
							<ShieldCheck class="w-3.5 h-3.5 inline mr-1.5 text-green-500" />
						{/if}
					{:else}
						<ShieldCheck class="w-3.5 h-3.5 inline mr-1.5" />
					{/if}
					Scan
					{#if scanStatus === 'complete'}
						<CheckCircle2 class="w-3.5 h-3.5 inline ml-1 text-green-500" />
					{:else if scanStatus === 'error'}
						<XCircle class="w-3.5 h-3.5 inline ml-1 text-red-500" />
					{:else}
						<CheckCircle2 class="w-3.5 h-3.5 inline ml-1 invisible" />
					{/if}
				</button>
			</div>
		{/if}

		<div class="flex-1 min-h-0 flex flex-col overflow-hidden py-2">
			<!-- Pull Tab -->
			<div class="flex flex-col flex-1 min-h-0" class:hidden={activeTab !== 'pull'}>
				<PullTab
					bind:this={pullTabRef}
					{imageName}
					envId={effectiveEnvId}
					showImageInput={false}
					autoStart={pullStarted && pullStatus === 'idle'}
					onComplete={handlePullComplete}
					onError={handlePullError}
					onStatusChange={handlePullStatusChange}
				/>
			</div>

			<!-- Scan Tab -->
			{#if envHasScanning}
				<div class="flex flex-col flex-1 min-h-0" class:hidden={activeTab !== 'scan'}>
					<ScanTab
						bind:this={scanTabRef}
						{imageName}
						envId={effectiveEnvId}
						autoStart={scanStarted && scanStatus === 'idle'}
						onComplete={handleScanComplete}
						onError={handleScanError}
						onStatusChange={handleScanStatusChange}
					/>
				</div>
			{/if}
		</div>

		<Dialog.Footer class="shrink-0 flex justify-end">
			<Button
				variant={pullStatus === 'complete' || scanStatus === 'complete' ? 'default' : 'secondary'}
				onclick={handleClose}
				disabled={isProcessing}
			>
				{#if pullStatus === 'pulling'}
					Pulling...
				{:else if scanStatus === 'scanning'}
					Scanning...
				{:else}
					Close
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
