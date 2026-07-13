#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  profileEInitializeResult,
  profileEPeersResult,
} = require("./mcpplusplus-profile-e-http.cjs");
const {
  buildProfileAInterface,
  profileAListResult,
  profileAGetResult,
  profileACompatResult,
  profileASelectResult,
} = require("./mcpplusplus-profile-a.cjs");
const {
  executeProfileB,
  ProfileBRequestError,
} = require("./mcpplusplus-profile-b.cjs");
const {
  createArtifactStore,
  decodeBase64,
  getHeliaNetworkStatus,
} = require("./mcpplusplus-artifact-store.cjs");
const {
  getProfileCService,
  validateProfileCInvocation,
} = require("./mcpplusplus-profile-c.cjs");
const { getEventDagService } = require("./mcpplusplus-event-dag.cjs");
const { PROFILE_H_METHODS, ProfileHAdapterError, createProfileHAdapter } = require("./mcpplusplus-profile-h-adapter.cjs");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3002;
const ADAPTER_VERSION = "0.8.0";
const DEFAULT_DATASETS_ROOT = "/home/barberb/ipfs_datasets_py";
const META_TOOLS = [
  "tools_list_categories",
  "tools_list_tools",
  "tools_get_schema",
  "tools_dispatch",
];

const host = argValue("--host", DEFAULT_HOST);
const port = Number(argValue("--port", DEFAULT_PORT));
const datasetsRoot = process.env.IPFS_DATASETS_PY_ROOT || DEFAULT_DATASETS_ROOT;
const dashboardUrl = (
  process.env.IPFS_DATASETS_DASHBOARD_URL || "http://127.0.0.1:8899"
).replace(/\/$/, "");
const tools = loadDatasetTools();
const profileA = buildProfileAInterface("ipfs_datasets_py", tools);
const artifactStore = createArtifactStore({ service: "ipfs_datasets_py" });
const profileCService = getProfileCService("ipfs_datasets_py");
const eventDag = getEventDagService("ipfs_datasets_py");
const profileH = createProfileHAdapter({ service: "ipfs_datasets_py" });
let profileAPersistence;

