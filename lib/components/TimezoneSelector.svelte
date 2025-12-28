<script lang="ts">
	import { ChevronsUpDown, Check, Globe } from 'lucide-svelte';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';

	interface Props {
		value: string;
		onchange?: (value: string) => void;
		id?: string;
		class?: string;
		placeholder?: string;
	}

	let {
		value = $bindable('UTC'),
		onchange,
		id,
		class: className,
		placeholder = 'Select timezone...'
	}: Props = $props();

	let open = $state(false);
	let searchQuery = $state('');

	// Common timezones to show at the top
	const commonTimezones = [
		'UTC',
		'America/New_York',
		'America/Chicago',
		'America/Denver',
		'America/Los_Angeles',
		'Europe/London',
		'Europe/Paris',
		'Europe/Berlin',
		'Europe/Warsaw',
		'Asia/Tokyo',
		'Asia/Shanghai',
		'Asia/Singapore',
		'Australia/Sydney'
	];

	// Get all timezones
	const allTimezones = Intl.supportedValuesOf('timeZone');

	// Other timezones (excluding common ones)
	const otherTimezones = allTimezones.filter((tz) => !commonTimezones.includes(tz));

	// Filter based on search query
	const filteredCommon = $derived(
		searchQuery
			? commonTimezones.filter((tz) => tz.toLowerCase().includes(searchQuery.toLowerCase()))
			: commonTimezones
	);

	const filteredOther = $derived(
		searchQuery
			? otherTimezones.filter((tz) => tz.toLowerCase().includes(searchQuery.toLowerCase()))
			: otherTimezones
	);

	function selectTimezone(tz: string) {
		value = tz;
		open = false;
		searchQuery = '';
		onchange?.(tz);
	}

	// Format timezone for display (show offset if available)
	function formatTimezone(tz: string): string {
		try {
			const now = new Date();
			const formatter = new Intl.DateTimeFormat('en-US', {
				timeZone: tz,
				timeZoneName: 'shortOffset'
			});
			const parts = formatter.formatToParts(now);
			const offsetPart = parts.find((p) => p.type === 'timeZoneName');
			if (offsetPart) {
				return `${tz} (${offsetPart.value})`;
			}
		} catch {
			// If formatting fails, just return the timezone name
		}
		return tz;
	}

	// Shorter display for trigger button
	function formatTimezoneShort(tz: string): string {
		return tz;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger asChild>
		{#snippet child({ props })}
			<Button
				variant="outline"
				role="combobox"
				aria-expanded={open}
				class={cn('w-full justify-between', className)}
				{...props}
				{id}
			>
				<span class="flex items-center gap-2 truncate">
					<Globe class="h-4 w-4 shrink-0 text-muted-foreground" />
					<span class="truncate">{value ? formatTimezoneShort(value) : placeholder}</span>
				</span>
				<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[350px] p-0" align="start">
		<Command.Root shouldFilter={false}>
			<Command.Input bind:value={searchQuery} placeholder="Search timezone..." />
			<Command.List class="max-h-[300px]">
				<Command.Empty>No timezone found.</Command.Empty>
				{#if filteredCommon.length > 0}
					<Command.Group heading="Common">
						{#each filteredCommon as tz}
							<Command.Item value={tz} onSelect={() => selectTimezone(tz)}>
								<Check class={cn('mr-2 h-4 w-4', value === tz ? 'opacity-100' : 'opacity-0')} />
								<span class="truncate">{formatTimezone(tz)}</span>
							</Command.Item>
						{/each}
					</Command.Group>
				{/if}
				{#if filteredOther.length > 0}
					<Command.Group heading="All timezones">
						{#each filteredOther as tz}
							<Command.Item value={tz} onSelect={() => selectTimezone(tz)}>
								<Check class={cn('mr-2 h-4 w-4', value === tz ? 'opacity-100' : 'opacity-0')} />
								<span class="truncate">{formatTimezone(tz)}</span>
							</Command.Item>
						{/each}
					</Command.Group>
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
