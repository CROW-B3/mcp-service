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

async function fetchJson(url: URL | string, apiKey: string, internalKey?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
  if (internalKey) {
    headers['X-Internal-Key'] = internalKey
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
  })
  if (!response.ok)
    throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  return response.json()
}

const VALID_SEARCH_MODES = new Set(['semantic', 'fts', 'hybrid'])
const VALID_SOURCE_TYPES = new Set(['web', 'cctv', 'social'])
const VALID_PERIODS = new Set(['daily', 'weekly', 'monthly', 'yearly'])
const MAX_QUERY_LENGTH = 512
const PRODUCT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

async function executeSearchProducts(
  args: Record<string, unknown>,
  orgId: string,
  baseUrl: string,
  apiKey: string,
  internalKey?: string,
): Promise<unknown> {
  const query = String(args.query ?? '').slice(0, MAX_QUERY_LENGTH)
  const limit = Math.min(Number(args.limit ?? 10), 100)
  const url = new URL(`${baseUrl}/api/v1/products/organization/${encodeURIComponent(orgId)}`)
  url.searchParams.set('pageSize', String(limit))
  if (query) {
    url.searchParams.set('q', query)
  }
  if (args.mode && VALID_SEARCH_MODES.has(args.mode as string)) {
    url.searchParams.set('mode', args.mode as string)
  }
  return fetchJson(url, apiKey, internalKey)
}

async function executeSearchInteractions(
  args: Record<string, unknown>,
  orgId: string,
  baseUrl: string,
  apiKey: string,
  internalKey?: string,
): Promise<unknown> {
  const url = new URL(`${baseUrl}/api/v1/interactions/organization/${orgId}`)
  if (args.query)
    url.searchParams.set('q', String(args.query).slice(0, MAX_QUERY_LENGTH))
  if (args.sourceType && VALID_SOURCE_TYPES.has(args.sourceType as string))
    url.searchParams.set('sourceType', args.sourceType as string)
  if (args.limit)
    url.searchParams.set('limit', String(Math.min(Number(args.limit), 100)))
  if (args.page)
    url.searchParams.set('page', String(args.page))
  return fetchJson(url, apiKey, internalKey)
}

async function executeGetInteractionSummary(orgId: string, baseUrl: string, apiKey: string, internalKey?: string): Promise<unknown> {
  const url = new URL(`${baseUrl}/api/v1/interactions/organization/${orgId}/summary`)
  return fetchJson(url, apiKey, internalKey)
}

async function executeSearchPatterns(
  args: Record<string, unknown>,
  orgId: string,
  baseUrl: string,
  apiKey: string,
  internalKey?: string,
): Promise<unknown> {
  const url = new URL(`${baseUrl}/api/v1/patterns/organization/${orgId}`)
  if (args.query)
    url.searchParams.set('q', String(args.query).slice(0, MAX_QUERY_LENGTH))
  if (args.period && VALID_PERIODS.has(args.period as string))
    url.searchParams.set('period', args.period as string)
  return fetchJson(url, apiKey, internalKey)
}

async function executeGetProductAiDescriptions(
  args: Record<string, unknown>,
  orgId: string,
  baseUrl: string,
  apiKey: string,
  internalKey?: string,
): Promise<unknown> {
  const productId = String(args.productId ?? '')
  if (!PRODUCT_ID_PATTERN.test(productId)) {
    throw new Error('Invalid productId format')
  }
  const url = new URL(`${baseUrl}/api/v1/products/${encodeURIComponent(productId)}/ai-descriptions`)
  url.searchParams.set('organizationId', orgId)
  return fetchJson(url, apiKey, internalKey)
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  orgId: string,
  env: Environment,
  apiKey: string,
): Promise<unknown> {
  const baseUrl = env.API_GATEWAY_URL
  const internalKey = env.INTERNAL_GATEWAY_KEY

  switch (toolName) {
    case 'crow_search_products':
      return executeSearchProducts(args, orgId, baseUrl, apiKey, internalKey)
    case 'crow_search_interactions':
      return executeSearchInteractions(args, orgId, baseUrl, apiKey, internalKey)
    case 'crow_get_interaction_summary':
      return executeGetInteractionSummary(orgId, baseUrl, apiKey, internalKey)
    case 'crow_search_patterns':
      return executeSearchPatterns(args, orgId, baseUrl, apiKey, internalKey)
    case 'crow_get_product_ai_descriptions':
      return executeGetProductAiDescriptions(args, orgId, baseUrl, apiKey, internalKey)
    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}
