import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';

export default class MyWorker extends WorkerEntrypoint<Env> {
	/**
	 * A warm, friendly greeting from your new Workers MCP server.
	 * @param name {string} the name of the person we are greeting.
	 * @return {string} the contents of our greeting.
	 */
	sayHello(name: string) {
		return `Hello from an MCP Worker, ${name}!`;
	}

	/**
	 * @ignore
	 **/
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/' && request.method === 'GET') {
			return Response.json({ status: 'ok', service: 'mcp-service' });
		}

		return new ProxyToSelf(this as any).fetch(request);
	}
}
