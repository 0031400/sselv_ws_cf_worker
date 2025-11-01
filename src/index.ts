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
export default {

	async fetch(request, env, ctx): Promise<Response> {
		const uuid = '04e5d30d-7ccb-49b3-ad5f-4b07d45d8dfd'.replaceAll('-', '')
		const path = '/04e5d30d'
		if (new URL(request.url).pathname != path || request.headers.get('Upgrade') != 'websocket') {
			return new Response('Hello World!');
		}
		const [client, server] = Object.values(new WebSocketPair())
		server.accept()
		let socket: Socket | null = null, reader: ReadableStreamDefaultReader | null = null, writer: WritableStreamDefaultWriter | null = null, has = false, ver = 0, addr = '', port = 0
		server.addEventListener('error', (err) => {
			server.close()
			console.log(err);
			return
		})
		server.addEventListener('message', async (d) => {
			let a = new Uint8Array(d.data)
			if (!has) {
				ver = a[0]
				if (ver != 0) {
					console.log('ver', ver);
					server.close()
					return
				}
				a = a.subarray(1)
				const hisUUID = Array.from(a.subarray(0, 16)).map(c => c.toString(16).padStart(2, '0')).join('')
				a = a.subarray(16)
				if (uuid != hisUUID) {
					console.log('uudi', hisUUID);
					server.close()
					return
				}
				const mLen = a[0]
				if (mLen != 0) {
					console.log('mLen', mLen);
					server.close()
					return
				}
				a = a.subarray(1 + mLen)
				const cmd = a[0]
				if (cmd != 1) {
					console.log('cmd', cmd);
					server.close()
					return
				}
				a = a.subarray(1)
				port = a[0] * 256 + a[1]
				a = a.subarray(2)
				const addrType = a[0]
				a = a.subarray(1)
				switch (addrType) {
					case 1:
						addr = `${a[0]}.${a[1]}.${a[2]}.${a[3]}`
						break;
					case 2:
						const domainLen = a[0]
						a = a.subarray(1)
						const domainArray = a.subarray(0, domainLen)
						a = a.subarray(domainLen)
						addr = String.fromCharCode(...domainArray)
						break;
					default:
						server.close()
						return
				}
				server.send(new Uint8Array([ver, 0]).buffer)
				console.log('connect', addr, port);
				socket = connect({ hostname: addr, port: port })
				writer = socket.writable.getWriter()
				reader = socket.readable.getReader()
				has = true
				one(reader, server)
				writer!.write(a.buffer.slice(a.byteOffset, a.byteLength + a.byteOffset))
			} else {
				await writer!.write(d.data)
			}
		})
		server.addEventListener('close', () => {
			console.log('close', addr, port);
			socket?.close()
		})
		return new Response(null, { status: 101, webSocket: client })
	},
} satisfies ExportedHandler<Env>;
async function one(reader: ReadableStreamDefaultReader | null, server: WebSocket) {
	try {
		while (true) {
			const { done, value } = await reader!.read()
			if (done) {
				break
			}
			server.send(value.buffer.slice(value.byteOffset, value.byteLength + value.byteOffset))
		}
	} catch (err) {
		console.log(err);
	}
}