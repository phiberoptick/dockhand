import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface TestConnectionRequest {
	connectionType: 'socket' | 'direct' | 'hawser-standard' | 'hawser-edge';
	socketPath?: string;
	host?: string;
	port?: number;
	protocol?: string;
	tlsCa?: string;
	tlsCert?: string;
	tlsKey?: string;
	tlsSkipVerify?: boolean;
	hawserToken?: string;
}

/**
 * Test Docker connection with provided configuration (without saving to database)
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const config: TestConnectionRequest = await request.json();

		// Build fetch options based on connection type
		let response: Response;

		if (config.connectionType === 'socket') {
			const socketPath = config.socketPath || '/var/run/docker.sock';
			response = await fetch('http://localhost/info', {
				// @ts-ignore - Bun supports unix socket
				unix: socketPath,
				signal: AbortSignal.timeout(10000)
			});
		} else if (config.connectionType === 'hawser-edge') {
			// Edge mode - cannot test directly, agent connects to us
			return json({
				success: true,
				info: {
					message: 'Edge mode environments are tested when the agent connects'
				},
				isEdgeMode: true
			});
		} else {
			// Direct or Hawser Standard - HTTP/HTTPS connection
			const protocol = config.protocol || 'http';
			const host = config.host;
			const port = config.port || 2375;

			if (!host) {
				return json({ success: false, error: 'Host is required' }, { status: 400 });
			}

			const url = `${protocol}://${host}:${port}/info`;
			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			};

			// Add Hawser token if present
			if (config.connectionType === 'hawser-standard' && config.hawserToken) {
				headers['X-Hawser-Token'] = config.hawserToken;
			}

			// For HTTPS with custom CA or skip verification, use subprocess to avoid Vite dev server TLS issues
			if (protocol === 'https' && (config.tlsCa || config.tlsSkipVerify)) {
				const fs = await import('node:fs');
				let tempCaPath = '';

				// Clean the certificate - remove leading/trailing whitespace from each line
				let cleanedCa = '';
				if (config.tlsCa && !config.tlsSkipVerify) {
					cleanedCa = config.tlsCa
						.split('\n')
						.map((line) => line.trim())
						.filter((line) => line.length > 0)
						.join('\n');

					tempCaPath = `/tmp/dockhand-ca-${Date.now()}.pem`;
					fs.writeFileSync(tempCaPath, cleanedCa);
				}

				// Build Bun script that runs outside Vite's process (Vite interferes with TLS)
				const tlsConfig = config.tlsSkipVerify
					? `tls: { rejectUnauthorized: false }`
					: `tls: { ca: await Bun.file('${tempCaPath}').text() }`;

				const scriptContent = `
const response = await fetch('https://${host}:${port}/info', {
  headers: ${JSON.stringify(headers)},
  ${tlsConfig}
});
const body = await response.text();
console.log(JSON.stringify({ status: response.status, body }));
`;
				const scriptPath = `/tmp/dockhand-test-${Date.now()}.ts`;
				fs.writeFileSync(scriptPath, scriptContent);

				const proc = Bun.spawn(['bun', scriptPath], { stdout: 'pipe', stderr: 'pipe' });
				const output = await new Response(proc.stdout).text();
				const stderr = await new Response(proc.stderr).text();

				// Cleanup temp files
				if (tempCaPath) {
					try { fs.unlinkSync(tempCaPath); } catch {}
				}
				try { fs.unlinkSync(scriptPath); } catch {}

				if (!output.trim()) {
					throw new Error(stderr || 'Empty response from TLS test subprocess');
				}
				const result = JSON.parse(output.trim());

				if (result.error) {
					throw new Error(result.error);
				}

				response = new Response(result.body, {
					status: result.status,
					headers: { 'Content-Type': 'application/json' }
				});
			} else {
				response = await fetch(url, {
					headers,
					signal: AbortSignal.timeout(10000)
				});
			}
		}

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Docker API error: ${response.status} - ${error}`);
		}

		const info = await response.json();

		// For Hawser Standard, also try to fetch Hawser info
		let hawserInfo = null;
		if (config.connectionType === 'hawser-standard' && config.host) {
			try {
				const protocol = config.protocol || 'http';
				const headers: Record<string, string> = {};
				if (config.hawserToken) {
					headers['X-Hawser-Token'] = config.hawserToken;
				}
				const hawserResp = await fetch(
					`${protocol}://${config.host}:${config.port || 2375}/_hawser/info`,
					{
						headers,
						signal: AbortSignal.timeout(5000)
					}
				);
				if (hawserResp.ok) {
					hawserInfo = await hawserResp.json();
				}
			} catch {
				// Hawser info fetch failed, continue without it
			}
		}

		return json({
			success: true,
			info: {
				serverVersion: info.ServerVersion,
				containers: info.Containers,
				images: info.Images,
				name: info.Name
			},
			hawser: hawserInfo
		});
	} catch (error) {
		const rawMessage = error instanceof Error ? error.message : 'Connection failed';
		console.error('Failed to test connection:', rawMessage);

		// Provide more helpful error messages
		let message = rawMessage;
		if (rawMessage.includes('401') || rawMessage.toLowerCase().includes('unauthorized')) {
			message = 'Invalid token - check that the Hawser token matches';
		} else if (rawMessage.includes('403') || rawMessage.toLowerCase().includes('forbidden')) {
			message = 'Access forbidden - check token permissions';
		} else if (rawMessage.includes('ECONNREFUSED') || rawMessage.includes('Connection refused')) {
			message = 'Connection refused - is Docker/Hawser running?';
		} else if (rawMessage.includes('ETIMEDOUT') || rawMessage.includes('timeout') || rawMessage.includes('Timeout')) {
			message = 'Connection timed out - check host and port';
		} else if (rawMessage.includes('ENOTFOUND') || rawMessage.includes('getaddrinfo')) {
			message = 'Host not found - check the hostname';
		} else if (rawMessage.includes('EHOSTUNREACH')) {
			message = 'Host unreachable - check network connectivity';
		} else if (rawMessage.includes('ENOENT') || rawMessage.includes('no such file')) {
			message = 'Socket not found - check the socket path';
		} else if (rawMessage.includes('EACCES') || rawMessage.includes('permission denied')) {
			message = 'Permission denied - check socket permissions';
		} else if (rawMessage.includes('typo in the url') || rawMessage.includes('Was there a typo')) {
			message = 'Connection failed - check host and port';
		} else if (rawMessage.includes('self signed certificate') || rawMessage.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE')) {
			message = 'TLS certificate error - provide CA certificate for self-signed certs';
		} else if (rawMessage.includes('certificate') || rawMessage.includes('SSL') || rawMessage.includes('TLS')) {
			message = 'TLS/SSL error - check certificate configuration';
		}

		return json({ success: false, error: message }, { status: 200 });
	}
};
