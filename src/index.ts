/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { connect } from 'cloudflare:sockets';
export interface Env {
	UUID: string
	PATH: string
}
function getReader(a: Uint8Array): (len?: number) => Uint8Array {
	let hasRead = 0
	return function (len: number = 0): Uint8Array {
		if (len == 0) return a.subarray(hasRead)
		const d = a.subarray(hasRead, hasRead + len)
		hasRead += len
		return d
	}
}
function getUUID(a: Uint8Array): string {
	return [...a].map(c => c.toString(16).padStart(2, '0')).join('')
}
function getPort(a: Uint8Array): number {
	return a[0] * 256 + a[1]
}
function parseIPV4(a: Uint8Array): string {
	return [...a].join('.')
}
function parseIPV6(a: Uint8Array): string {
	// cf worker need the '[]'
	return '[' + Array.from({ length: 8 }, (_, i) =>
		(a[i * 2] << 8 | a[i * 2 + 1]).toString(16).padStart(4, '0')
	).join(':') + ']'

}
function parseDomain(a: Uint8Array): string {
	return String.fromCharCode(...a)
}
function getBuffer(a: Uint8Array): ArrayBuffer {
	return <ArrayBuffer>a.buffer.slice(a.byteOffset, a.byteLength + a.byteOffset)
}
export default {
	async fetch(request, env: Env, ctx): Promise<Response> {
		if (!env.UUID || !env.PATH || env.UUID.length == 0 || !env.PATH.startsWith('/')) {
			return new Response('uuid and path config is lacked or wrong')
		}
		// get config from the env
		const uuid = env.UUID.replaceAll('-', '')
		const path = env.PATH
		// if not the proxy request
		if (new URL(request.url).pathname != path || request.headers.get('Upgrade') != 'websocket') {
			return new Response('Hello World');
		}
		const [client, server] = Object.values(new WebSocketPair())
		server.accept()
		let socket: Socket | null = null, hasHandShake = false, ver = 0, addr = '', port = 0
		server.addEventListener('error', (err) => {
			socket?.close()
			server.close()
			console.log(err);
			return
		})
		server.addEventListener('close', () => {
			socket?.close()
			console.log('close', addr, port);
		})
		server.addEventListener('message', async (d: { data: ArrayBuffer }) => {
			// has hand shake
			if (hasHandShake) {
				server!.send(d.data)
				return
			}
			// start hand shake
			const read = getReader(new Uint8Array(d.data))
			ver = read(1)[0]
			if (ver != 0) {
				console.log('ver', ver);
				server.close()
				return
			}
			const hisUUID = getUUID(read(16))
			if (uuid != hisUUID) {
				console.log('uuid', hisUUID);
				server.close()
				return
			}
			const mLen = read(1)[0]
			if (mLen != 0) {
				console.log('mLen', mLen);
				server.close()
				return
			}
			// ignore the more information
			read(mLen)
			const cmd = read(1)[0]
			if (cmd != 1) {
				console.log('cmd', cmd);
				server.close()
				return
			}
			port = getPort(read(2))
			const addrType = read(1)[0]
			switch (addrType) {
				case 1:
					addr = parseIPV4(read(4))
					break;
				case 2:
					const domainLen = read(1)[0]
					addr = parseDomain(read(domainLen))
					break;
				case 3:
					addr = parseIPV6(read(16))
					break;
				default:
					console.log('addrType', addrType);
					server.close()
					return
			}
			server.send(new Uint8Array([ver, 0]).buffer)
			console.log('connect', addr, port);
			socket = connect({ hostname: addr, port: port })
			hasHandShake = true
			const reader = socket.readable.getReader()
			const writer = socket.writable.getWriter()
			readFromTarget(reader, server)
			writer.write(getBuffer(read()))
		})
		return new Response(null, { status: 101, webSocket: client })
	},
} satisfies ExportedHandler<Env>;
async function readFromTarget(reader: ReadableStreamDefaultReader, server: WebSocket) {
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		server.send(getBuffer(value))
	}
}