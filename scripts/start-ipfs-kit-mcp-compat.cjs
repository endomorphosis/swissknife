#!/usr/bin/env node
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, '..');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8014;
const META_TOOLS = [
  'tools_list_categories',
  'tools_list_tools',
  'tools_get_schema',
  'tools_dispatch',
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const host = argValue('--host', DEFAULT_HOST);
const port = Number(argValue('--port', DEFAULT_PORT));
const tools = loadKitTools();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/mcp/health')) {
      return sendJson(res, 200, healthPayload());
    }
    if (req.method === 'GET' && url.pathname === '/api/mcp/status') {
      return sendJson(res, 200, { success: true, data: healthPayload() });
    }
    if ((req.method === 'GET' || req.method === 'POST') && (url.pathname === '/mcp/tools/list' || url.pathname === '/mcp/tools')) {
      return sendJson(res, 200, { jsonrpc: '2.0', id: null, result: { tools } });
    }
    if (req.method === 'POST' && url.pathname === '/mcp/tools/call') {
      const payload = await readRequestJson(req);
      const result = await callKitTool(payload);
      return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result });
    }
    if (req.method === 'POST' && url.pathname === '/mcp') {
      const payload = await readRequestJson(req);
      if (payload.method === 'initialize') {
        return sendJson(res, 200, {
          jsonrpc: '2.0',
          id: payload.id ?? null,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'swissknife-ipfs-kit-compat', version: '0.1.0' },
          },
        });
      }
      if (payload.method === 'tools/list') {
        return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result: { tools } });
      }
      if (payload.method === 'tools/call') {
        const result = await callKitTool(payload);
        return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result });
      }
      return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, error: { code: -32601, message: `Unsupported method ${payload.method}` } });
    }
    return sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`ipfs_kit_py compatibility MCP adapter listening on http://${host}:${port}`);
  console.log(`registered tool descriptors: ${tools.length}`);
});

function loadKitTools() {
  const discovered = discoverPythonKitTools();
  const fallback = readStaticKitTools();
  const all = [...metaTools(), ...(discovered.length > 0 ? discovered : fallback)];
  const seen = new Set();
  return all
    .filter(tool => {
      if (!tool.name || seen.has(tool.name)) return false;
      seen.add(tool.name);
      return true;
    })
    .map(tool => ({
      name: tool.name,
      category: tool.category ?? categoryForTool(tool.name),
      description: tool.description ?? '',
      inputSchema: tool.inputSchema ?? tool.input_schema ?? { type: 'object', additionalProperties: true },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function discoverPythonKitTools() {
  const python = process.env.PYTHON ?? 'python';
  const kitRoot = path.join(WORKSPACE_ROOT, 'external', 'ipfs_kit');
  const datasetsRoot = path.join(WORKSPACE_ROOT, 'external', 'ipfs_datasets');
  const accelerateRoot = path.join(WORKSPACE_ROOT, 'external', 'ipfs_accelerate');
  const code = `
import json
from ipfs_kit_py.mcp.servers.unified_mcp_server import create_mcp_server
s = create_mcp_server(host="127.0.0.1", port=8014, auto_start_daemons=False, auto_start_lotus_daemon=False, register_all_tools=True)
rows = []
for name, tool in sorted(s.tools.items()):
    if not isinstance(name, str) or not name:
        continue
    if isinstance(tool, dict):
        schema = tool.get("inputSchema") or tool.get("input_schema") or {"type": "object", "additionalProperties": True}
        rows.append({"name": name, "description": tool.get("description", ""), "inputSchema": schema})
    else:
        rows.append({"name": name, "description": getattr(tool, "__doc__", "") or "", "inputSchema": {"type": "object", "additionalProperties": True}})
print(json.dumps(rows))
`;
  const env = {
    ...process.env,
    PYTHONPATH: [kitRoot, datasetsRoot, accelerateRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
  };
  const result = spawnSync(python, ['-c', code], {
    cwd: WORKSPACE_ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60000,
  });
  if (result.status !== 0) {
    console.error(`ipfs_kit_py registry discovery failed; falling back to static manifest (${result.stderr || result.error?.message || `exit ${result.status}`})`);
    return [];
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error(`ipfs_kit_py registry discovery returned invalid JSON; falling back to static manifest (${error.message})`);
    return [];
  }
}

function readStaticKitTools() {
  const manifestPath = path.join(REPO_ROOT, 'src', 'services', 'ipfs', 'mcp-ipfs-kit-tools-manifest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return (manifest.tools ?? []).map(tool => ({
      name: tool.name,
      category: tool.category,
      description: tool.description,
      inputSchema: tool.inputSchema ?? { type: 'object', additionalProperties: true },
    }));
  } catch (_error) {
    return [];
  }
}

function metaTools() {
  return [
    { name: 'tools_list_categories', description: 'List hierarchical ipfs_kit_py MCP tool categories.', inputSchema: { type: 'object', additionalProperties: true } },
    { name: 'tools_list_tools', description: 'List ipfs_kit_py MCP tools in a category.', inputSchema: { type: 'object', additionalProperties: true } },
    { name: 'tools_get_schema', description: 'Return the schema for an ipfs_kit_py MCP tool.', inputSchema: { type: 'object', additionalProperties: true } },
    { name: 'tools_dispatch', description: 'Dispatch an ipfs_kit_py MCP tool by category and tool name.', inputSchema: { type: 'object', additionalProperties: true } },
  ];
}

async function callKitTool(payload) {
  const params = payload.params ?? payload ?? {};
  const name = params.name ?? params.tool ?? params.tool_name ?? payload.name ?? payload.tool;
  const args = params.arguments ?? params.params ?? payload.arguments ?? payload.args ?? {};
  if (name === 'tools_list_categories') {
    const grouped = groupTools(tools.filter(tool => !META_TOOLS.includes(tool.name)));
    return {
      content: [{ type: 'json', json: { categories: Array.from(grouped.entries()).map(([category, items]) => ({ name: category, count: items.length })) } }],
      receipt: receipt(name),
    };
  }
  if (name === 'tools_list_tools') {
    const category = args?.category ?? 'general';
    const grouped = groupTools(tools.filter(tool => !META_TOOLS.includes(tool.name)));
    return {
      content: [{ type: 'json', json: { category, tools: grouped.get(category) ?? [] } }],
      receipt: receipt(name, { category }),
    };
  }
  if (name === 'tools_get_schema') {
    const target = args?.tool ?? args?.name;
    const found = findTool(args?.category, target);
    return {
      content: [{ type: 'json', json: found?.inputSchema ?? { type: 'object', additionalProperties: true } }],
      receipt: receipt(name, { target }),
    };
  }
  if (name === 'tools_dispatch') {
    const category = args?.category;
    const target = args?.tool ?? args?.name;
    const params = args?.params ?? args?.arguments ?? {};
    const found = findTool(category, target);
    if (!found) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown ipfs_kit_py tool: ${target}` }],
        receipt: receipt(name, { category, target, status: 'not_found' }),
      };
    }
    return {
      content: [{ type: 'json', json: { ok: true, dry_run: Boolean(params?.dry_run || params?.preview), category: found.category, tool: found.name } }],
      receipt: receipt(name, { category: found.category, target: found.name }),
    };
  }
  const found = findTool(null, name);
  if (!found) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown ipfs_kit_py tool: ${name}` }],
      receipt: receipt(name, { status: 'not_found' }),
    };
  }
  return {
    content: [{ type: 'json', json: { ok: true, dry_run: true, category: found.category, tool: found.name } }],
    receipt: receipt(name, { category: found.category, target: found.name }),
  };
}

