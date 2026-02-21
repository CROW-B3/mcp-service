import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Environment, MCPRequest, MCPResponse } from './types'
import { TOOLS, executeTool } from './tools'

const app = new Hono<{ Bindings: Environment }>()

const MCP_SERVER_NAME = 'crow-mcp-server'
const MCP_SERVER_VERSION = '1.0.0'

async function verifyApiKey(apiKey: string, env: Environment): Promise<string | null> {
  try {
    const response = await fetch(`${env.API_GATEWAY_URL}/api/v1/auth/api-key/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: apiKey }),
    })
    if (!response.ok)
      return null
    const data = (await response.json()) as { key?: { metadata?: { organizationId?: string } } }
    return data.key?.metadata?.organizationId ?? null
  }
  catch {
    return null
  }
}

function extractApiKey(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer '))
    return authHeader.slice(7).trim()

  const xApiKey = request.headers.get('X-API-Key')
  if (xApiKey)
    return xApiKey.trim()

  return null
}

function buildJsonRpcSuccess(id: string | number, result: unknown): MCPResponse {
  return { jsonrpc: '2.0', id, result }
}

function buildJsonRpcError(
  id: string | number,
  code: number,
  message: string,
): MCPResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

app.get('/', c => c.json({ status: 'ok', service: 'crow-mcp-service' }))

app.get('/mcp', (c) => {
  return c.json({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    description: 'CROW AI MCP server exposing product catalog, interaction history, and behavioral pattern data.',
    tools: TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
    capabilities: {
      tools: {},
    },
  })
})

async function resolveOrganizationId(request: Request, env: Environment): Promise<string | null> {
  const apiKey = extractApiKey(request)
  if (!apiKey)
    return null
  return verifyApiKey(apiKey, env)
}

async function handleToolsCall(
  id: string | number,
  params: unknown,
  orgId: string,
  env: Environment,
  c: Context<{ Bindings: Environment }>,
): Promise<Response> {
  const callParams = params as { name?: string, arguments?: Record<string, unknown> }
  const toolName = callParams?.name
  const toolArgs = callParams?.arguments ?? {}

  if (!toolName)
    return c.json(buildJsonRpcError(id, -32602, 'Invalid params: missing tool name'), 400)

  const isKnownTool = TOOLS.some(tool => tool.name === toolName)
  if (!isKnownTool)
    return c.json(buildJsonRpcError(id, -32601, `Method not found: unknown tool "${toolName}"`), 404)

  try {
    const result = await executeTool(toolName, toolArgs, orgId, env)
    return c.json(
      buildJsonRpcSuccess(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }),
    )
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed'
    return c.json(buildJsonRpcError(id, -32603, `Internal error: ${message}`), 500)
  }
}

app.post('/mcp', async (c) => {
  const orgId = await resolveOrganizationId(c.req.raw, c.env)

  if (!orgId && extractApiKey(c.req.raw) === null) {
    return c.json(
      buildJsonRpcError(0, -32600, 'Missing API key. Provide Authorization: Bearer <key> or X-API-Key header.'),
      401,
    )
  }

  if (!orgId) {
    return c.json(
      buildJsonRpcError(0, -32600, 'Invalid or unauthorized API key.'),
      401,
    )
  }

  let body: MCPRequest
  try {
    body = await c.req.json<MCPRequest>()
  }
  catch {
    return c.json(buildJsonRpcError(0, -32700, 'Parse error: invalid JSON'), 400)
  }

  if (body.jsonrpc !== '2.0' || !body.method)
    return c.json(buildJsonRpcError(body.id ?? 0, -32600, 'Invalid Request: missing jsonrpc or method'), 400)

  const { id, method, params } = body

  switch (method) {
    case 'initialize':
      return c.json(
        buildJsonRpcSuccess(id, {
          protocolVersion: '2024-11-05',
          serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
          capabilities: { tools: {} },
        }),
      )

    case 'tools/list':
      return c.json(buildJsonRpcSuccess(id, { tools: TOOLS }))

    case 'tools/call':
      return handleToolsCall(id, params, orgId, c.env, c)

    default:
      return c.json(buildJsonRpcError(id, -32601, `Method not found: ${method}`), 404)
  }
})

export default app
