/**
 * MCP (base protocol) — connector-over-HTTP end-to-end tests.
 *
 * Companion to `connector-libp2p.test.ts` (which covers the MCP++ Profile E
 * libp2p transport). This file proves that SwissKnife's `MCPPPServerConnector`
 * can connect to and invoke tools on the ipfs_kit_py / ipfs_datasets_py /
 * ipfs_accelerate_py MCP servers over plain **HTTP JSON-RPC**, and that it
 * discovers the correct tool names / gets the correct CallToolResult shapes
 * back from each server's *actual* (differing) REST + JSON-RPC envelopes.
 *
 * The three real servers wrap their `tools/list` REST payloads differently:
 *   - ipfs_datasets_py `/tools/list`       → `{tools:[...], count, categories}`
 *   - ipfs_kit_py `/mcp/tools/list`        → `{jsonrpc, result:{tools:[...]}, id}`
 *   - ipfs_accelerate_py `/mcp/tools/list` → `{jsonrpc, result:{tools:[...]}}`
 * and ipfs_accelerate_py has NO `/api/mcp/tools` route (a GET there returns a
 * `{status, server, port, components}` status dict). The mock servers below
 * reproduce those exact shapes from source so the connector is exercised
 * against the real contract, not a convenient fiction.
 */

import { describe, it, expect, afterEach, beforeAll, afterAll } from '@jest/globals';
import { createServer, Server, request as httpRequest } from 'http';
import { AddressInfo } from 'net';
import {
  MCPPPServerConnector,
  MCPPPServerConfig,
  IPFS_KIT_SERVER,
  IPFS_DATASETS_SERVER,
  IPFS_ACCELERATE_SERVER,
  extractRestToolNames,
} from '../../src/services/mcp-plus-plus-connector';

// ---------------------------------------------------------------------------
// fetch polyfill — Jest's node test environment does not expose global fetch
// (and undici isn't resolvable here). The connector only uses `.ok`, `.status`
// and `.json()`, so a minimal node:http shim is sufficient and keeps the test
// exercising the REAL connector transport code.
// ---------------------------------------------------------------------------

function nodeFetch(url: string, init: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpRequest(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: init.method || 'GET',
        headers: init.headers || {},
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c as Buffer));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode || 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            json: async () => JSON.parse(text || 'null'),
            text: async () => text,
          });
        });
      },
    );
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

let _origFetch: any;
beforeAll(() => {
  _origFetch = (globalThis as any).fetch;
  if (typeof _origFetch !== 'function') (globalThis as any).fetch = nodeFetch;
  if (typeof (AbortSignal as any).timeout !== 'function') {
    (AbortSignal as any).timeout = (ms: number) => {
      const c = new AbortController();
      setTimeout(() => c.abort(), ms);
      return c.signal;
    };
  }
});
afterAll(() => {
  (globalThis as any).fetch = _origFetch;
});

// ---------------------------------------------------------------------------
// Shared tool surface (4 hierarchical meta-tools + a flat <category>.<tool> set)
// ---------------------------------------------------------------------------

const META_TOOLS = ['tools_list_categories', 'tools_list_tools', 'tools_get_schema', 'tools_dispatch'];
const FLAT_TOOLS = ['core.health_check', 'core.version', 'storage.ipfs_add', 'storage.ipfs_cat', 'storage.pin_ls'];
const ALL_TOOL_NAMES = [...META_TOOLS, ...FLAT_TOOLS];
const CATEGORIES = [
  { name: 'core', tool_count: 2 },
  { name: 'storage', tool_count: 3 },
];

/** MCP CallToolResult envelope, as all three servers return from tools/call. */
function callToolResult(payload: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload && typeof payload === 'object' ? payload : { result: payload },
    isError: false,
  };
}

/** Descriptor objects, as the JSON-RPC-wrapped REST tools/list returns. */
function toolDescriptors() {
  return ALL_TOOL_NAMES.map(name => ({ name, description: `${name} tool`, inputSchema: { type: 'object' } }));
}

