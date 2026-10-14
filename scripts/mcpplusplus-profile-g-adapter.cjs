"use strict";

// MCP++ Profile G (risk-scheduling) bridge for the compat adapters.
//
// The desktop client inspects every configured MCP++ service with the
// JSON-RPC method `mcp++/risk/profile` (Profile G), and the Agent
// Supervisor gateway maps its state reads (goals/tasks lists, schedule
// frontier/status, risk evidence/history) onto the wider Profile G method
// set. The Python backends own those methods; the compat adapters are
// facades and must surface the owning backend's own answers — never
// adapter-invented ones:
//
//   ipfs_accelerate_py -> proxied to the upstream MCP server through the
//                         normative REST bindings (PROFILE_G_REST_BINDINGS).
//                         The upstream is a long-running stateful backend,
//                         so reads and writes both proxy.
//   ipfs_kit_py        -> ipfs_kit_py.mcp_server.mcplusplus
//                         .profile_g_transport.get_dispatcher().dispatch(...)
//                         in a persistent Python worker process (one per
//                         adapter, JSON-lines over stdio).
//   ipfs_datasets_py   -> ipfs_datasets_py.mcp_server.profile_g_service
//                         .get_profile_g_service().dispatch(...) in a
//                         persistent Python worker process.
//
// The Python worker is a long-lived bridge process, mirroring how the
// backends themselves serve: the accelerate upstream keeps its Profile G
// store in its server process, and kit's runtime coordinator is likewise
// in-process (durable state is rebuilt from the Event DAG by design).
// Profile G state therefore lives for the adapter process lifetime.
//
// Methods an adapter does not serve keep the method-not-supported error
// (-32601). When the owning backend cannot answer a served method, the
// bridge fails with the Profile G provider error the Python dispatchers
// themselves raise (G_PROVIDER_UNAVAILABLE, JSON-RPC -32051, retryable)
// instead of fabricating a result.

const { spawn } = require("node:child_process");

const PROFILE_G_CAPABILITY = "mcp++/risk-scheduling";
const PROFILE_G_RISK_PROFILE_METHOD = "mcp++/risk/profile";
const PROFILE_G_REST_PATH = "/mcp/risk/profile";
const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const PYTHON_TIMEOUT_MS = 120_000;

// Canonical Profile G method set (mirrors PROFILE_G_METHODS in
// ipfs_datasets_py.mcp_server.profile_g_service).
const PROFILE_G_METHODS = new Set([
  "mcp++/risk/profile",
  "mcp++/goals/create",
  "mcp++/goals/get",
  "mcp++/goals/list",
  "mcp++/goals/decompose",
  "mcp++/goals/select",
  "mcp++/tasks/create",
  "mcp++/tasks/get",
  "mcp++/tasks/list",
  "mcp++/tasks/ready",
  "mcp++/risk/assess",
  "mcp++/risk/evidence",
  "mcp++/risk/history",
  "mcp++/neighborhood/query",
  "mcp++/neighborhood/attest",
  "mcp++/schedule/frontier",
  "mcp++/schedule/status",
  "mcp++/schedule/propose",
  "mcp++/schedule/claim",
  "mcp++/schedule/renew",
  "mcp++/schedule/release",
  "mcp++/schedule/resolve",
  "mcp++/schedule/reconcile",
]);

// Read-only subset: safe to serve from a per-process backend store.
const PROFILE_G_READ_METHODS = new Set([
  "mcp++/risk/profile",
  "mcp++/goals/get",
  "mcp++/goals/list",
  "mcp++/tasks/get",
  "mcp++/tasks/list",
  "mcp++/tasks/ready",
  "mcp++/risk/evidence",
  "mcp++/risk/history",
  "mcp++/neighborhood/query",
  "mcp++/schedule/frontier",
  "mcp++/schedule/status",
]);

