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

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const uuid = '04e5d30d-7ccb-49b3-ad5f-4b07d45d8dfd'.replaceAll('-', '')
		const path = '/04e5d30d'
		if (new URL(request.url).pathname != path) {
			return new Response('Hello World!');
		}
		const [client, server] = Object.values(new WebSocketPair())
		if (request.headers.get('Upgrade') != 'websocket') {
			return new Response(null)
		}
		server.accept()
		server.addEventListener('message', (d) => {
			const a = new Uint8Array(d.data)
			const b = a.subarray(1, 17)
			if (uuid != Array.from(b).map(c => c.toString(16).padStart(2, '0')).join('')) {
				server.close()
				return
			}
			const m = a[17]
			console.log(m);
			const cmd = a[18]
			const portArray = a.subarray(19 + m, 19 + m + 2)
			const port = portArray[0] * 256 + portArray[1]
			console.log(port)
			const addrType = a[20 + m]
			server.close()
		})
		return new Response(null, { status: 101, webSocket: client })
	},
} satisfies ExportedHandler<Env>;
