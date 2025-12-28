<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { TogglePill } from '$lib/components/ui/toggle-pill';
	import CronEditor from '$lib/components/cron-editor.svelte';
	import VulnerabilityCriteriaSelector, { type VulnerabilityCriteria } from '$lib/components/VulnerabilityCriteriaSelector.svelte';
	import { currentEnvironment } from '$lib/stores/environment';

	interface Props {
		enabled: boolean;
		cronExpression: string;
		vulnerabilityCriteria: VulnerabilityCriteria;
		onenablechange?: (enabled: boolean) => void;
		oncronchange?: (cron: string) => void;
		oncriteriachange?: (criteria: VulnerabilityCriteria) => void;
	}

	let {
		enabled = $bindable(),
		cronExpression = $bindable(),
		vulnerabilityCriteria = $bindable(),
		onenablechange,
		oncronchange,
		oncriteriachange
	}: Props = $props();

	let envHasScanning = $state(false);

	// Check if environment has scanning enabled
	$effect(() => {
		if (enabled) {
			checkScannerSettings();
		}
	});

	async function checkScannerSettings() {
		try {
			const envParam = $currentEnvironment ? `env=${$currentEnvironment.id}&` : '';
			const response = await fetch(`/api/settings/scanner?${envParam}settingsOnly=true`);
			if (response.ok) {
				const data = await response.json();
				envHasScanning = data.settings.scanner !== 'none';
			}
		} catch (err) {
			console.error('Failed to fetch scanner settings:', err);
			envHasScanning = false;
		}
	}
</script>

<div class="space-y-3">
	<div class="flex items-center gap-3">
		<Label class="text-xs font-normal">Enable automatic image updates</Label>
		<TogglePill
			bind:checked={enabled}
			onchange={(value) => onenablechange?.(value)}
		/>
	</div>

	{#if enabled}
		<CronEditor
			value={cronExpression}
			onchange={(cron) => {
				cronExpression = cron;
				oncronchange?.(cron);
			}}
		/>

		{#if envHasScanning}
			<div class="space-y-1.5">
				<Label class="text-xs font-medium">Vulnerability criteria</Label>
				<VulnerabilityCriteriaSelector
					bind:value={vulnerabilityCriteria}
					onchange={(v) => oncriteriachange?.(v)}
				/>
				<p class="text-xs text-muted-foreground">
					Block auto-updates if new image has vulnerabilities matching this criteria
				</p>
			</div>
		{/if}
	{/if}
</div>