// Canonical REST bindings (mirrors PROFILE_G_REST_BINDINGS in
// ipfs_datasets_py.mcp_server.profile_g_service).
const PROFILE_G_REST_BINDINGS = {
  "mcp++/risk/profile": ["GET", "/mcp/risk/profile"],
  "mcp++/goals/create": ["POST", "/mcp/goals"],
  "mcp++/goals/get": ["GET", "/mcp/goals/{cid}"],
  "mcp++/goals/list": ["GET", "/mcp/goals"],
  "mcp++/goals/decompose": ["POST", "/mcp/goals/{cid}/decompose"],
  "mcp++/goals/select": ["POST", "/mcp/goals/{cid}/select"],
  "mcp++/tasks/create": ["POST", "/mcp/tasks"],
  "mcp++/tasks/get": ["GET", "/mcp/tasks/{cid}"],
  "mcp++/tasks/list": ["GET", "/mcp/tasks"],
  "mcp++/tasks/ready": ["GET", "/mcp/tasks/ready"],
  "mcp++/risk/assess": ["POST", "/mcp/risk/assess"],
  "mcp++/risk/evidence": ["GET", "/mcp/risk/evidence"],
  "mcp++/risk/history": ["GET", "/mcp/risk/history"],
  "mcp++/neighborhood/query": ["POST", "/mcp/neighborhood/query"],
  "mcp++/neighborhood/attest": ["POST", "/mcp/neighborhood/attest"],
  "mcp++/schedule/frontier": ["GET", "/mcp/schedule/frontier"],
  "mcp++/schedule/status": ["GET", "/mcp/schedule/status/{task_cid}"],
  "mcp++/schedule/propose": ["POST", "/mcp/schedule/proposals"],
  "mcp++/schedule/claim": ["POST", "/mcp/schedule/claims"],
  "mcp++/schedule/renew": ["POST", "/mcp/schedule/claims/{claim_cid}/renew"],
  "mcp++/schedule/release": ["POST", "/mcp/schedule/claims/{claim_cid}/release"],
  "mcp++/schedule/resolve": ["POST", "/mcp/schedule/resolutions"],
  "mcp++/schedule/reconcile": ["POST", "/mcp/schedule/reconcile"],
};

const ERROR_NUMBERS = {
  G_INVALID_ARTIFACT: -32602,
  G_CAPABILITY_NOT_NEGOTIATED: -32040,
  G_CID_MISMATCH: -32041,
  G_AUTHORITY_DENIED: -32042,
  G_POLICY_DENIED: -32043,
  G_NOT_READY: -32044,
  G_IDEMPOTENCY_CONFLICT: -32045,
  G_CLAIM_CONFLICT: -32046,
  G_LEASE_EXPIRED: -32047,
  G_QUORUM_UNAVAILABLE: -32049,
  G_LIMIT_EXCEEDED: -32050,
  G_PROVIDER_UNAVAILABLE: -32051,
  G_EVIDENCE_INVALID: -32052,
  G_REDACTED: -32053,
};

