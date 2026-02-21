export interface Environment {
  API_GATEWAY_URL: string
  ENVIRONMENT: string
  DB: D1Database
  R2_BUCKET: R2Bucket
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface MCPRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

export interface MCPResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number, message: string }
}