interface CapturedCall {
  name: string;
  arguments: any;
}

/**
 * Dispatch a base-MCP JSON-RPC request the way all three servers do:
 * initialize (echoing experimental caps), tools/list, tools/call (reading
 * `params.name` + `params.arguments`). Records every tools/call for assertions.
 */
function mcpJsonRpcDispatch(body: any, captured: CapturedCall[]) {
  const method = body.method;
  const params = body.params || {};
  const id = body.id;

  if (method === 'initialize') {
    const clientCaps = params?.capabilities?.experimental || {};
    const serverCaps: Record<string, boolean> = {};
    for (const k of Object.keys(clientCaps)) if (clientCaps[k]) serverCaps[k] = true;
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: true }, experimental: serverCaps },
        serverInfo: { name: 'mock-mcp', version: '1.0.0' },
      },
    };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: toolDescriptors() } };
  }
  if (method === 'tools/call') {
    const name = params.name;
    const args = params.arguments || {};
    captured.push({ name, arguments: args });
    let payload: any;
    switch (name) {
      case 'tools_list_categories':
        payload = { status: 'success', category_count: CATEGORIES.length, categories: CATEGORIES };
        break;
      case 'tools_list_tools':
        payload = { status: 'success', category: args.category, tools: args.category === 'core' ? ['health_check', 'version'] : ['ipfs_add', 'ipfs_cat', 'pin_ls'] };
        break;
      case 'tools_get_schema':
        payload = { name: `${args.category}.${args.tool}`, inputSchema: { type: 'object', properties: {} } };
        break;
      case 'tools_dispatch':
        payload = { dispatched: `${args.category}.${args.tool}`, params: args.params };
        break;
      case 'core.health_check':
        payload = { status: 'ok', service: 'mock' };
        break;
      default:
        if (ALL_TOOL_NAMES.includes(name)) {
          payload = { ok: true, tool: name, args };
        } else {
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${name}` } };
        }
    }
    return { jsonrpc: '2.0', id, result: callToolResult(payload) };
  }
  if (typeof method === 'string' && method.startsWith('notifications/')) {
    return null; // notification — no response body
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

type RestHandler = () => { status?: number; body: unknown };

/**
 * Start a real HTTP server that mimics one of the IPFS MCP servers: a set of
 * GET REST routes (health + tools/list in that server's shape) plus a single
 * POST `/mcp` JSON-RPC endpoint.
 */
async function startMockServer(restRoutes: Record<string, RestHandler>): Promise<{
  base: string;
  captured: CapturedCall[];
  server: Server;
}> {
  const captured: CapturedCall[] = [];
  const server = createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    const key = `${req.method} ${path}`;

    if (req.method === 'POST' && path === '/mcp') {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c as Buffer));
      req.on('end', () => {
        let parsed: any = {};
        try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {}
        const out = mcpJsonRpcDispatch(parsed, captured);
        if (out === null) { res.writeHead(202).end(); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      });
      return;
    }

    const handler = restRoutes[key];
    if (handler) {
      const { status = 200, body } = handler();
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found', path }));
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, captured, server };
}

// Server-specific REST route tables, faithful to each package's source.
const kitRoutes: Record<string, RestHandler> = {
  // kit health + discovery share GET /mcp/tools/list → JSON-RPC-wrapped shape.
  'GET /mcp/tools/list': () => ({ body: { jsonrpc: '2.0', result: { tools: toolDescriptors() }, id: null } }),
};
const datasetsRoutes: Record<string, RestHandler> = {
  'GET /health/ready': () => ({ body: { status: 'ready' } }),
  // datasets returns a flat top-level {tools:[names], count, categories}.
  'GET /tools/list': () => ({ body: { tools: ALL_TOOL_NAMES, count: ALL_TOOL_NAMES.length, categories: ['core', 'storage'] } }),
};
const accelerateRoutes: Record<string, RestHandler> = {
  // accelerate health is the generic /api/mcp/* status dict.
  'GET /api/mcp/status': () => ({ body: { status: 'running', server: 'IPFS Accelerate MCP', port: 3003, components: ['mcp_server'] } }),
  // The OLD (wrong) toolsPath: a GET here returns the SAME status dict, not tools.
  'GET /api/mcp/tools': () => ({ body: { status: 'running', server: 'IPFS Accelerate MCP', port: 3003, components: ['mcp_server'] } }),
  // The real tool catalogue (JSON-RPC-wrapped), matching kit's REST surface.
  'GET /mcp/tools/list': () => ({ body: { jsonrpc: '2.0', result: { tools: toolDescriptors() } } }),
};

const servers: Server[] = [];
afterEach(async () => {
  while (servers.length) {
    const s = servers.pop()!;
    await new Promise<void>(r => s.close(() => r()));
  }
}, 15000);

async function connectHttp(base: MCPPPServerConfig, routes: Record<string, RestHandler>) {
  const mock = await startMockServer(routes);
  servers.push(mock.server);
  const connector = new MCPPPServerConnector({ ...base, baseUrl: mock.base, transport: 'http' });
  const result = await connector.connect();
  return { connector, result, captured: mock.captured };
}

// ---------------------------------------------------------------------------
// extractRestToolNames — unit coverage of the three real envelope shapes
// ---------------------------------------------------------------------------

describe('extractRestToolNames (REST tools/list envelope parsing)', () => {
  it('reads datasets top-level {tools:[strings]}', () => {
    expect(extractRestToolNames({ tools: ['a', 'b'], count: 2 })).toEqual(['a', 'b']);
  });
  it('reads kit/accelerate JSON-RPC-wrapped {result:{tools:[{name}]}}', () => {
    const data = { jsonrpc: '2.0', id: null, result: { tools: [{ name: 'x' }, { name: 'y' }] } };
    expect(extractRestToolNames(data)).toEqual(['x', 'y']);
  });
  it('reads a bare array', () => {
    expect(extractRestToolNames([{ name: 'a' }, 'b'])).toEqual(['a', 'b']);
  });
  it('returns [] for a status dict (does NOT manufacture bogus names)', () => {
    // This is the regression: the old code did Object.keys() here.
    expect(extractRestToolNames({ status: 'running', server: 's', port: 3003, components: [] })).toEqual([]);
  });
  it('returns [] for a JSON-RPC envelope with no result.tools', () => {
    expect(extractRestToolNames({ jsonrpc: '2.0', result: {}, id: 1 })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Per-server HTTP connect + discover
// ---------------------------------------------------------------------------

const BOGUS = ['jsonrpc', 'result', 'id', 'status', 'server', 'port', 'components'];

describe('MCPPPServerConnector over HTTP — connect + tool discovery', () => {
  it('connects to the ipfs_kit_py server and discovers real tools (not envelope keys)', async () => {
    const { result } = await connectHttp(IPFS_KIT_SERVER, kitRoutes);
    expect(result.success).toBe(true);
    expect(result.tools).toEqual(expect.arrayContaining(ALL_TOOL_NAMES));
    expect(result.tools.length).toBe(ALL_TOOL_NAMES.length);
    for (const b of BOGUS) expect(result.tools).not.toContain(b);
  });

  it('connects to the ipfs_datasets_py server (top-level {tools}) and discovers tools', async () => {
    const { result } = await connectHttp(IPFS_DATASETS_SERVER, datasetsRoutes);
    expect(result.success).toBe(true);
    expect(result.tools).toEqual(expect.arrayContaining(ALL_TOOL_NAMES));
    expect(result.tools.length).toBe(ALL_TOOL_NAMES.length);
  });

  it('connects to the ipfs_accelerate_py server via /mcp/tools/list (NOT the /api/mcp status dict)', async () => {
    const { result } = await connectHttp(IPFS_ACCELERATE_SERVER, accelerateRoutes);
    expect(result.success).toBe(true);
    expect(result.tools).toEqual(expect.arrayContaining(ALL_TOOL_NAMES));
    expect(result.tools.length).toBe(ALL_TOOL_NAMES.length);
    for (const b of BOGUS) expect(result.tools).not.toContain(b);
  });

  it('negotiates MCP++ profiles from the initialize handshake over HTTP', async () => {
    const { result } = await connectHttp(IPFS_KIT_SERVER, kitRoutes);
    expect(result.profiles).toContain('mcp++/event-dag');
    expect(result.profiles).toContain('mcp++/p2p-transport');
  });

  it('falls back to JSON-RPC tools/list when the REST toolsPath returns a status dict', async () => {
    // Point the connector's toolsPath at the accelerate status endpoint on purpose:
    // discovery must ignore the dict and recover the real tools via JSON-RPC.
    const cfg = { ...IPFS_ACCELERATE_SERVER, toolsPath: '/api/mcp/tools' };
    const { result } = await connectHttp(cfg, accelerateRoutes);
    expect(result.success).toBe(true);
    expect(result.tools.length).toBe(ALL_TOOL_NAMES.length);
    for (const b of BOGUS) expect(result.tools).not.toContain(b);
  });
});

// ---------------------------------------------------------------------------
// Tool invocation over HTTP JSON-RPC — proper request + response shapes
// ---------------------------------------------------------------------------

describe('MCPPPServerConnector over HTTP — tool invocation shapes', () => {
  it('invokes a flat tool and returns the CallToolResult envelope', async () => {
    const { connector, captured } = await connectHttp(IPFS_KIT_SERVER, kitRoutes);
    const res = await connector.callTool('core.health_check', { verbose: true });
    // Server received the canonical {name, arguments} params.
    expect(captured.at(-1)).toEqual({ name: 'core.health_check', arguments: { verbose: true } });
    // Client got a spec CallToolResult back.
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content[0].type).toBe('text');
    expect(JSON.parse(res.content[0].text)).toEqual({ status: 'ok', service: 'mock' });
  });

  it('lists hierarchical categories and unwraps the envelope', async () => {
    const { connector } = await connectHttp(IPFS_DATASETS_SERVER, datasetsRoutes);
    const cats = await connector.listCategories(true);
    expect(cats.categories).toEqual(CATEGORIES);
  });

  it('fetches a tool schema by dotted name (split into {category, tool})', async () => {
    const { connector, captured } = await connectHttp(IPFS_ACCELERATE_SERVER, accelerateRoutes);
    const schema = await connector.getToolSchema('storage.ipfs_add');
    expect(captured.at(-1)!.name).toBe('tools_get_schema');
    expect(captured.at(-1)!.arguments).toEqual({ category: 'storage', tool: 'ipfs_add' });
    expect(schema.name).toBe('storage.ipfs_add');
    expect(schema.inputSchema.type).toBe('object');
  });

  it('dispatches a tool inside a category and delivers params', async () => {
    const { connector, captured } = await connectHttp(IPFS_KIT_SERVER, kitRoutes);
    const out = await connector.dispatch('storage', 'ipfs_add', { path: '/tmp/x' });
    expect(captured.at(-1)).toEqual({ name: 'tools_dispatch', arguments: { category: 'storage', tool: 'ipfs_add', params: { path: '/tmp/x' } } });
    expect(out.dispatched).toBe('storage.ipfs_add');
    expect(out.params).toEqual({ path: '/tmp/x' });
  });

  it('surfaces JSON-RPC tool errors as thrown errors', async () => {
    const { connector } = await connectHttp(IPFS_KIT_SERVER, kitRoutes);
    await expect(connector.callTool('does.not.exist', {})).rejects.toThrow(/Tool not found/);
  });
});