class ProfileGAdapterError extends Error {
  constructor(code, message, data = {}) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

function providerUnavailableError(service, method, cause) {
  const detail = cause instanceof Error ? cause.message : String(cause ?? "");
  return new ProfileGAdapterError(
    ERROR_NUMBERS.G_PROVIDER_UNAVAILABLE,
    "Profile G provider is unavailable",
    {
      code: "G_PROVIDER_UNAVAILABLE",
      message: "Profile G provider is unavailable",
      retryable: true,
      details: {
        method,
        service,
        ...(detail ? { cause: detail.slice(0, 300) } : {}),
      },
    },
  );
}

function invalidArtifactError(method, message) {
  return new ProfileGAdapterError(ERROR_NUMBERS.G_INVALID_ARTIFACT, message, {
    code: "G_INVALID_ARTIFACT",
    message,
    retryable: false,
    details: { method },
  });
}

// Persistent Python worker bridge: one long-lived Python process per
// adapter speaking JSON-lines over stdio ({id, method, params} ->
// {id, result|error}). The backend import (tens of seconds on a loaded
// host) is paid once at worker start — the adapters warm it at listen
// time — and the backend's own store persists for the worker's lifetime,
// exactly as it does inside the backends' own server processes.
function createPythonWorkerBridge({ python, cwd, pythonPath, code, service }) {
  let worker = null; // { child, pending: Map<id, {resolve, reject, method}>, buffer, stderrTail }
  let nextId = 1;

  function failAll(state, cause) {
    for (const entry of state.pending.values()) {
      entry.reject(providerUnavailableError(service, entry.method, cause));
    }
    state.pending.clear();
  }

  function ensureWorker() {
    if (worker) return worker;
    const env = {
      ...process.env,
      PYTHONPATH: [...pythonPath, process.env.PYTHONPATH].filter(Boolean).join(require("node:path").delimiter),
    };
    const child = spawn(python, ["-c", code], { cwd, env });
    const state = { child, pending: new Map(), buffer: "", stderrTail: "" };
    child.stdout.on("data", (chunk) => {
      state.buffer += chunk.toString("utf8");
      let newline = state.buffer.indexOf("\n");
      while (newline >= 0) {
        const line = state.buffer.slice(0, newline).trim();
        state.buffer = state.buffer.slice(newline + 1);
        newline = state.buffer.indexOf("\n");
        if (!line) continue;
        let payload;
        try { payload = JSON.parse(line); } catch { continue; }
        const entry = state.pending.get(payload.id);
        if (!entry) continue;
        state.pending.delete(payload.id);
        clearTimeout(entry.timer);
        if (payload.error && typeof payload.error === "object") {
          const wire = payload.error;
          const codeName = typeof wire.data?.code === "string" ? wire.data.code : null;
          entry.reject(new ProfileGAdapterError(
            typeof wire.code === "number" ? wire.code : (ERROR_NUMBERS[codeName] ?? -32603),
            String(wire.message ?? "Profile G backend error"),
            wire.data ?? (codeName ? { code: codeName } : {}),
          ));
        } else if ("result" in payload) {
          entry.resolve(payload.result);
        } else {
          entry.reject(providerUnavailableError(service, entry.method, "backend returned no result"));
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      state.stderrTail = (state.stderrTail + chunk.toString("utf8")).slice(-2000);
    });
    const onGone = (cause) => {
      if (worker === state) worker = null;
      failAll(state, state.stderrTail.trim() || cause);
    };
    child.on("error", (error) => onGone(error.message));
    child.on("close", (status) => onGone(`python worker exited ${status}`));
    worker = state;
    return state;
  }

  async function dispatch(method, params) {
    const state = ensureWorker();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        try { state.child.kill("SIGKILL"); } catch { /* already gone */ }
        if (worker === state) worker = null;
        failAll(state, `python dispatch timed out after ${PYTHON_TIMEOUT_MS}ms`);
        reject(providerUnavailableError(service, method, `python dispatch timed out after ${PYTHON_TIMEOUT_MS}ms`));
      }, PYTHON_TIMEOUT_MS);
      state.pending.set(id, { resolve, reject, method, timer });
      state.child.stdin.write(`${JSON.stringify({ id, method, params: params ?? {} })}\n`);
    });
  }

  return dispatch;
}

const KIT_WORKER_CODE = `
import json, sys
from ipfs_kit_py.mcp_server.mcplusplus.profile_g_transport import (
    ERROR_NUMBERS,
    ProfileGError,
    get_dispatcher,
)

dispatcher = get_dispatcher()
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    request = json.loads(line)
    try:
        result = dispatcher.dispatch(request["method"], request.get("params") or {})
        print(json.dumps({"id": request["id"], "result": result}), flush=True)
    except ProfileGError as error:
        data = {"code": error.code, "message": error.message, "retryable": bool(error.retryable)}
        if getattr(error, "details", None):
            data["details"] = error.details
        wire = {"code": ERROR_NUMBERS.get(error.code, -32603), "message": error.message, "data": data}
        print(json.dumps({"id": request["id"], "error": wire}), flush=True)
    except Exception as error:
        wire = {"code": -32603, "message": str(error), "data": {}}
        print(json.dumps({"id": request["id"], "error": wire}), flush=True)
`;