const server = http.createServer(async (req, res) => {
  let url;
  let rpcRequestId = null;
  try {
    url = new URL(req.url, `http://${host}:${port}`);
    if (
      req.method === "GET" &&
      (url.pathname === "/health" ||
        url.pathname === "/health/ready" ||
        url.pathname === "/mcp/health")
    ) {
      return sendJson(res, 200, healthPayload());
    }
    if (req.method === "GET" && url.pathname === "/api/mcp/status") {
      return sendJson(res, 200, { success: true, data: healthPayload() });
    }
    if (req.method === "GET" && url.pathname === "/mcp/helia/status") {
      return sendJson(res, 200, await getHeliaNetworkStatus());
    }
    if (req.method === "GET" && url.pathname === "/mcp/dag/frontier") {
      return sendJson(res, 200, eventDag.frontier());
    }
    if (req.method === "GET" && url.pathname === "/mcp/dag/history") {
      return sendJson(res, 200, eventDag.history(url.searchParams.get("limit")));
    }
    if (req.method === "GET" && url.pathname.startsWith("/mcp/dag/provenance/")) {
      return sendJson(res, 200, eventDag.provenance(
        decodeURIComponent(url.pathname.slice("/mcp/dag/provenance/".length)),
        url.searchParams.get("limit"),
      ));
    }
    if (req.method === "GET" && url.pathname === "/mcp/dag/archives") {
      return sendJson(res, 200, eventDag.archives());
    }
    if (req.method === "GET" && url.pathname.startsWith("/mcp/dag/certificates/")) {
      const result = eventDag.certificate(decodeURIComponent(url.pathname.slice("/mcp/dag/certificates/".length)));
      return result ? sendJson(res, 200, result) : sendJson(res, 404, { error: "certificate_not_found" });
    }
    if (req.method === "GET" && url.pathname.startsWith("/mcp/dag/inclusion/")) {
      const result = eventDag.inclusion(decodeURIComponent(url.pathname.slice("/mcp/dag/inclusion/".length)));
      return result ? sendJson(res, 200, result) : sendJson(res, 404, { error: "event_not_archived" });
    }
    if (req.method === "POST" && (url.pathname === "/mcp/dag/compact" || url.pathname === "/mcp/dag/archive")) {
      return sendJson(res, 200, eventDag.compact(await readRequestJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/mcp/dag/append") {
      const body = await readRequestJson(req);
      return sendJson(res, 200, eventDag.record(body.event ?? body));
    }
    if (req.method === "POST" && url.pathname === "/mcp/dag/certificates/verify") {
      const body = await readRequestJson(req);
      return sendJson(res, 200, eventDag.verify(body.certificate_cid ?? body.certificate ?? body));
    }
    if (req.method === "GET" && url.pathname === "/mcp/p2p/peers") {
      return sendJson(res, 200, profileEPeersResult("ipfs_datasets_py"));
    }
    if (url.pathname.startsWith("/mcp/payments/")) {
      const result = await profileH.handleHttp({ method: req.method, path: url.pathname, search: url.search,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : await readRequestJson(req), headers: req.headers });
      return sendJson(res, result.status, result.body, result.headers);
    }
    if (req.method === "GET" && url.pathname === "/mcp/interfaces") {
      await persistProfileA();
      return sendJson(res, 200, profileAListResult(profileA));
    }
    if (req.method === "GET" && url.pathname.startsWith("/mcp/interfaces/")) {
      const interfaceCid = decodeURIComponent(
        url.pathname.slice("/mcp/interfaces/".length),
      );
      const result = await profileAResult(interfaceCid);
      return result
        ? sendJson(res, 200, result)
        : sendJson(res, 404, {
            error: "interface_not_found",
            interface_cid: interfaceCid,
          });
    }
    if (req.method === "POST" && url.pathname === "/mcp/interfaces/compat") {
      return sendJson(
        res,
        200,
        profileACompatResult(profileA, await readRequestJson(req)),
      );
    }
    if (req.method === "POST" && url.pathname === "/mcp/interfaces/select") {
      return sendJson(
        res,
        200,
        profileASelectResult(profileA, await readRequestJson(req)),
      );
    }
    if (req.method === "POST" && url.pathname.startsWith("/mcp/ucan/")) {
      return sendJson(res, 200, await profileCResult(
        url.pathname.slice("/mcp/ucan/".length),
        await readRequestJson(req),
      ));
    }
    if (req.method === "POST" && url.pathname === "/mcp/execute") {
      return sendJson(
        res,
        200,
        await executeDatasetsProfileB(await readRequestJson(req)),
      );
    }
    if (req.method === "POST" && url.pathname === "/mcp/artifacts/put") {
      return sendJson(
        res,
        200,
        await persistArtifactRequest(await readRequestJson(req)),
      );
    }
    if (req.method === "GET" && url.pathname.startsWith("/mcp/artifacts/")) {
      return sendJson(
        res,
        200,
        await getArtifactResponse(
          decodeURIComponent(url.pathname.slice("/mcp/artifacts/".length)),
        ),
      );
    }
    if (req.method === "GET" && url.pathname === "/datasets/list") {
      return sendJson(res, 200, {
        tools,
        tool_count: tools.length,
        source: "ipfs_datasets_py source inventory",
      });
    }
    if (
      (req.method === "GET" || req.method === "POST") &&
      (url.pathname === "/mcp/tools/list" || url.pathname === "/mcp/tools")
    ) {
      return sendJson(res, 200, {
        jsonrpc: "2.0",
        id: null,
        result: { tools },
      });
    }
    if (req.method === "POST" && url.pathname === "/mcp/tools/call") {
      const payload = await readRequestJson(req);
      return sendJson(res, 200, {
        jsonrpc: "2.0",
        id: payload.id ?? null,
        result: await callDatasetTool(payload),
      });
    }
    if (req.method === "POST" && url.pathname === "/mcp") {
      const payload = await readRequestJson(req);
      rpcRequestId = payload.id ?? null;
      if (payload.method === "initialize") {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result: profileEInitializeResult({
            name: "swissknife-ipfs-datasets-compat",
            version: ADAPTER_VERSION,
            request: payload.params,
            supportsMcpIdl: true,
            supportsCidEnvelope: true,
            supportsUcan: true,
            supportsEventDag: true,
            supportsX402Payments: await profileH.isAvailable(),
          }),
        });
      }
      if (payload.method === "interfaces/list") {
        await persistProfileA();
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result: profileAListResult(profileA),
        });
      }
      if (payload.method === "interfaces/get") {
        const interfaceCid = String(payload.params?.interface_cid ?? "");
        const result = await profileAResult(interfaceCid);
        return result
          ? sendJson(res, 200, {
              jsonrpc: "2.0",
              id: payload.id ?? null,
              result,
            })
          : sendJson(res, 200, {
              jsonrpc: "2.0",
              id: payload.id ?? null,
              error: { code: -32602, message: "Unknown interface_cid" },
            });
      }
      if (payload.method === "interfaces/compat") {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result: profileACompatResult(profileA, payload.params),
        });
      }
      if (payload.method === "interfaces/select") {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result: profileASelectResult(profileA, payload.params),
        });
      }
      if (payload.method === "mcp++/p2p/peers") {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result: profileEPeersResult("ipfs_datasets_py"),
        });
      }
      if (PROFILE_H_METHODS.has(payload.method)) {
        try { return sendJson(res, 200, { jsonrpc: "2.0", id: payload.id ?? null, result: await profileH.call(payload.method, payload.params ?? {}) }); }
        catch (error) { return sendJson(res, 200, { jsonrpc: "2.0", id: payload.id ?? null, error: { code: error instanceof ProfileHAdapterError ? error.code : -32603, message: error instanceof Error ? error.message : String(error), data: error instanceof ProfileHAdapterError ? error.data : {} } }); }
      }
      if (payload.method.startsWith("mcp++/dag/")) {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result: eventDagResult(payload.method.slice("mcp++/dag/".length), payload.params ?? {}),
        });
      }
      if (payload.method.startsWith("mcp++/ucan/")) {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result: await profileCResult(
            payload.method.slice("mcp++/ucan/".length),
            payload.params ?? {},
          ),
        });
      }
      if (payload.method === "mcp++/execute") {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result: await executeDatasetsProfileB(payload.params ?? {}),
        });
      }
      if (payload.method === "tools/list") {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result: { tools },
        });
      }
      if (payload.method === "tools/call") {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result: await callDatasetTool(payload),
        });
      }
      return sendJson(res, 200, {
        jsonrpc: "2.0",
        id: payload.id ?? null,
        error: {
          code: -32601,
          message: `Unsupported method ${payload.method}`,
        },
      });
    }
    return sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    if (url?.pathname === "/mcp") {
      return sendJson(res, 200, {
        jsonrpc: "2.0",
        id: rpcRequestId,
        error: {
          code: error instanceof ProfileBRequestError ? error.code : -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof ProfileBRequestError ? error.code : -32603,
    });
  }
});

