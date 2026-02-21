import type { Environment, MCPTool } from './types'

export const TOOLS: MCPTool[] = [
  {
    name: 'crow_search_products',
    description: 'Search the organization\'s product catalog using semantic or full-text search',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query string',
        },
        mode: {
          type: 'string',
          enum: ['semantic', 'fts', 'hybrid'],
          description: 'Search mode: semantic (vector), fts (full-text), or hybrid',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'crow_search_interactions',
    description: 'Search customer interaction history filtered by source type and optional text query',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text search query to filter interactions by content',
        },
        sourceType: {
          type: 'string',
          enum: ['web', 'cctv', 'social'],
          description: 'Filter interactions by source channel type',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of interactions to return',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination',
        },
      },
    },
  },
  {
    name: 'crow_get_interaction_summary',
    description: 'Get interaction counts broken down by channel (web, CCTV, social)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'crow_search_patterns',
    description: 'Search behavioral pattern analysis and AI-generated insights',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text search query to filter pattern insights',
        },
        period: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly', 'yearly'],
          description: 'Time period for pattern analysis',
        },
      },
    },
  },
  {
    name: 'crow_get_product_ai_descriptions',
    description: 'Get AI-generated descriptions for a specific product including visual analysis',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID to get descriptions for',
        },
      },
      required: ['productId'],
    },
  },
]

async function fetchJson(url: URL | string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok)
    throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  return response.json()
}

async function executeSearchProducts(
  args: Record<string, unknown>,
  orgId: string,
  baseUrl: string,
): Promise<unknown> {
  const url = new URL(`${baseUrl}/api/v1/products/search`)
  url.searchParams.set('q', args.query as string)
  url.searchParams.set('organizationId', orgId)
  url.searchParams.set('mode', (args.mode as string) ?? 'hybrid')
  url.searchParams.set('limit', String(args.limit ?? 10))
  return fetchJson(url)
}

async function executeSearchInteractions(
  args: Record<string, unknown>,
  orgId: string,
  baseUrl: string,
): Promise<unknown> {
  const url = new URL(`${baseUrl}/api/v1/interactions/organization/${orgId}`)
  if (args.query)
    url.searchParams.set('q', args.query as string)
  if (args.sourceType)
    url.searchParams.set('sourceType', args.sourceType as string)
  if (args.limit)
    url.searchParams.set('limit', String(args.limit))
  if (args.page)
    url.searchParams.set('page', String(args.page))
  return fetchJson(url)
}

async function executeGetInteractionSummary(orgId: string, baseUrl: string): Promise<unknown> {
  const url = new URL(`${baseUrl}/api/v1/interactions/organization/${orgId}/summary`)
  return fetchJson(url)
}

async function executeSearchPatterns(
  args: Record<string, unknown>,
  orgId: string,
  baseUrl: string,
): Promise<unknown> {
  const url = new URL(`${baseUrl}/api/v1/patterns/organization/${orgId}`)
  if (args.query)
    url.searchParams.set('q', args.query as string)
  if (args.period)
    url.searchParams.set('period', args.period as string)
  return fetchJson(url)
}

async function executeGetProductAiDescriptions(
  args: Record<string, unknown>,
  baseUrl: string,
): Promise<unknown> {
  const productId = args.productId as string
  return fetchJson(`${baseUrl}/api/v1/products/${productId}/ai-descriptions`)
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  orgId: string,
  env: Environment,
): Promise<unknown> {
  const baseUrl = env.API_GATEWAY_URL

  switch (toolName) {
    case 'crow_search_products':
      return executeSearchProducts(args, orgId, baseUrl)
    case 'crow_search_interactions':
      return executeSearchInteractions(args, orgId, baseUrl)
    case 'crow_get_interaction_summary':
      return executeGetInteractionSummary(orgId, baseUrl)
    case 'crow_search_patterns':
      return executeSearchPatterns(args, orgId, baseUrl)
    case 'crow_get_product_ai_descriptions':
      return executeGetProductAiDescriptions(args, baseUrl)
    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}
