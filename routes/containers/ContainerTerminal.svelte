<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Terminal as TerminalIcon, X, ExternalLink, Shell, User } from 'lucide-svelte';

	// Dynamic imports for browser-only xterm
	let Terminal: any;
	let FitAddon: any;
	let WebLinksAddon: any;
	let xtermLoaded = $state(false);

	interface Props {
		open: boolean;
		containerId: string;
		containerName: string;
		onClose: () => void;
	}

	let { open = $bindable(), containerId, containerName, onClose }: Props = $props();

	let terminalRef: HTMLDivElement;
	let terminal: Terminal | null = null;
	let fitAddon: FitAddon | null = null;
	let ws: WebSocket | null = null;
	let connected = $state(false);
	let error = $state<string | null>(null);

	// Shell options
	const shellOptions = [
		{ value: '/bin/bash', label: 'Bash' },
		{ value: '/bin/sh', label: 'Shell (sh)' },
		{ value: '/bin/zsh', label: 'Zsh' },
		{ value: '/bin/ash', label: 'Ash (Alpine)' }
	];

	const userOptions = [
		{ value: 'root', label: 'root' },
		{ value: 'nobody', label: 'nobody' },
		{ value: '', label: 'Container default' }
	];

	let selectedShell = $state('/bin/bash');
	let selectedUser = $state('root');
	let showConfig = $state(true);

	function initTerminal() {
		if (!terminalRef || terminal) return;

		terminal = new Terminal({
			cursorBlink: true,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			fontSize: 14,
			theme: {
				background: '#0c0c0c',
				foreground: '#cccccc',
				cursor: '#ffffff',
				cursorAccent: '#000000',
				selectionBackground: '#264f78',
				black: '#0c0c0c',
				red: '#c50f1f',
				green: '#13a10e',
				yellow: '#c19c00',
				blue: '#0037da',
				magenta: '#881798',
				cyan: '#3a96dd',
				white: '#cccccc',
				brightBlack: '#767676',
				brightRed: '#e74856',
				brightGreen: '#16c60c',
				brightYellow: '#f9f1a5',
				brightBlue: '#3b78ff',
				brightMagenta: '#b4009e',
				brightCyan: '#61d6d6',
				brightWhite: '#f2f2f2'
			}
		});

		fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.loadAddon(new WebLinksAddon());

		terminal.open(terminalRef);
		fitAddon.fit();

		// Handle terminal input
		terminal.onData((data) => {
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'input', data }));
			}
		});

		// Handle resize
		terminal.onResize(({ cols, rows }) => {
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'resize', cols, rows }));
			}
		});

		// Connect to container
		connect();
	}

	function connect() {
		if (!terminal) return;

		error = null;
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${protocol}//${window.location.host}/api/containers/${containerId}/exec?shell=${encodeURIComponent(selectedShell)}&user=${encodeURIComponent(selectedUser)}`;

		terminal.writeln(`\x1b[90mConnecting to ${containerName}...\x1b[0m`);
		terminal.writeln(`\x1b[90mShell: ${selectedShell}, User: ${selectedUser || 'default'}\x1b[0m`);
		terminal.writeln('');

		ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			connected = true;
			terminal?.focus();
			// Send initial resize
			if (fitAddon && terminal) {
				const dims = fitAddon.proposeDimensions();
				if (dims) {
					ws?.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
				}
			}
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data);
				if (msg.type === 'output') {
					terminal?.write(msg.data);
				} else if (msg.type === 'error') {
					error = msg.message;
					terminal?.writeln(`\x1b[31mError: ${msg.message}\x1b[0m`);
				} else if (msg.type === 'exit') {
					terminal?.writeln('\x1b[90m\r\nSession ended.\x1b[0m');
					connected = false;
					// Close the dialog after a brief delay so user sees the message
					setTimeout(() => {
						handleClose();
					}, 500);
				}
			} catch (e) {
				terminal?.write(event.data);
			}
		};

		ws.onerror = (e) => {
			console.error('WebSocket error:', e);
			error = 'Connection error';
			terminal?.writeln('\x1b[31mConnection error\x1b[0m');
		};

		ws.onclose = () => {
			connected = false;
			terminal?.writeln('\x1b[90mDisconnected.\x1b[0m');
		};
	}

	function startSession() {
		if (!xtermLoaded) return;
		showConfig = false;
		// Wait for DOM update then init terminal
		setTimeout(() => {
			initTerminal();
		}, 100);
	}

	function openInNewWindow() {
		const params = new URLSearchParams({
			shell: selectedShell,
			user: selectedUser,
			name: containerName
		});
		const url = `/terminal/${containerId}?${params.toString()}`;
		window.open(url, `terminal_${containerId}`, 'width=900,height=600,resizable=yes,scrollbars=no');
		handleClose();
	}

	function disconnect() {
		if (ws) {
			ws.close();
			ws = null;
		}
	}

	function cleanup() {
		disconnect();
		if (terminal) {
			terminal.dispose();
			terminal = null;
		}
		fitAddon = null;
		showConfig = true;
		connected = false;
		error = null;
	}

	function handleClose() {
		cleanup();
		onClose();
	}

	// Handle window resize
	function handleResize() {
		if (fitAddon && terminal) {
			fitAddon.fit();
		}
	}

	onMount(async () => {
		window.addEventListener('resize', handleResize);

		// Dynamically load xterm modules (browser only)
		const xtermModule = await import('@xterm/xterm');
		const fitModule = await import('@xterm/addon-fit');
		const webLinksModule = await import('@xterm/addon-web-links');

		// Handle both ESM and CommonJS exports
		Terminal = xtermModule.Terminal || xtermModule.default?.Terminal;
		FitAddon = fitModule.FitAddon || fitModule.default?.FitAddon;
		WebLinksAddon = webLinksModule.WebLinksAddon || webLinksModule.default?.WebLinksAddon;

		// Load CSS
		await import('@xterm/xterm/css/xterm.css');
		xtermLoaded = true;
	});

	onDestroy(() => {
		window.removeEventListener('resize', handleResize);
		cleanup();
	});

	// Reset when dialog closes
	$effect(() => {
		if (!open) {
			cleanup();
		}
	});