async function executeDatasetsProfileB(params) {
  const profileC = await profileCService;
  const result = await executeProfileB({
    catalog: profileA,
    params,
    invoke: (tool, args) =>
      callDatasetTool({ params: { name: tool, arguments: args } }),
    artifactStore,
    authorize: async (request) => {
      const authorization = await validateProfileCInvocation(profileC, "ipfs_datasets_py", params, request.tool);
      if (!authorization.valid) throw new ProfileBRequestError(authorization.reason || "Profile C UCAN authorization failed.");
    },
  });
  result.event_dag = eventDag.record(result.event);
  return result;
}

function eventDagResult(operation, params) {
  switch (operation) {
    case "frontier": return eventDag.frontier();
    case "history": return eventDag.history(params.limit);
    case "provenance": return eventDag.provenance(String(params.event_cid ?? params.cid ?? ""), params.limit);
    case "append": return eventDag.record(params.event ?? params);
    case "compact":
    case "archive": return eventDag.compact(params);
    case "archives": return eventDag.archives();
    case "certificate/get": return eventDag.certificate(String(params.certificate_cid ?? "")) ?? { found: false };
    case "certificate/verify": return eventDag.verify(params.certificate_cid ?? params.certificate ?? params);
    case "inclusion": return eventDag.inclusion(String(params.event_cid ?? params.cid ?? "")) ?? { found: false };
    default: throw new Error(`Unsupported Event DAG operation: ${operation}`);
  }
}

