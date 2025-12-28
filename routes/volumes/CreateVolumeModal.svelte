<script lang="ts" module>
	type KeyValue = { key: string; value: string };
</script>

<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Plus, Trash2, HardDrive, Database, Server } from 'lucide-svelte';

	const VOLUME_DRIVERS = [
		{ value: 'local', label: 'Local', description: 'Default local driver', icon: HardDrive },
		{ value: 'nfs', label: 'NFS', description: 'Network file system', icon: Server },
		{ value: 'cifs', label: 'CIFS', description: 'Windows/SMB shares', icon: Database }
	];
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';
	import { focusFirstInput } from '$lib/utils';

	interface Props {
		open: boolean;
		onClose?: () => void;
		onSuccess?: () => void;
	}

	let { open = $bindable(), onClose, onSuccess }: Props = $props();

	// Form state
	let name = $state('');
	let driver = $state('local');
	let driverOpts = $state<KeyValue[]>([]);
	let labels = $state<KeyValue[]>([]);

	let creating = $state(false);
	let error = $state('');
	let errors = $state<{ name?: string }>({});

	function addDriverOpt() {
		driverOpts = [...driverOpts, { key: '', value: '' }];
	}

	function removeDriverOpt(index: number) {
		driverOpts = driverOpts.filter((_, i) => i !== index);
	}

	function addLabel() {
		labels = [...labels, { key: '', value: '' }];
	}

	function removeLabel(index: number) {
		labels = labels.filter((_, i) => i !== index);
	}

	function resetForm() {
		name = '';
		driver = 'local';
		driverOpts = [];
		labels = [];
		error = '';
		errors = {};
	}

	async function handleCreate() {
		errors = {};

		if (!name.trim()) {
			errors.name = 'Volume name is required';
			return;
		}

		creating = true;
		error = '';

		try {
			const envId = $currentEnvironment?.id ?? null;

			// Convert key-value arrays to objects
			const driverOptsObj: Record<string, string> = {};
			driverOpts.forEach(({ key, value }) => {
				if (key && value) {
					driverOptsObj[key] = value;
				}
			});

			const labelsObj: Record<string, string> = {};
			labels.forEach(({ key, value }) => {
				if (key && value) {
					labelsObj[key] = value;
				}
			});

			const response = await fetch(appendEnvParam('/api/volumes', envId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: name.trim(),
					driver,
					driverOpts: driverOptsObj,
					labels: labelsObj
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.details || data.error || 'Failed to create volume');
			}

			resetForm();
			open = false;
			onSuccess?.();
		} catch (err: any) {
			error = err.message || 'Failed to create volume';
			console.error('Failed to create volume:', err);
		} finally {
			creating = false;
		}
	}

	function handleOpenChange(newOpen: boolean) {
		if (!newOpen && !creating) {
			resetForm();
		}
		open = newOpen;
	}
</script>

<Dialog.Root bind:open onOpenChange={(isOpen) => { if (isOpen) focusFirstInput(); handleOpenChange(isOpen); }}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Create volume</Dialog.Title>
		</Dialog.Header>

		<div class="space-y-4">
			{#if error}
				<div class="text-sm text-red-600 dark:text-red-400 p-2 bg-red-50 dark:bg-red-950 rounded">
					{error}
				</div>
			{/if}

			<!-- Volume Name -->
			<div class="space-y-2">
				<Label for="volume-name">Volume name *</Label>
				<Input
					id="volume-name"
					bind:value={name}
					placeholder="my-volume"
					disabled={creating}
					class={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
					oninput={() => errors.name = undefined}
				/>
				{#if errors.name}
					<p class="text-xs text-destructive">{errors.name}</p>
				{/if}
			</div>

			<!-- Driver -->
			<div class="space-y-2">
				<Label for="driver">Driver</Label>
				<Select.Root type="single" bind:value={driver} disabled={creating}>
					<Select.Trigger class="w-full h-9">
						{@const selectedDriver = VOLUME_DRIVERS.find(d => d.value === driver)}
						<span class="flex items-center">
							{#if selectedDriver}
								<svelte:component this={selectedDriver.icon} class="w-4 h-4 mr-2 text-muted-foreground" />
								{selectedDriver.label}
							{:else}
								Select driver
							{/if}
						</span>
					</Select.Trigger>
					<Select.Content>
						{#each VOLUME_DRIVERS as d}
							<Select.Item value={d.value} label={d.label}>
								<svelte:component this={d.icon} class="w-4 h-4 mr-2 text-muted-foreground" />
								<div class="flex flex-col">
									<span>{d.label}</span>
									<span class="text-xs text-muted-foreground">{d.description}</span>
								</div>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				<p class="text-xs text-muted-foreground">
					Volume driver to use (local is default)
				</p>
			</div>

			<!-- Driver Options -->
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<Label>Driver options</Label>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onclick={addDriverOpt}
						disabled={creating}
					>
						<Plus class="w-3 h-3 mr-1" />
						Add option
					</Button>
				</div>
				{#if driverOpts.length > 0}
					<div class="space-y-2">
						{#each driverOpts as opt, i}
							<div class="flex gap-2">
								<Input
									bind:value={opt.key}
									placeholder="Key"
									disabled={creating}
									class="flex-1"
								/>
								<Input
									bind:value={opt.value}
									placeholder="Value"
									disabled={creating}
									class="flex-1"
								/>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									onclick={() => removeDriverOpt(i)}
									disabled={creating}
								>
									<Trash2 class="w-4 h-4" />
								</Button>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-xs text-muted-foreground">No driver options configured</p>
				{/if}
			</div>

			<!-- Labels -->
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<Label>Labels</Label>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onclick={addLabel}
						disabled={creating}
					>
						<Plus class="w-3 h-3 mr-1" />
						Add label
					</Button>
				</div>
				{#if labels.length > 0}
					<div class="space-y-2">
						{#each labels as label, i}
							<div class="flex gap-2">
								<Input
									bind:value={label.key}
									placeholder="Key"
									disabled={creating}
									class="flex-1"
								/>
								<Input
									bind:value={label.value}
									placeholder="Value"
									disabled={creating}
									class="flex-1"
								/>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									onclick={() => removeLabel(i)}
									disabled={creating}
								>
									<Trash2 class="w-4 h-4" />
								</Button>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-xs text-muted-foreground">No labels configured</p>
				{/if}
			</div>

			<Dialog.Footer class="pt-4">
				<Button variant="outline" onclick={() => (open = false)} disabled={creating}>
					Cancel
				</Button>
				<Button onclick={handleCreate} disabled={creating}>
					{creating ? 'Creating...' : 'Create volume'}
				</Button>
			</Dialog.Footer>
		</div>
	</Dialog.Content>
</Dialog.Root>