const DATASETS_WORKER_CODE = `
import json, sys
from ipfs_datasets_py.mcp_server.profile_g_service import (
    ProfileGError,
    profile_g_jsonrpc_error,
    get_profile_g_service,
)

service = get_profile_g_service()
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    request = json.loads(line)
    try:
        result = service.dispatch(request["method"], request.get("params") or {})
        print(json.dumps({"id": request["id"], "result": result}), flush=True)
    except ProfileGError as error:
        wire = profile_g_jsonrpc_error(None, error)["error"]
        print(json.dumps({"id": request["id"], "error": wire}), flush=True)
    except Exception as error:
        wire = {"code": -32603, "message": str(error), "data": {}}
        print(json.dumps({"id": request["id"], "error": wire}), flush=True)
`;

function createProfileGAdapter({
  service,
  resolveCall,
  methods = PROFILE_G_METHODS,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  now = Date.now,
} = {}) {
  if (typeof resolveCall !== "function") {
    throw new TypeError("createProfileGAdapter requires a resolveCall function.");
  }
  let cached = null; // { value, checkedAt }
  let cachedError = null; // { error, checkedAt }
  const FAILURE_CACHE_TTL_MS = 5_000;

  async function profile({ force = false } = {}) {
    if (!force && cached && now() - cached.checkedAt < cacheTtlMs) return cached.value;
    if (!force && cachedError && now() - cachedError.checkedAt < FAILURE_CACHE_TTL_MS) {
      throw cachedError.error;
    }
    try {
      const value = await resolveCall(PROFILE_G_RISK_PROFILE_METHOD, {});
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw providerUnavailableError(service, PROFILE_G_RISK_PROFILE_METHOD, "backend returned a non-object profile");
      }
      cached = { value, checkedAt: now() };
      cachedError = null;
      return value;
    } catch (error) {
      const adapterError = error instanceof ProfileGAdapterError
        ? error
        : providerUnavailableError(service, PROFILE_G_RISK_PROFILE_METHOD, error);
      cachedError = { error: adapterError, checkedAt: now() };
      throw adapterError;
    }
  }

  async function call(method, params = {}) {
    if (!PROFILE_G_METHODS.has(method) || !methods.has(method)) {
      throw new ProfileGAdapterError(-32601, `Unsupported Profile G method ${method}`);
    }
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw invalidArtifactError(method, "params must be an object");
    }
    if (method === PROFILE_G_RISK_PROFILE_METHOD) return profile();
    try {
      return await resolveCall(method, params);
    } catch (error) {
      if (error instanceof ProfileGAdapterError) throw error;
      throw providerUnavailableError(service, method, error);
    }
  }

  return { service, profile, call };
}