async function profileCResult(operation, params) {
  const profileC = await profileCService;
  switch (operation) {
    case "identity": return profileC.identity(params);
    case "delegate": return profileC.delegate(params);
    case "validate": return profileC.validate(params);
    case "revoke": return profileC.revoke(params);
    default: throw new Error(`Unsupported Profile C operation: ${operation}`);
  }
}

async function persistProfileA() {
  if (!profileAPersistence) {
    profileAPersistence = artifactStore
      .persistProfileA(profileA)
      .catch((error) => ({
        profile: "A",
        complete: false,
        error: error instanceof Error ? error.message : String(error),
      }));
  }
  return profileAPersistence;
}

async function profileAResult(interfaceCid) {
  const result = profileAGetResult(profileA, interfaceCid);
  return result
    ? { ...result, artifact_persistence: await persistProfileA() }
    : null;
}

async function persistArtifactRequest(payload) {
  return artifactStore.persistBytes({
    cid: String(payload?.cid ?? ""),
    bytes: decodeBase64(payload?.bytes_base64),
    profile: String(payload?.profile ?? "unknown"),
    kind: String(payload?.kind ?? "artifact"),
    service: String(payload?.service ?? "ipfs_datasets_py"),
    pin: payload?.pin !== false,
  });
}

async function getArtifactResponse(cid) {
  const result = await artifactStore.getArtifact(cid);
  if (!result.found)
    return { ...result, error: result.error ?? "artifact_not_found" };
  return {
    found: true,
    verified: result.verified,
    backend: result.backend,
    cid: result.cid,
    bytes_base64: result.bytes.toString("base64"),
    metadata: result.metadata,
  };
}

server.listen(port, host, () => {
  console.log(
    `ipfs_datasets_py compatibility MCP adapter listening on http://${host}:${port}`,
  );
  console.log(`registered tool descriptors: ${tools.length}`);
});

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