</script>

<Dialog.Root bind:open onOpenChange={(isOpen) => !isOpen && handleClose()}>
	<Dialog.Content class="max-w-6xl w-[90vw] h-[80vh] flex flex-col p-0 gap-0">
		<Dialog.Header class="px-4 py-3 border-b flex-shrink-0">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<TerminalIcon class="w-5 h-5" />
					<Dialog.Title>Terminal - {containerName}</Dialog.Title>
					{#if connected}
						<span class="inline-flex items-center gap-1 text-xs text-green-500">
							<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
							Connected
						</span>
					{/if}
				</div>
				<button
					onclick={handleClose}
					class="p-1 rounded hover:bg-muted transition-colors"
				>
					<X class="w-4 h-4" />
				</button>
			</div>
		</Dialog.Header>

		{#if showConfig}
			<div class="flex-1 flex items-center justify-center p-6">
				<div class="w-full max-w-md space-y-6">
					<div class="text-center">
						<TerminalIcon class="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
						<h3 class="text-lg font-medium">Open terminal session</h3>
						<p class="text-sm text-muted-foreground mt-1">
							Configure the shell and user for this session
						</p>
					</div>

					<div class="space-y-4">
						<div class="space-y-2">
							<Label>Shell</Label>
							<Select.Root type="single" bind:value={selectedShell}>
								<Select.Trigger class="w-full h-10">
									<Shell class="w-4 h-4 mr-2 text-muted-foreground" />
									<span>{shellOptions.find(o => o.value === selectedShell)?.label || 'Select shell'}</span>
								</Select.Trigger>
								<Select.Content>
									{#each shellOptions as option}
										<Select.Item value={option.value} label={option.label}>
											<Shell class="w-4 h-4 mr-2 text-muted-foreground" />
											{option.label}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>

						<div class="space-y-2">
							<Label>User</Label>
							<Select.Root type="single" bind:value={selectedUser}>
								<Select.Trigger class="w-full h-10">
									<User class="w-4 h-4 mr-2 text-muted-foreground" />
									<span>{userOptions.find(o => o.value === selectedUser)?.label || 'Select user'}</span>
								</Select.Trigger>
								<Select.Content>
									{#each userOptions as option}
										<Select.Item value={option.value} label={option.label}>
											<User class="w-4 h-4 mr-2 text-muted-foreground" />
											{option.label}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					</div>

					<div class="flex gap-2">
						<Button onclick={startSession} class="flex-1" disabled={!xtermLoaded}>
							<TerminalIcon class="w-4 h-4 mr-2" />
							{xtermLoaded ? 'Connect' : 'Loading...'}
						</Button>
						<Button onclick={openInNewWindow} variant="outline" disabled={!xtermLoaded} title="Open in new window">
							<ExternalLink class="w-4 h-4" />
						</Button>
					</div>
				</div>
			</div>
		{:else}
			<div class="flex-1 bg-[#0c0c0c] p-2 overflow-hidden">
				<div bind:this={terminalRef} class="h-full w-full"></div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<style>
	:global(.xterm) {
		height: 100%;
		padding: 8px;
	}

	:global(.xterm-viewport) {
		overflow-y: auto !important;
	}
</style>
