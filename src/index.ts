import { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { Environment, MCPRequest, MCPResponse } from './types'
import { TOOLS, executeTool } from './tools'

const app = new OpenAPIHono<{ Bindings: Environment }>()

const MCP_SERVER_NAME = 'crow-mcp-server'
const MCP_SERVER_VERSION = '1.0.0'

async function verifyApiKey(apiKey: string, env: Environment): Promise<string | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (env.INTERNAL_GATEWAY_KEY) {
      headers['X-Internal-Key'] = env.INTERNAL_GATEWAY_KEY;
    }
    const response = await fetch(`${env.API_GATEWAY_URL}/api/v1/auth/api-key/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key: apiKey }),
    })
    if (!response.ok)
      return null

    const data = (await response.json()) as {
      organizationId?: string | null;
      userId?: string | null;
      key?: { userId?: string; metadata?: { organizationId?: string } };
    }

    if (data.organizationId) return data.organizationId

    const userId = data.userId ?? data.key?.userId
    if (!userId)
      return null

    const userServiceUrl = env.USER_SERVICE_URL ?? `${env.API_GATEWAY_URL}`
    const userHeaders: Record<string, string> = {}
    if (env.INTERNAL_GATEWAY_KEY) {
      userHeaders['X-Internal-Key'] = env.INTERNAL_GATEWAY_KEY
    }
    const userResp = await fetch(`${userServiceUrl}/api/v1/users/by-auth-id/${encodeURIComponent(userId)}`, {
      headers: userHeaders,
    })
    if (!userResp.ok)
      return null

    const userData = (await userResp.json()) as { organizationId?: string }
    return userData.organizationId ?? null
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
app.get('/health', c => c.json({ status: 'healthy', service: 'crow-mcp-service', timestamp: new Date().toISOString() }))

app.get('/mcp', async (c) => {
  const apiKey = extractApiKey(c.req.raw)
  if (!apiKey) {
    return c.json(buildJsonRpcError(0, -32600, 'Missing API key. Provide Authorization: Bearer <key> or X-API-Key header.'), 401)
  }
  const orgId = await verifyApiKey(apiKey, c.env)
  if (!orgId) {
    return c.json(buildJsonRpcError(0, -32600, 'Invalid or unauthorized API key.'), 401)
  }
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
  apiKey: string,
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
    const result = await executeTool(toolName, toolArgs, orgId, env, apiKey)
    return c.json(
      buildJsonRpcSuccess(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }),
    )
  }
  catch (err) {
    console.error('[mcp] tool execution error:', err instanceof Error ? err.message : String(err))
    return c.json(buildJsonRpcError(id, -32603, 'Tool execution failed'), 500)
  }
}

app.post('/mcp', async (c) => {
  const apiKey = extractApiKey(c.req.raw)
  const orgId = await resolveOrganizationId(c.req.raw, c.env)

  if (!orgId && apiKey === null) {
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
      return handleToolsCall(id, params, orgId, c.env, c, apiKey ?? '')

    default:
      return c.json(buildJsonRpcError(id, -32601, `Method not found: ${method}`), 404)
  }
})

app.doc('/docs', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'CROW MCP Service',
  },
})

export default app