function createHttpProfileGAdapter({ service, upstream, fetchImpl = globalThis.fetch, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...rest }) {
  const baseUrl = String(upstream ?? "").replace(/\/$/, "");
  return createProfileGAdapter({
    service,
    ...rest,
    resolveCall: async (method, params) => {
      if (!baseUrl) throw providerUnavailableError(service, method, "no upstream configured");
      const binding = PROFILE_G_REST_BINDINGS[method];
      if (!binding) throw new ProfileGAdapterError(-32601, `Unsupported Profile G method ${method}`);
      const [httpMethod, pathTemplate] = binding;
      const remaining = { ...(params ?? {}) };
      const path = pathTemplate.replace(/\{(cid|task_cid|claim_cid)\}/g, (match, name) => {
        const value = name === "cid"
          ? (remaining.goal_cid ?? remaining.task_cid ?? remaining.cid)
          : remaining[name];
        if (typeof value !== "string" || !value) {
          throw invalidArtifactError(method, `missing path parameter ${name}`);
        }
        if (name === "cid") {
          delete remaining.goal_cid;
          delete remaining.task_cid;
          delete remaining.cid;
        } else {
          delete remaining[name];
        }
        return encodeURIComponent(value);
      });
      const query = new URLSearchParams();
      if (httpMethod === "GET") {
        for (const [key, value] of Object.entries(remaining)) {
          if (value === undefined || value === null) continue;
          query.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
        }
      }
      const url = `${baseUrl}${path}${[...query.keys()].length ? `?${query.toString()}` : ""}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error(`Profile G upstream request timed out after ${requestTimeoutMs}ms.`)), requestTimeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: httpMethod,
          headers: httpMethod === "GET" ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
          body: httpMethod === "GET" ? undefined : JSON.stringify(remaining),
          signal: controller.signal,
        });
        const text = await response.text();
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        if (!response.ok) {
          const wire = body && typeof body === "object" ? body : {};
          const codeName = typeof wire.data?.code === "string" ? wire.data.code : null;
          if (typeof wire.code === "number" || codeName) {
            throw new ProfileGAdapterError(
              typeof wire.code === "number" ? wire.code : (ERROR_NUMBERS[codeName] ?? -32603),
              String(wire.message ?? `Profile G upstream returned HTTP ${response.status}`),
              wire.data ?? {},
            );
          }
          throw providerUnavailableError(service, method, `upstream returned HTTP ${response.status}`);
        }
        if (body && typeof body === "object" && "result" in body && body.result && typeof body.result === "object") {
          return body.result;
        }
        return body;
      } catch (error) {
        if (error instanceof ProfileGAdapterError) throw error;
        throw providerUnavailableError(service, method, error);
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}

function createPythonProfileGAdapter({ service, python, cwd, pythonPath, code, ...rest }) {
  const dispatch = createPythonWorkerBridge({ python, cwd, pythonPath, code, service });
  return createProfileGAdapter({
    service,
    ...rest,
    resolveCall: (method, params) => dispatch(method, params),
  });
}

function createKitProfileGAdapter({ python = process.env.PYTHON ?? "python", workspaceRoot, ...rest } = {}) {
  const path = require("node:path");
  const kitRoot = path.join(workspaceRoot, "external", "ipfs_kit");
  const datasetsRoot = path.join(workspaceRoot, "external", "ipfs_datasets");
  const accelerateRoot = path.join(workspaceRoot, "external", "ipfs_accelerate");
  return createPythonProfileGAdapter({
    service: "ipfs_kit_py",
    python,
    cwd: workspaceRoot,
    pythonPath: [kitRoot, datasetsRoot, accelerateRoot],
    code: KIT_WORKER_CODE,
    ...rest,
  });
}

function createDatasetsProfileGAdapter({ python, datasetsRoot, ...rest } = {}) {
  const path = require("node:path");
  const fs = require("node:fs");
  const workspaceRoot = path.resolve(datasetsRoot, "..", "..");
  const resolvedPython = python
    ?? process.env.PYTHON
    ?? (fs.existsSync(path.join(workspaceRoot, ".venv", "bin", "python"))
      ? path.join(workspaceRoot, ".venv", "bin", "python")
      : "python3");
  return createPythonProfileGAdapter({
    service: "ipfs_datasets_py",
    python: resolvedPython,
    cwd: workspaceRoot,
    pythonPath: [datasetsRoot],
    code: DATASETS_WORKER_CODE,
    ...rest,
  });
}

module.exports = {
  PROFILE_G_CAPABILITY,
  PROFILE_G_METHODS,
  PROFILE_G_READ_METHODS,
  PROFILE_G_REST_BINDINGS,
  PROFILE_G_RISK_PROFILE_METHOD,
  PROFILE_G_REST_PATH,
  ProfileGAdapterError,
  createProfileGAdapter,
  createHttpProfileGAdapter,
  createKitProfileGAdapter,
  createDatasetsProfileGAdapter,
};
