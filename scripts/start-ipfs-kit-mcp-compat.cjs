#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
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
const { PROFILE_G_METHODS, PROFILE_G_REST_PATH, ProfileGAdapterError, createKitProfileGAdapter } = require("./mcpplusplus-profile-g-adapter.cjs");
const { createKitToolExecutor } = require("./ipfs-kit-artifact-cat.cjs");
const { createKuboKitToolExecutor } = require("./ipfs-kit-kubo-tools.cjs");
const { GOVERNED_TOOL_DEFINITIONS, createGovernedKitExecutor } = require("./ipfs-kit-governed-tools.cjs");
const { createNativeKitForwarder, nativeKitCatalog } = require("./ipfs-kit-native-forwarder.cjs");

const REPO_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, "..");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8014;
const ADAPTER_VERSION = "0.8.0";
const META_TOOLS = [
  "tools_list_categories",
  "tools_list_tools",
  "tools_get_schema",
  "tools_dispatch",
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const host = argValue("--host", DEFAULT_HOST);
const port = Number(argValue("--port", DEFAULT_PORT));
const nativeForwarder = process.env.SWISSKNIFE_KIT_NATIVE_MCP_URL
  ? createNativeKitForwarder({ endpoint: process.env.SWISSKNIFE_KIT_NATIVE_MCP_URL }) : null;
const requireNativeReady = process.env.SWISSKNIFE_KIT_REQUIRE_NATIVE_READY === '1';
if (requireNativeReady && !nativeForwarder) throw new Error('native_kit_required_upstream_not_configured');
let tools;
let profileA;
let nativeCatalogError;
const catalogReady = nativeForwarder
  ? nativeForwarder.listTools().then(nativeTools => {
    tools = loadKitTools(nativeTools);
    profileA = buildProfileAInterface("ipfs_kit_py", tools);
  }).catch(error => {
    if (requireNativeReady) throw error;
    nativeCatalogError = error instanceof Error ? error.message : 'native_kit_catalog_unavailable';
    tools = loadKitTools([]);
    profileA = buildProfileAInterface("ipfs_kit_py", tools);
  })
  : null;
if (!nativeForwarder) {
  tools = loadKitTools();
  profileA = buildProfileAInterface("ipfs_kit_py", tools);
}
const artifactStore = createArtifactStore({
  service: "ipfs_kit_py",
  isKitService: true,
});
const executeKuboTool = createKuboKitToolExecutor();
const executeKitTool = nativeForwarder ? nativeForwarder.execute
  : createKitToolExecutor({ artifactStore, callKitWorker: async (name, args) =>
    (await executeKuboTool(name, args)) ?? callKitWorker(name, args) });
const profileCService = getProfileCService("ipfs_kit_py");
const eventDag = getEventDagService("ipfs_kit_py");
const executeGovernedKitTool = createGovernedKitExecutor({ persistArtifact: persistArtifactRequest, getArtifact: getArtifactResponse, eventDag });
const profileH = createProfileHAdapter({ service: "ipfs_kit_py" });
const profileG = createKitProfileGAdapter({ workspaceRoot: WORKSPACE_ROOT });
let profileAPersistence;

const server = http.createServer(async (req, res) => {
  let url;
  let rpcRequestId = null;
  try {
    url = new URL(req.url, `http://${host}:${port}`);
    if (
      req.method === "GET" &&
      (url.pathname === "/health" || url.pathname === "/mcp/health")
    ) {
      return sendJson(res, 200, await healthPayload());
    }
    if (req.method === "GET" && url.pathname === "/api/mcp/status") {
      return sendJson(res, 200, { success: true, data: await healthPayload() });
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
      return sendJson(res, 200, profileEPeersResult("ipfs_kit_py"));
    }
    if (req.method === "GET" && url.pathname === PROFILE_G_REST_PATH) {
      try { return sendJson(res, 200, await profileG.profile()); }
      catch (error) { return sendJson(res, 503, { code: error instanceof ProfileGAdapterError ? error.code : -32603, message: error instanceof Error ? error.message : String(error), data: error instanceof ProfileGAdapterError ? error.data : {} }); }
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
        await executeKitProfileB(await readRequestJson(req)),
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
      const result = await callKitTool(payload);
      return sendJson(res, 200, {
        jsonrpc: "2.0",
        id: payload.id ?? null,
        result,
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
            name: "swissknife-ipfs-kit-compat",
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
          result: profileEPeersResult("ipfs_kit_py"),
        });
      }
      if (PROFILE_H_METHODS.has(payload.method)) {
        try { return sendJson(res, 200, { jsonrpc: "2.0", id: payload.id ?? null, result: await profileH.call(payload.method, payload.params ?? {}) }); }
        catch (error) { return sendJson(res, 200, { jsonrpc: "2.0", id: payload.id ?? null, error: { code: error instanceof ProfileHAdapterError ? error.code : -32603, message: error instanceof Error ? error.message : String(error), data: error instanceof ProfileHAdapterError ? error.data : {} } }); }
      }
      if (PROFILE_G_METHODS.has(payload.method)) {
        try { return sendJson(res, 200, { jsonrpc: "2.0", id: payload.id ?? null, result: await profileG.call(payload.method, payload.params ?? {}) }); }
        catch (error) { return sendJson(res, 200, { jsonrpc: "2.0", id: payload.id ?? null, error: { code: error instanceof ProfileGAdapterError ? error.code : -32603, message: error instanceof Error ? error.message : String(error), data: error instanceof ProfileGAdapterError ? error.data : {} } }); }
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
          result: await executeKitProfileB(payload.params ?? {}),
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
        const result = await callKitTool(payload);
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          result,
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

async function executeKitProfileB(params) {
  const profileC = await profileCService;
  const result = await executeProfileB({
    catalog: profileA,
    params,
    invoke: (tool, args) =>
      callKitTool({ params: { name: tool, arguments: args } }),
    artifactStore,
    authorize: async (request) => {
      const authorization = await validateProfileCInvocation(profileC, "ipfs_kit_py", params, request.tool);
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
  const cid = String(payload?.cid ?? "");
  return artifactStore.persistBytes({
    cid,
    bytes: decodeBase64(payload?.bytes_base64),
    profile: String(payload?.profile ?? "unknown"),
    kind: String(payload?.kind ?? "artifact"),
    service: String(payload?.service ?? "ipfs_kit_py"),
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

function listen() { server.listen(port, host, () => {
  console.log(
    `ipfs_kit_py compatibility MCP adapter listening on http://${host}:${port}`,
  );
  console.log(`registered tool descriptors: ${tools.length}`);
  // Warm the Profile G backend dispatch in the background so the first
  // desktop inspection does not pay the cold Python import inline.
  profileG.profile().catch(() => {});
}); }
if (catalogReady) catalogReady.then(listen).catch(error => {
  console.error(`native_kit_required_catalog_unavailable: ${error instanceof Error ? error.message : 'unknown'}`);
  process.exit(1);
});
else listen();

function loadKitTools(nativeTools = []) {
  const discovered = nativeForwarder ? [] : discoverPythonKitTools();
  const fallback = nativeForwarder ? [] : readStaticKitTools();
  // Runtime discovery is intentionally merged with the maintained manifest.
  // Some ipfs_kit_py installations expose only a partial registry during
  // startup; publishing that subset would silently hide usable capabilities.
  const all = nativeForwarder
    ? nativeKitCatalog(nativeTools, [...metaTools(), ...GOVERNED_TOOL_DEFINITIONS])
    : [...metaTools(), ...GOVERNED_TOOL_DEFINITIONS, ...discovered, ...fallback];
  const seen = new Set();
  return all
    .filter((tool) => {
      if (!tool.name || seen.has(tool.name)) return false;
      seen.add(tool.name);
      return true;
    })
    .map((tool) => ({
      name: tool.name,
      category: tool.category ?? categoryForTool(tool.name),
      description: tool.description ?? "",
      inputSchema: tool.inputSchema ??
        tool.input_schema ?? { type: "object", additionalProperties: true },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function discoverPythonKitTools() {
  const python = process.env.PYTHON ?? "python";
  const kitRoot = path.join(WORKSPACE_ROOT, "external", "ipfs_kit");
  const datasetsRoot = path.join(WORKSPACE_ROOT, "external", "ipfs_datasets");
  const accelerateRoot = path.join(
    WORKSPACE_ROOT,
    "external",
    "ipfs_accelerate",
  );
  const code = `
import json
import inspect
from ipfs_kit_py.mcp.servers.unified_mcp_server import create_mcp_server
s = create_mcp_server(host="127.0.0.1", port=8014, auto_start_daemons=False, auto_start_lotus_daemon=False, register_all_tools=True)
rows = []
for name, tool in sorted(s.tools.items()):
    if not isinstance(name, str) or not name:
        continue
    if not callable(tool) or inspect.isclass(tool) or not str(getattr(tool, "__module__", "")).startswith("ipfs_kit_py."):
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
    PYTHONPATH: [kitRoot, datasetsRoot, accelerateRoot, process.env.PYTHONPATH]
      .filter(Boolean)
      .join(path.delimiter),
  };
  const result = spawnSync(python, ["-c", code], {
    cwd: WORKSPACE_ROOT,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60000,
  });
  if (result.status !== 0) {
    console.error(
      `ipfs_kit_py registry discovery failed; falling back to static manifest (${result.stderr || result.error?.message || `exit ${result.status}`})`,
    );
    return [];
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error(
      `ipfs_kit_py registry discovery returned invalid JSON; falling back to static manifest (${error.message})`,
    );
    return [];
  }
}

function readStaticKitTools() {
  const manifestPath = path.join(
    REPO_ROOT,
    "src",
    "services",
    "ipfs",
    "mcp-ipfs-kit-tools-manifest.json",
  );
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return (manifest.tools ?? []).map((tool) => ({
      name: tool.name,
      category: tool.category,
      description: tool.description,
      inputSchema: tool.inputSchema ?? {
        type: "object",
        additionalProperties: true,
      },
    }));
  } catch (_error) {
    return [];
  }
}

function metaTools() {
  return [
    {
      name: "tools_list_categories",
      description: "List hierarchical ipfs_kit_py MCP tool categories.",
      inputSchema: { type: "object", additionalProperties: true },
    },
    {
      name: "tools_list_tools",
      description: "List ipfs_kit_py MCP tools in a category.",
      inputSchema: { type: "object", additionalProperties: true },
    },
    {
      name: "tools_get_schema",
      description: "Return the schema for an ipfs_kit_py MCP tool.",
      inputSchema: { type: "object", additionalProperties: true },
    },
    {
      name: "tools_dispatch",
      description:
        "Dispatch an ipfs_kit_py MCP tool by category and tool name.",
      inputSchema: { type: "object", additionalProperties: true },
    },
  ];
}

async function callKitTool(payload) {
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
  if (name === "ipfs_pubsub_publish") {
    if (!nativeForwarder) {
      return {
        isError: true,
        content: [{ type: "json", json: { success: false, error: "native_pubsub_forwarder_required" } }],
        receipt: receipt(name, { status: "error" }),
      };
    }
    try {
      const result = await executeKitTool(name, args);
      if (!result.ok) {
        return {
          isError: true,
          content: kitFailureContent(result, "ipfs_pubsub_publish failed"),
          receipt: receipt(name, { status: "error" }),
        };
      }
      return {
        content: [{ type: "json", json: result.result }],
        receipt: executionReceipt(name, result, { target: name }),
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "json", json: { success: false, error: error instanceof Error ? error.message : "ipfs_pubsub_publish failed" } }],
        receipt: receipt(name, { status: "error" }),
      };
    }
  }
  const governedResult = await executeGovernedKitTool(name, args);
  if (governedResult !== null) {
    return { ...(governedResult.ok ? {} : { isError: true }),
      content: [{ type: 'json', json: governedResult.ok ? governedResult.result : { success: false, error: governedResult.error } }],
      receipt: receipt(name, { status: governedResult.ok ? 'ok' : 'error' }) };
  }
  // Meta tools are handled locally (no backend invocation needed).
  if (name === "tools_list_categories") {
    const grouped = groupTools(
      tools.filter((tool) => !META_TOOLS.includes(tool.name)),
    );
    return {
      content: [
        {
          type: "json",
          json: {
            categories: Array.from(grouped.entries()).map(
              ([category, items]) => ({ name: category, count: items.length }),
            ),
          },
        },
      ],
      receipt: receipt(name),
    };
  }
  if (name === "tools_list_tools") {
    const category = args?.category ?? "general";
    const grouped = groupTools(
      tools.filter((tool) => !META_TOOLS.includes(tool.name)),
    );
    return {
      content: [
        {
          type: "json",
          json: { category, tools: grouped.get(category) ?? [] },
        },
      ],
      receipt: receipt(name, { category }),
    };
  }
  if (name === "tools_get_schema") {
    const target = args?.tool ?? args?.name;
    const found = findTool(args?.category, target);
    return {
      content: [
        {
          type: "json",
          json: found?.inputSchema ?? {
            type: "object",
            additionalProperties: true,
          },
        },
      ],
      receipt: receipt(name, { target }),
    };
  }
  if (name === "tools_dispatch") {
    const category = args?.category;
    const target = args?.tool ?? args?.name;
    const params = args?.params ?? args?.arguments ?? {};
    const found = findTool(category, target);
    if (!found) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Unknown ipfs_kit_py tool: ${target}` },
        ],
        receipt: receipt(name, { category, target, status: "not_found" }),
      };
    }
    try {
      const result = await executeKitTool(found.name, params);
      if (!result.ok) {
        return {
          isError: true,
          content: kitFailureContent(result, `ipfs_kit_py tool ${target} failed`),
          receipt: receipt(name, { category: found.category, target: found.name, status: "error" }),
        };
      }
      return {
        content: [{ type: "json", json: result.result }],
        receipt: executionReceipt(name, result, { category: found.category, target: found.name }),
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `ipfs_kit_py tool ${target} failed: ${error.message}` }],
        receipt: receipt(name, { category: found.category, target: found.name, status: "error" }),
      };
    }
  }
  const found = findTool(null, name);
  if (!found) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown ipfs_kit_py tool: ${name}` }],
      receipt: receipt(name, { status: "not_found" }),
    };
  }
  // Read verified artifacts for ipfs_cat, otherwise execute the genuine
  // backend via its persistent Python worker. Both paths return actual
  // content or an honest error, including when dry_run is requested.
  try {
    const result = await executeKitTool(name, args);
    if (!result.ok) {
      return {
        isError: true,
        content: kitFailureContent(result, `ipfs_kit_py tool ${name} failed`),
        receipt: receipt(name, { category: found.category, target: found.name, status: "error" }),
      };
    }
    return {
      content: [{ type: "json", json: result.result }],
      receipt: executionReceipt(name, result, { category: found.category, target: found.name }),
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: `ipfs_kit_py tool ${name} failed: ${error.message}` }],
      receipt: receipt(name, { category: found.category, target: found.name, status: "error" }),
    };
  }
}

function kitFailureContent(result, fallback) {
  if (!result.native_error) return [{ type: 'text', text: result.error || fallback }];
  const details = result.native_error;
  return [{ type: 'json', json: { success: false, error: details.message,
    owner_error: details, ...(details.code !== undefined ? { code: details.code } : {}),
    ...(details.type ? { error_type: details.type } : {}) } }];
}

// Persistent Python worker that holds the real ipfs_kit_py MCP server and
// executes tool calls against the genuine backend implementations.
const KIT_WORKER_TIMEOUT_MS = 120000;
let kitWorkerState = null;

function kitWorkerPython() {
  const { execFileSync } = require("node:child_process");
  const candidates = [
    process.env.PYTHON,
    path.join(WORKSPACE_ROOT, ".venv", "bin", "python"),
    path.join(process.env.HOME || "/home/hatch", "workspace", "venvs", "scraping", "bin", "python"),
    "python3",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-c", "import sys"], { timeout: 15000, stdio: "ignore" });
      return candidate;
    } catch (_error) {
      // try next
    }
  }
  return "python3";
}

const KIT_WORKER_CODE = `
import asyncio
import inspect
import json
import sys
import traceback

from ipfs_kit_py.mcp.servers.unified_mcp_server import create_mcp_server

_server = create_mcp_server(
    host="127.0.0.1", port=8014,
    auto_start_daemons=False, auto_start_lotus_daemon=False,
    register_all_tools=True,
)
_tools = _server.tools or {}

def _invoke(name, args):
    tool = _tools.get(name)
    if tool is None:
        raise RuntimeError(
            f"tool '{name}' is registered in the adapter manifest but has no "
            "live implementation in this ipfs_kit_py server instance"
        )
    if isinstance(tool, dict):
        fn = tool.get("func") or tool.get("handler") or tool.get("callable")
        if fn is None:
            raise RuntimeError(f"tool '{name}' has no callable implementation")
        tool = fn
    if not callable(tool) or inspect.isclass(tool):
        raise RuntimeError(f"tool '{name}' is not callable")
    params = dict(args or {})
    # Most kit tools take a single 'arguments' dict; pass through directly
    # when the signature declares it, otherwise filter to accepted params.
    try:
        sig = inspect.signature(tool)
        accepted = sig.parameters
        has_var_kw = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in accepted.values())
        if "arguments" in accepted and len(accepted) == 1:
            result = tool(params)
        elif not has_var_kw:
            filtered = {k: v for k, v in params.items() if k in accepted}
            result = tool(**filtered)
        else:
            result = tool(**params)
    except (TypeError, ValueError):
        result = tool(params)
    if inspect.isawaitable(result):
        result = asyncio.run(result)
    return result

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        request = json.loads(line)
    except Exception as exc:
        sys.stdout.write(json.dumps({"id": None, "ok": False, "error": "bad request: " + str(exc)}) + "\\n")
        sys.stdout.flush()
        continue
    try:
        result = _invoke(request["tool"], request.get("args") or {})
        sys.stdout.write(json.dumps({"id": request.get("id"), "ok": True, "result": result}, default=str) + "\\n")
    except Exception as exc:
        sys.stdout.write(json.dumps({
            "id": request.get("id"),
            "ok": False,
            "error": type(exc).__name__ + ": " + str(exc),
        }, default=str) + "\\n")
    sys.stdout.flush()
`;

function ensureKitWorker() {
  if (kitWorkerState?.child && !kitWorkerState.child.killed) {
    return kitWorkerState;
  }
  const { spawn } = require("node:child_process");
  const kitRoot = path.join(WORKSPACE_ROOT, "external", "ipfs_kit");
  const datasetsRoot = path.join(WORKSPACE_ROOT, "external", "ipfs_datasets");
  const accelerateRoot = path.join(WORKSPACE_ROOT, "external", "ipfs_accelerate");
  const child = spawn(kitWorkerPython(), ["-u", "-c", KIT_WORKER_CODE], {
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      no_proxy: "localhost,127.0.0.1",
      NO_PROXY: "localhost,127.0.0.1",
      PYTHONPATH: [kitRoot, datasetsRoot, accelerateRoot, process.env.PYTHONPATH]
        .filter(Boolean)
        .join(path.delimiter),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const state = { child, nextId: 1, pending: new Map(), buffer: "" };
  child.stdout.on("data", (chunk) => {
    state.buffer += chunk.toString("utf8");
    let idx;
    while ((idx = state.buffer.indexOf("\n")) >= 0) {
      const line = state.buffer.slice(0, idx).trim();
      state.buffer = state.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (_error) {
        continue;
      }
      const waiter = state.pending.get(msg.id);
      if (waiter) {
        state.pending.delete(msg.id);
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    console.error(`[kit-contract-worker] ${chunk.toString("utf8").trim()}`);
  });
  child.on("exit", (code) => {
    for (const waiter of state.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({ id: waiter.id, ok: false, error: `kit worker exited (code ${code})` });
    }
    state.pending.clear();
    if (kitWorkerState === state) kitWorkerState = null;
  });
  kitWorkerState = state;
  return state;
}

function callKitWorker(tool, args) {
  const state = ensureKitWorker();
  const id = state.nextId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      resolve({ id, ok: false, error: `kit worker timed out after ${KIT_WORKER_TIMEOUT_MS}ms` });
    }, KIT_WORKER_TIMEOUT_MS);
    state.pending.set(id, { id, timer, resolve });
    try {
      state.child.stdin.write(JSON.stringify({ id, tool, args }) + "\n");
    } catch (error) {
      state.pending.delete(id);
      clearTimeout(timer);
      resolve({ id, ok: false, error: `kit worker write failed: ${error.message}` });
    }
  });
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
  return new Map(
    Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function findTool(category, name) {
  if (!name) return null;
  const normalized = normalizeName(name);
  return (
    tools.find((tool) => {
      const toolCategory = tool.category ?? categoryForTool(tool.name);
      return (
        normalizeName(tool.name) === normalized ||
        normalizeName(`${toolCategory}.${tool.name}`) === normalized ||
        (category &&
          toolCategory === category &&
          normalizeName(tool.name) === normalized)
      );
    }) ?? null
  );
}

function categoryForTool(name) {
  const value = String(name ?? "");
  const lower = value.toLowerCase();
  if (lower.startsWith("journal_")) return "journal";
  if (lower.startsWith("audit_")) return "audit";
  if (lower.startsWith("wal_")) return "wal";
  if (lower.startsWith("pin_")) return "pin";
  if (lower.startsWith("backend_")) return "backend";
  if (lower.startsWith("bucket_") || lower.includes("bucket")) return "bucket";
  if (lower.startsWith("vfs_")) return "vfs";
  if (lower.startsWith("secrets_") || lower.includes("secret"))
    return "secrets";
  if (lower.startsWith("ipfs_")) return "ipfs";
  if (value.includes(".")) return value.split(".")[0];
  if (value.includes("_")) return value.split("_")[0];
  return "general";
}

function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[/.:-]+/g, "_")
    .replace(/_+/g, "_");
}

function receipt(tool, extra = {}) {
  return {
    adapter: "swissknife-ipfs-kit-compat",
    tool,
    status: "ok",
    generated_at: new Date().toISOString(),
    ...extra,
  };
}

function executionReceipt(tool, result, extra = {}) {
  return receipt(tool, { ...extra, ...(nativeForwarder ? {
    execution_backend: 'native_python', native_provenance: result.native_receipt?.native_provenance,
    native_receipt: result.native_receipt,
  } : {}) });
}

async function healthPayload() {
  const base = {
    status: "ok",
    server: "swissknife-ipfs-kit-compat",
    adapter_version: ADAPTER_VERSION,
    tools_count: tools.length,
    pid: process.pid,
    platform: os.platform(),
  };
  if (!nativeForwarder) return base;
  try {
    if (nativeCatalogError) throw new Error(nativeCatalogError);
    const upstream = await nativeForwarder.health();
    return { ...base, backend: 'native_python', upstream_target: nativeForwarder.endpoint,
      upstream_available: true, native_upstream: upstream };
  } catch (error) {
    return { ...base, status: 'degraded', backend: 'native_python', upstream_target: nativeForwarder.endpoint,
      upstream_available: false, error: error instanceof Error ? error.message : 'native_kit_health_failed' };
  }
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_error) {
        resolve({});
      }
    });
    req.on("error", reject);
  });
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