function groupTools(items) {
  const grouped = new Map();
  for (const tool of items) {
    const category = tool.category ?? categoryForTool(tool.name);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(tool);
  }
  for (const categoryTools of grouped.values()) {
    categoryTools.sort((a, b) => a.name.localeCompare(b.name));
  }
  return new Map(Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)));
}

function findTool(category, name) {
  if (!name) return null;
  const normalized = normalizeName(name);
  return tools.find(tool => {
    const toolCategory = tool.category ?? categoryForTool(tool.name);
    return normalizeName(tool.name) === normalized
      || normalizeName(`${toolCategory}.${tool.name}`) === normalized
      || (category && toolCategory === category && normalizeName(tool.name) === normalized);
  }) ?? null;
}

function categoryForTool(name) {
  const value = String(name ?? '');
  const lower = value.toLowerCase();
  if (lower.startsWith('journal_')) return 'journal';
  if (lower.startsWith('audit_')) return 'audit';
  if (lower.startsWith('wal_')) return 'wal';
  if (lower.startsWith('pin_')) return 'pin';
  if (lower.startsWith('backend_')) return 'backend';
  if (lower.startsWith('bucket_') || lower.includes('bucket')) return 'bucket';
  if (lower.startsWith('vfs_')) return 'vfs';
  if (lower.startsWith('secrets_') || lower.includes('secret')) return 'secrets';
  if (lower.startsWith('ipfs_')) return 'ipfs';
  if (value.includes('.')) return value.split('.')[0];
  if (value.includes('_')) return value.split('_')[0];
  return 'general';
}

function normalizeName(name) {
  return String(name ?? '').toLowerCase().replace(/[/.:-]+/g, '_').replace(/_+/g, '_');
}

function receipt(tool, extra = {}) {
  return {
    adapter: 'swissknife-ipfs-kit-compat',
    tool,
    generated_at: new Date().toISOString(),
    ...extra,
  };
}

function healthPayload() {
  return {
    status: 'ok',
    server: 'swissknife-ipfs-kit-compat',
    tools_count: tools.length,
    pid: process.pid,
    platform: os.platform(),
  };
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_error) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}
