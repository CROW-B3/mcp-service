import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the global fetch for API key verification
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('../tools', async (importOriginal) => {
  const original = await importOriginal<typeof import('../tools')>();
  return {
    ...original,
    executeTool: vi.fn(() => Promise.resolve({ data: 'test result' })),
  };
});

import app from '../index';

const mockEnv = {
  API_GATEWAY_URL: 'http://localhost:8000',
  ENVIRONMENT: 'local',
  SERVICE_API_KEY: 'test-service-key',
  INTERNAL_GATEWAY_KEY: 'test-internal-key',
  USER_SERVICE_URL: 'http://localhost:8002',
  DB: {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(() => ({ results: [] })),
        first: vi.fn(() => null),
        run: vi.fn(() => ({ success: true })),
      })),
    })),
  },
  R2_BUCKET: { put: vi.fn(), get: vi.fn() },
};

function setupVerifyApiKeySuccess(orgId = 'org-123') {
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ organizationId: orgId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function setupVerifyApiKeyFailure() {
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ valid: false }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

describe('mcp-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET / (health check)', () => {
    it('should return 200 with service info', async () => {
      const res = await app.request('/', {}, mockEnv);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('crow-mcp-service');
    });
  });

  describe('GET /mcp (tool listing)', () => {
    it('should return 401 without API key', async () => {
      const res = await app.request('/mcp', {}, mockEnv);
      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid API key', async () => {
      setupVerifyApiKeyFailure();

      const res = await app.request(
        '/mcp',
        {
          headers: { Authorization: 'Bearer invalid-key' },
        },
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it('should return tool listing with valid API key', async () => {
      setupVerifyApiKeySuccess();

      const res = await app.request(
        '/mcp',
        {
          headers: { Authorization: 'Bearer valid-key' },
        },
        mockEnv
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('crow-mcp-server');
      expect(body.tools).toBeDefined();
      expect(Array.isArray(body.tools)).toBe(true);
      expect(body.tools.length).toBeGreaterThan(0);
      expect(body.tools[0].name).toBeDefined();
      expect(body.tools[0].description).toBeDefined();
    });
  });

  describe('POST /mcp (JSON-RPC)', () => {
    it('should return 401 without API key', async () => {
      const res = await app.request(
        '/mcp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
          }),
        },
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it('should handle initialize method', async () => {
      setupVerifyApiKeySuccess();

      const res = await app.request(
        '/mcp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-key',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
          }),
        },
        mockEnv
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result).toBeDefined();
      expect(body.result.protocolVersion).toBeDefined();
      expect(body.result.serverInfo.name).toBe('crow-mcp-server');
    });

    it('should handle tools/list method', async () => {
      setupVerifyApiKeySuccess();

      const res = await app.request(
        '/mcp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-key',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
          }),
        },
        mockEnv
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.tools).toBeDefined();
      expect(Array.isArray(body.result.tools)).toBe(true);
    });

    it('should handle tools/call method', async () => {
      setupVerifyApiKeySuccess();

      const res = await app.request(
        '/mcp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-key',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
              name: 'crow_search_products',
              arguments: { query: 'coffee' },
            },
          }),
        },
        mockEnv
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.jsonrpc).toBe('2.0');
      expect(body.result).toBeDefined();
      expect(body.result.content).toBeDefined();
    });

    it('should return error for unknown tool', async () => {
      setupVerifyApiKeySuccess();

      const res = await app.request(
        '/mcp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-key',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: {
              name: 'nonexistent_tool',
              arguments: {},
            },
          }),
        },
        mockEnv
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32601);
    });

    it('should return error for unknown method', async () => {
      setupVerifyApiKeySuccess();

      const res = await app.request(
        '/mcp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-key',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 5,
            method: 'unknown/method',
          }),
        },
        mockEnv
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it('should return error for invalid JSON-RPC request', async () => {
      setupVerifyApiKeySuccess();

      const res = await app.request(
        '/mcp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-key',
          },
          body: JSON.stringify({
            id: 6,
            method: 'initialize',
            // missing jsonrpc: '2.0'
          }),
        },
        mockEnv
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32600);
    });
  });
});
