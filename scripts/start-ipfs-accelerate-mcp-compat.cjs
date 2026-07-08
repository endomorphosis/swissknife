#!/usr/bin/env node

const http = require('http');
const os = require('os');

const args = parseArgs(process.argv.slice(2));
const host = args.host || process.env.IPFS_ACCELERATE_COMPAT_HOST || '127.0.0.1';
const port = Number(args.port || process.env.IPFS_ACCELERATE_COMPAT_PORT || 3003);

const tools = [
  {
    name: 'tools_dispatch',
    description: 'Dispatch an ipfs_accelerate_py compatibility tool by category and tool name.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        tool: { type: 'string' },
        tool_name: { type: 'string' },
        params: { type: 'object' },
        parameters: { type: 'object' },
      },
      required: ['category'],
    },
  },
  {
    name: 'hardware_recommend',
    description: 'Return local hardware recommendations for an inference workload.',
    inputSchema: {
      type: 'object',
      properties: {
        task_type: { type: 'string' },
        model_family: { type: 'string' },
      },
    },
  },
  {
    name: 'get_hardware_info',
    description: 'Return local CPU and memory facts used by hardware recommendation.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    if (request.method === 'GET' && ['/health', '/healthz', '/api/mcp/status'].includes(url.pathname)) {
      return sendJson(response, 200, {
        status: 'ok',
        service: 'ipfs_accelerate_py',
        compatibility: 'swissknife-mcp-jsonrpc',
      });
    }

    if (request.method === 'GET' && url.pathname === '/mcp/tools/list') {
      return sendJson(response, 200, { tools });
    }

    if (request.method === 'POST' && url.pathname === '/mcp') {
      const body = await readJson(request);
      return sendJson(response, 200, await handleJsonRpc(body));
    }

    return sendJson(response, 404, { error: 'not_found' });
  } catch (error) {
    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`ipfs_accelerate_py MCP compatibility server listening on http://${host}:${port}/mcp`);
});

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--host') parsed.host = values[++index];
    if (value === '--port') parsed.port = values[++index];
  }
  return parsed;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('request_too_large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

async function handleJsonRpc(body) {
  const id = body?.id ?? null;
  if (body?.method === 'tools/list') {
    return jsonRpcResult(id, { tools });
  }

  if (body?.method === 'tools/call') {
    const params = body.params || {};
    const toolName = params.name;
    const toolArgs = params.arguments || {};
    if (toolName === 'tools_dispatch') {
      return jsonRpcResult(id, toolResult(dispatchTool(toolArgs)));
    }
    if (toolName === 'hardware_recommend') {
      return jsonRpcResult(id, toolResult(hardwareRecommend(toolArgs)));
    }
    if (toolName === 'get_hardware_info') {
      return jsonRpcResult(id, toolResult(hardwareInfo()));
    }
    return jsonRpcError(id, -32601, `Tool '${toolName}' not found`);
  }

  return jsonRpcError(id, -32601, `Method '${body?.method}' not found`);
}

function dispatchTool(input) {
  const category = String(input.category || '').toLowerCase();
  const toolName = String(input.tool || input.tool_name || '').toLowerCase();
  const params = input.params || input.parameters || {};
  if (category === 'hardware' && ['hardware_recommend', 'recommend', ''].includes(toolName)) {
    return hardwareRecommend(params);
  }
  return {
    ok: false,
    status: 'error',
    error: 'unsupported_tool',
    category: input.category,
    tool: input.tool || input.tool_name,
  };
}

function hardwareRecommend(params = {}) {
  const facts = hardwareInfo();
  const memoryGb = Math.round((facts.total_memory_bytes / 1024 ** 3) * 10) / 10;
  const recommendations = [
    {
      backend: 'cpu',
      priority: 1,
      task_type: params.task_type || 'inference',
      reason: `${facts.cpu_count} CPU threads and ${memoryGb} GiB RAM are available for portable inference.`,
    },
  ];

  return {
    ok: true,
    status: 'success',
    service: 'ipfs_accelerate_py',
    compatibility: 'swissknife-mcp-jsonrpc',
    recommendations,
    hardware: facts,
  };
}

function hardwareInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpu_count: os.cpus().length,
    cpu_model: os.cpus()[0]?.model || 'unknown',
    total_memory_bytes: os.totalmem(),
    free_memory_bytes: os.freemem(),
  };
}

function toolResult(payload) {
  return {
    structuredContent: payload,
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload),
      },
    ],
  };
}

function jsonRpcResult(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(`${JSON.stringify(payload)}\n`);
}
