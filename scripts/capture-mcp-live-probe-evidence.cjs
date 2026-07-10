#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const accelerateRoot = process.env.IPFS_ACCELERATE_PY_ROOT || '/home/barberb/ipfs_accelerate_py';
const acceleratePython = process.env.IPFS_ACCELERATE_PYTHON || path.join(accelerateRoot, '.venv', 'bin', 'python3');
const mcpAnnounceFile = process.env.IPFS_ACCELERATE_PY_TASK_P2P_ANNOUNCE_FILE
  || path.join(accelerateRoot, 'state', 'task_p2p_announce_mcp.json');
const generatedAt = new Date().toISOString();

const SERVICES = [
  { service: 'ipfs_kit_py', endpoint: 'http://127.0.0.1:8014/mcp' },
  { service: 'ipfs_datasets_py', endpoint: 'http://127.0.0.1:3002/mcp' },
  { service: 'ipfs_accelerate_py', endpoint: 'http://127.0.0.1:3003/mcp' },
];
const META_TOOLS = ['tools_list_categories', 'tools_list_tools', 'tools_get_schema', 'tools_dispatch'];

main().catch(error => {
  console.error(error);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const hierarchical = await captureHierarchicalFacadeEvidence();
  const libp2p = captureLibp2pReachabilityEvidence();
  writeJson('mcp-hierarchical-facade-live-probes.json', hierarchical);
  writeJson('mcpplusplus-libp2p-reachability.json', libp2p);
  console.log(JSON.stringify({
    hierarchical_decision: hierarchical.decision,
    hierarchical_probe_count: hierarchical.probes.length,
    libp2p_ok: libp2p.ok,
    libp2p_tool_count: libp2p.tool_count ?? 0,
    outputs: [
      'mcp-hierarchical-facade-live-probes.json',
      'mcpplusplus-libp2p-reachability.json',
    ].map(name => path.relative(projectRoot, path.join(evidenceRoot, name))),
  }, null, 2));
}

async function captureHierarchicalFacadeEvidence() {
  const probes = [];
  for (const service of SERVICES) {
    const list = await jsonRpc(service.endpoint, 'tools/list', {});
    const tools = extractTools(list.json).map(tool => (typeof tool === 'string' ? tool : tool.name)).filter(Boolean);
    const missingMetaTools = META_TOOLS.filter(name => !tools.includes(name));
    const categories = missingMetaTools.length === 0
      ? await jsonRpc(service.endpoint, 'tools/call', {
          name: 'tools_list_categories',
          arguments: { include_count: true },
        })
      : null;
    const categoryPayload = categories ? extractJsonContent(categories.json) : null;
    const categoryRows = normalizeCategories(categoryPayload);
    probes.push({
      service: service.service,
      endpoint: service.endpoint,
      status: list.status,
      ok: list.ok && missingMetaTools.length === 0 && Boolean(categoryPayload),
      tool_count: tools.length,
      facade_tools: Object.fromEntries(META_TOOLS.map(name => [name, tools.includes(name)])),
      missing_facade_tools: missingMetaTools,
      category_count: categoryRows.length || categoryPayload?.category_count || 0,
      sample_categories: categoryRows.slice(0, 10),
      error: list.error || categories?.error || (!categoryPayload && 'tools_list_categories returned no JSON payload') || null,
    });
  }
  return {
    schema: 'swissknife.mcp_hierarchical_facade_live_probes.v1',
    generated_at: generatedAt,
    decision: probes.every(probe => probe.ok) ? 'go' : 'no_go',
    required_facade_tools: META_TOOLS,
    probes,
  };
}

function captureLibp2pReachabilityEvidence() {
  const announce = readJsonIfExists(mcpAnnounceFile);
  if (!announce?.multiaddr) {
    return {
      schema: 'swissknife.mcpplusplus_libp2p_reachability.v1',
      generated_at: generatedAt,
      ok: false,
      announce_file: mcpAnnounceFile,
      error: 'missing announce multiaddr',
    };
  }
  const python = `
import json
import logging
import warnings

logging.basicConfig(level=logging.ERROR)
warnings.filterwarnings("ignore")

import trio
from ipfs_accelerate_py.p2p_tasks.mcp_p2p_client import (
    MCPP2PClient,
    open_libp2p_stream_by_multiaddr,
    trio_libp2p_host_listen,
)
from ipfs_accelerate_py.p2p_tasks.mcp_p2p_protocol import PROTOCOL_MCP_P2P_V1

announce = json.loads(${JSON.stringify(JSON.stringify(announce))})

async def main():
    async with trio_libp2p_host_listen(listen_multiaddr="/ip4/127.0.0.1/tcp/0") as host:
        stream = await open_libp2p_stream_by_multiaddr(
            host,
            peer_multiaddr=announce["multiaddr"],
            protocols=[PROTOCOL_MCP_P2P_V1],
        )
        client = MCPP2PClient(stream)
        initialize = await client.initialize({
            "client": {"name": "swissknife-release-probe"},
            "protocolVersion": "2026-07-10",
            "capabilities": {"tools": True},
            "mcpPlusPlusProfiles": ["mcp++/profile-a-idl"],
        })
        tools = await client.tools_list()
        safe_call = await client.tools_call("get_server_status", {})
        await client.aclose()
        print(json.dumps({
            "initialize": initialize.get("result", {}),
            "tool_count": len(tools),
            "sample_tools": [tool.get("name") for tool in tools[:25] if isinstance(tool, dict)],
            "has_get_server_status": any(tool.get("name") == "get_server_status" for tool in tools if isinstance(tool, dict)),
            "has_p2p_taskqueue_status": any(tool.get("name") == "p2p_taskqueue_status" for tool in tools if isinstance(tool, dict)),
            "safe_call": {"tool": "get_server_status", "result": safe_call},
        }, sort_keys=True))

trio.run(main)
`;
  const result = spawnSync(acceleratePython, ['-c', python], {
    cwd: accelerateRoot,
    env: {
      ...process.env,
      IPFS_ACCELERATE_PY_TASK_P2P_ANNOUNCE_FILE: mcpAnnounceFile,
    },
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const parsed = parseTrailingJson(result.stdout);
  if (result.status !== 0 || !parsed) {
    return {
      schema: 'swissknife.mcpplusplus_libp2p_reachability.v1',
      generated_at: generatedAt,
      ok: false,
      announce_file: mcpAnnounceFile,
      announce,
      protocol: '/mcp+p2p/1.0.0',
      error: result.error?.message || result.stderr || result.stdout || `python exited ${result.status}`,
    };
  }
  return {
    schema: 'swissknife.mcpplusplus_libp2p_reachability.v1',
    generated_at: generatedAt,
    ok: Boolean(parsed.initialize?.ok) && parsed.tool_count > 0 && Boolean(parsed.safe_call?.result),
    protocol: parsed.initialize?.transport ?? '/mcp+p2p/1.0.0',
    announce_file: mcpAnnounceFile,
    announce,
    initialize: parsed.initialize,
    tool_count: parsed.tool_count,
    sample_tools: parsed.sample_tools,
    has_get_server_status: parsed.has_get_server_status,
    has_p2p_taskqueue_status: parsed.has_p2p_taskqueue_status,
    safe_call: parsed.safe_call,
  };
}

async function jsonRpc(endpoint, method, params) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      json: parseJson(text),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: '',
      json: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractTools(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.tools)) return payload.tools;
  if (payload.result) return extractTools(payload.result);
  if (payload.data) return extractTools(payload.data);
  return [];
}

function extractJsonContent(payload) {
  const content = payload?.result?.content;
  if (!Array.isArray(content)) return payload?.result ?? null;
  for (const item of content) {
    if (item?.type === 'json' && item.json) return item.json;
    if (item?.type === 'text' && typeof item.text === 'string') {
      const parsed = parseJson(item.text);
      if (parsed) return parsed;
    }
  }
  return null;
}

function normalizeCategories(payload) {
  const categories = payload?.categories;
  if (!Array.isArray(categories)) return [];
  return categories.map(category => ({
    name: category.name,
    description: category.description,
    count: category.count ?? category.tool_count ?? 0,
    lazy: category.lazy,
  }));
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_error) {
    return null;
  }
}

function parseTrailingJson(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  const direct = parseJson(trimmed);
  if (direct) return direct;
  const start = trimmed.lastIndexOf('\n{');
  if (start >= 0) return parseJson(trimmed.slice(start + 1));
  const brace = trimmed.indexOf('{');
  return brace >= 0 ? parseJson(trimmed.slice(brace)) : null;
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(evidenceRoot, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
