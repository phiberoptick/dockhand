<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { QrCode, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { focusFirstInput } from '$lib/utils';

	interface Props {
		open: boolean;
		qrCode: string;
		secret: string;
		userId: number;
		onClose: () => void;
		onSuccess: () => void;
	}

	let { open = $bindable(), qrCode, secret, userId, onClose, onSuccess }: Props = $props();

	let token = $state('');
	let loading = $state(false);
	let error = $state('');

	function resetForm() {
		token = '';
		error = '';
	}

	async function verifyAndEnableMfa() {
		if (!token) {
			error = 'Please enter the verification code';
			return;
		}

		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/users/${userId}/mfa`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'verify', token })
			});

			if (response.ok) {
				onSuccess();
				onClose();
			} else {
				const data = await response.json();
				error = data.error || 'Invalid verification code';
			}
		} catch (e) {
			error = 'Failed to verify MFA';
		} finally {
			loading = false;
		}
	}

</script>

<Dialog.Root bind:open onOpenChange={(o) => { if (o) { resetForm(); focusFirstInput(); } else onClose(); }}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<QrCode class="w-5 h-5" />
				Setup two-factor authentication
			</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-4">
			{#if error}
				<Alert.Root variant="destructive">
					<TriangleAlert class="h-4 w-4" />
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}

			<p class="text-sm text-muted-foreground">
				Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
			</p>

			{#if qrCode}
				<div class="flex justify-center p-4 bg-white rounded-lg">
					<img src={qrCode} alt="MFA QR Code" class="w-48 h-48" />
				</div>
			{/if}

			<div class="space-y-2">
				<Label class="text-xs text-muted-foreground">Or enter this code manually:</Label>
				<code class="block p-2 bg-muted rounded text-sm font-mono break-all">{secret}</code>
			</div>

			<div class="space-y-2">
				<Label>Verification code</Label>
				<Input
					bind:value={token}
					placeholder="Enter 6-digit code"
					maxlength={6}
				/>
				<p class="text-xs text-muted-foreground">
					Enter the code from your authenticator app to verify setup
				</p>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={onClose}>Cancel</Button>
			<Button onclick={verifyAndEnableMfa} disabled={loading || !token}>
				{#if loading}
					<RefreshCw class="w-4 h-4 mr-1 animate-spin" />
				{:else}
					<ShieldCheck class="w-4 h-4 mr-1" />
				{/if}
				Enable MFA
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