function loadDatasetTools() {
  const toolsRoot = path.join(
    datasetsRoot,
    "ipfs_datasets_py",
    "mcp_server",
    "tools",
  );
  const discovered = [];
  try {
    for (const entry of fs.readdirSync(toolsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      const categoryPath = path.join(toolsRoot, entry.name);
      for (const file of fs.readdirSync(categoryPath, {
        withFileTypes: true,
      })) {
        if (
          !file.isFile() ||
          !file.name.endsWith(".py") ||
          file.name.startsWith("_")
        )
          continue;
        const name = path.basename(file.name, ".py");
        discovered.push({
          name,
          category: entry.name,
          description: firstDocLine(path.join(categoryPath, file.name), name),
          inputSchema: { type: "object", additionalProperties: true },
        });
      }
    }
  } catch (error) {
    console.error(
      `ipfs_datasets_py source discovery failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return dedupeTools([...metaTools(), ...discovered]);
}

function firstDocLine(filePath, fallback) {
  try {
    const source = fs.readFileSync(filePath, "utf8");
    const match = source.match(/^[\s\S]*?^[ \t]*(?:\"\"\"|''')\s*([^\n\r]+)/m);
    return match?.[1]?.trim() || `ipfs_datasets_py ${fallback} tool.`;
  } catch (_error) {
    return `ipfs_datasets_py ${fallback} tool.`;
  }
}

function metaTools() {
  return [
    {
      name: "tools_list_categories",
      description: "List ipfs_datasets_py MCP tool categories.",
      inputSchema: { type: "object", additionalProperties: true },
    },
    {
      name: "tools_list_tools",
      description: "List ipfs_datasets_py MCP tools in a category.",
      inputSchema: { type: "object", additionalProperties: true },
    },
    {
      name: "tools_get_schema",
      description: "Return an ipfs_datasets_py MCP tool schema.",
      inputSchema: { type: "object", additionalProperties: true },
    },
    {
      name: "tools_dispatch",
      description:
        "Dispatch an ipfs_datasets_py MCP tool by category and tool name.",
      inputSchema: { type: "object", additionalProperties: true },
    },
  ];
}

function dedupeTools(rows) {
  const seen = new Set();
  return (
    rows
      // MCP tool names are a service-wide namespace. A category is useful
      // metadata, but it cannot make duplicate descriptors callable.
      .filter(
        (tool) => tool.name && !seen.has(tool.name) && seen.add(tool.name),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
  );
}

async function callDatasetTool(payload) {
  const params = payload.params ?? payload ?? {};
  const name =
    params.name ??
    params.tool ??
    params.tool_name ??
    payload.name ??
    payload.tool;
  const args =
    params.arguments ??
    params.params ??
    payload.arguments ??
    payload.args ??
    {};
  if (name === "tools_list_categories") {
    return content({ categories: categoryRows() }, name);
  }
  if (name === "tools_list_tools") {
    const category = args.category;
    return content(
      { category, tools: tools.filter((tool) => tool.category === category) },
      name,
      { category },
    );
  }
  if (name === "tools_get_schema") {
    const tool = findTool(args.category, args.tool ?? args.name);
    return content(
      {
        name: args.tool ?? args.name,
        schema: tool?.inputSchema ?? null,
        found: Boolean(tool),
      },
      name,
    );
  }
  if (name === "tools_dispatch") {
    return dispatch(
      args.category,
      args.tool ?? args.name,
      args.params ?? args.arguments ?? {},
    );
  }
  const tool = findTool(null, name);
  return tool
    ? dispatch(tool.category, tool.name, args)
    : errorResult(`Unknown ipfs_datasets_py tool: ${name}`, name);
}

async function dispatch(category, name, params) {
  const tool = findTool(category, name);
  if (!tool)
    return errorResult(
      `Unknown ipfs_datasets_py tool: ${name}`,
      "tools_dispatch",
      { category, name },
    );
  const execution = await invokeDashboardTool(tool, params);
  return {
    isError: !execution.ok,
    content: [{ type: "json", json: execution }],
    receipt: receipt("tools_dispatch", {
      category: tool.category,
      target: tool.name,
      dashboard_status: execution.status ?? 0,
    }),
  };
}

async function invokeDashboardTool(tool, params) {
  const endpoint = `${dashboardUrl}/api/mcp/tools/${encodeURIComponent(tool.category)}/${encodeURIComponent(tool.name)}/execute`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(params && typeof params === "object" ? params : {}),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    const result = parseJson(text) ?? { raw: text };
    return {
      ok: response.ok && result.status !== "failed",
      status: response.status,
      endpoint,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function categoryRows() {
  const counts = new Map();
  for (const tool of tools.filter((tool) => !META_TOOLS.includes(tool.name))) {
    counts.set(tool.category, (counts.get(tool.category) ?? 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
}

function findTool(category, name) {
  if (!name) return null;
  const requested = String(name);
  const bareName =
    category &&
    (requested.startsWith(`${category}.`) ||
      requested.startsWith(`${category}/`))
      ? requested.slice(category.length + 1)
      : requested;
  return (
    tools.find(
      (tool) =>
        tool.name === bareName && (!category || tool.category === category),
    ) ?? null
  );
}

function content(json, tool, extra = {}) {
  return { content: [{ type: "json", json }], receipt: receipt(tool, extra) };
}

function errorResult(message, tool, extra = {}) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    receipt: receipt(tool, extra),
  };
}

function receipt(tool, extra = {}) {
  return {
    adapter: "swissknife-ipfs-datasets-compat",
    tool,
    generated_at: new Date().toISOString(),
    ...extra,
  };
}

function healthPayload() {
  return {
    status: "ok",
    server: "swissknife-ipfs-datasets-compat",
    adapter_version: ADAPTER_VERSION,
    tools_count: tools.length,
    source_root: datasetsRoot,
    dashboard_url: dashboardUrl,
    pid: process.pid,
  };
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(parseJson(body) ?? {}));
    req.on("error", reject);
  });
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_error) {
    return null;
  }
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...headers,
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}
