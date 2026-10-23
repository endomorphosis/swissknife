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
const { PROFILE_G_METHODS, PROFILE_G_REST_PATH, ProfileGAdapterError, createDatasetsProfileGAdapter } = require("./mcpplusplus-profile-g-adapter.cjs");

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
// ---------------------------------------------------------------------------
// Contract-operation direct execution.
//
// The GUI descriptor contract (web/js/core/app-capability-gateway.js
// CAPABILITY_DEFINITIONS) promises 12 ipfs.datasets.operation.* operations.
// The module-basename tool discovery above cannot address function-level
// tools (e.g. semantic_search() inside search_tools.py), and dispatch()
// executes through a dashboard that is not part of the runtime stack.
// This table wires each contracted operation to its genuine Python
// implementation in the pinned ipfs_datasets_py source and executes it
// directly via a persistent Python worker. Operations with no genuine
// implementation (null) return an honest capability error instead of the
// misleading "Unknown tool" routing failure.
// ---------------------------------------------------------------------------
const CONTRACT_OP_IMPLEMENTATIONS = {
  // Read operations (side-effect free).
  get: {
    kind: "read",
    module: "ipfs_datasets_py.mcp_server.tools.dataset_tools.load_dataset",
    func: "load_dataset",
    argMap: { dataset_id: "source", cid: "source", path: "source" },
    note: "loads a dataset record from a source identifier",
  },
  embed: {
    kind: "read",
    module: "ipfs_datasets_py.embeddings.generation_engine",
    func: "generate_batch_embeddings",
    argMap: {},
    note: "batch text embedding via the real generation engine (takes the GUI's texts array directly)",
  },
  vector_search: {
    kind: "read",
    module: "ipfs_datasets_py.mcp_server.tools.vector_tools.vector_store_management",
    func: "search_vector_index",
    argMap: { collection: "index_name" },
    note: "text-query vector search; collection maps to index_name",
  },
  // Operations whose pinned backend implementations have been fixed to
  // execute genuine code (previously mocks/stubs/broken).
  semantic_search: {
    kind: "read",
    module: "ipfs_datasets_py.mcp_server.tools.search_tools.search_tools",
    func: "semantic_search",
    argMap: {},
    note: "genuine semantic search via vector-store manager (fixed: no longer returns mock results)",
  },
  // Write operations (confirmation-gated in the UI; executed honestly here).
  vector_index: {
    kind: "write",
    module: "ipfs_datasets_py.mcp_server.tools.vector_tools.vector_store_management",
    func: "create_vector_index",
    argMap: { collection: "index_name" },
    // The GUI supplies a single text content + metadata; this backend takes a
    // documents list. The manager embeds internally, so no pre-embed is needed.
    documentsFrom: ["content", "metadata"],
    note: "creates a vector index via the vector-store manager (same manager as vector_search)",
  },
  index: {
    kind: "write",
    module: "ipfs_datasets_py.mcp_server.tools.dataset_tools.process_dataset",
    func: "process_dataset",
    argMap: { dataset_id: "dataset_source" },
    note: "dataset preparation pipeline (closest genuine implementation of the preparation-job operation)",
  },
  pin: {
    kind: "write",
    module: "ipfs_datasets_py.mcp_server.tools.ipfs_tools.pin_to_ipfs",
    func: "pin_to_ipfs",
    argMap: { cid: "content_source", path: "content_source", data: "content_source" },
    note: "pins content to IPFS via the real pinner",
  },
  publish: {
    kind: "write",
    module: "ipfs_datasets_py.mcp_server.tools.dataset_tools.save_dataset",
    func: "save_dataset",
    argMap: {},
    // save_dataset requires dataset_data; the GUI supplies dataset_id + metadata,
    // so they are combined into the dataset_data payload (destination stays unset).
    combineInto: { dataset_data: ["dataset_id", "metadata"] },
    // save_dataset requires a destination; default to the workspace published-datasets
    // directory (interpolated with the GUI's dataset_id), JSON format.
    defaults: { format: "json" },
    destinationTemplate: "/home/hatch/workspace/published_datasets/{dataset_id}.json",
    note: "saves/publishes a dataset (GUI dataset_id+metadata combined into dataset_data)",
  },
  record_provenance: {
    kind: "write",
    module: "ipfs_datasets_py.mcp_server.tools.provenance_tools.record_provenance",
    func: "record_provenance",
    argMap: {},
    note: "records data provenance via EnhancedProvenanceManager (fixed import)",
  },
  browse: {
    kind: "read",
    module: "ipfs_datasets_py.mcp_server.tools.dataset_tools.browse_datasets",
    func: "browse",
    argMap: {},
    note: "browse datasets or preview dataset records",
  },
  list_datasets: {
    kind: "read",
    module: "ipfs_datasets_py.mcp_server.tools.dataset_tools.browse_datasets",
    func: "list_datasets",
    argMap: {},
    note: "list available datasets from DatasetManager",
  },
  sync_status: {
    kind: "read",
    module: "ipfs_datasets_py.mcp_server.tools.dataset_tools.browse_datasets",
    func: "sync_status",
    argMap: {},
    note: "check IPFS backend connectivity and sync status",
  },
  // Operations whose pinned backend implementation was a mock, stub, or broken:
  // these have been fixed in the pinned source to execute genuine code.
  // (Previously they were reported honestly unavailable; now they route to
  // the fixed implementations.)
  // All 8 previously-broken operations are now mapped in
  // CONTRACT_OP_IMPLEMENTATIONS above:
  // semantic_search, index, pin, publish, record_provenance, browse,
  // list_datasets, sync_status.
  load_dataset: {
    kind: "read",
    module: "ipfs_datasets_py.mcp_server.tools.dataset_tools.load_dataset",
    func: "load_dataset", argMap: { dataset_id: "source" },
    note: "Execute the real dataset loader; local JSON fixtures use source=json and options.data_files.",
  },
  get_from_ipfs: {
    kind: "read",
    module: "ipfs_datasets_py.mcp_server.tools.ipfs_tools.get_from_ipfs",
    func: "get_from_ipfs", argMap: {},
    note: "Read actual IPFS content; a requested output_path is a write and requires a validated preview under dry-run.",
  },
  save_dataset: {
    kind: "write",
    module: "ipfs_datasets_py.mcp_server.tools.dataset_tools.save_dataset",
    func: "save_dataset", argMap: {},
    note: "Use the real dataset saver or validate its callable without writes under dry-run.",
  },
  load_index: "the pinned index-management entrypoint delegates to MockIndexManager with fabricated index statistics; genuine execution is unavailable",
};

const tools = loadDatasetTools();
const profileA = buildProfileAInterface("ipfs_datasets_py", tools);
const artifactStore = createArtifactStore({ service: "ipfs_datasets_py" });
const profileCService = getProfileCService("ipfs_datasets_py");
const eventDag = getEventDagService("ipfs_datasets_py");
const profileH = createProfileHAdapter({ service: "ipfs_datasets_py" });
const profileG = createDatasetsProfileGAdapter({ datasetsRoot });
let profileAPersistence;

const CONTRACT_OP_TIMEOUT_MS = 120000;

let contractWorkerState = null;

function contractWorkerPython() {
  // The contract worker imports the real ipfs_datasets_py data stack
  // (numpy, embeddings, vector tools). Pick the first candidate interpreter
  // that can actually import it — an explicit env override wins, then we
  // probe candidates with a numpy canary so a bare venv can never silently
  // become the worker and fail every call with ModuleNotFoundError.
  const { execFileSync } = require("node:child_process");
  const workspaceRoot = path.resolve(datasetsRoot, "..", "..");
  const candidates = [
    process.env.IPFS_DATASETS_CONTRACT_PYTHON,
    process.env.PYTHON,
    path.join(workspaceRoot, ".venv", "bin", "python"),
    path.join(process.env.HOME || "/home/hatch", "workspace", "venvs", "scraping", "bin", "python"),
    "python3",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-c", "import numpy"], { timeout: 30000, stdio: "ignore" });
      return candidate;
    } catch (_error) {
      // not usable; try the next candidate
    }
  }
  return "python3";
}

const CONTRACT_WORKER_CODE = `
import asyncio
import importlib
import inspect
import json
import sys
import time
import traceback
import types
import typing

protocol_stdout = sys.stdout
# Optional backend imports and tools may print diagnostics. The worker's stdout
# remains an exact JSON-lines protocol; genuine backend diagnostics go to stderr.
sys.stdout = sys.stderr

# Compatibility shim: the pinned generation_engine imports
# ipfs_datasets_py.embeddings.core.IPFSEmbeddings, but that module does not
# exist upstream (the real class lives under ml/embeddings with an
# incompatible constructor), so HAVE_EMBEDDINGS is always False and every
# embedding call takes the self-labeled [0.1, 0.2, 0.3, 0.4] fallback.
# Provide the missing module here backed by sentence_transformers so the
# genuine backend code path executes with real model embeddings.
try:
    importlib.import_module("ipfs_datasets_py.embeddings.core")
except ImportError:
    try:
        from sentence_transformers import SentenceTransformer

        _st_models = {}

        class IPFSEmbeddings:
            def __init__(self, model="sentence-transformers/all-MiniLM-L6-v2",
                         batch_size=32, use_gpu=False, **kwargs):
                self.model_name = model
                self.batch_size = batch_size
                self.device = "cuda" if use_gpu else "cpu"

            def _model(self):
                key = (self.model_name, self.device)
                if key not in _st_models:
                    _st_models[key] = SentenceTransformer(self.model_name, device=self.device)
                return _st_models[key]

            async def generate_embeddings(self, texts):
                started = time.time()
                model = self._model()
                vectors = model.encode(
                    list(texts), batch_size=self.batch_size,
                    normalize_embeddings=True, convert_to_numpy=True,
                )
                return {
                    "embeddings": [v.tolist() for v in vectors],
                    "processing_time": time.time() - started,
                    "memory_usage": 0,
                }

        _core_mod = types.ModuleType("ipfs_datasets_py.embeddings.core")
        _core_mod.IPFSEmbeddings = IPFSEmbeddings
        sys.modules["ipfs_datasets_py.embeddings.core"] = _core_mod
        # Ensure the parent package attribute resolves as well.
        # NOTE: do NOT do a trial from-import here -- empirically, performing
        # the from-import before generation_engine is imported breaks its own
        # identical from-import (HAVE_EMBEDDINGS stays False). Just set sys.modules
        # and the parent attribute, then force the flag on the already-imported
        # generation_engine module (import-system caching can otherwise leave the
        # flag False even though the class is genuinely present).
        try:
            _parent = importlib.import_module("ipfs_datasets_py.embeddings")
            setattr(_parent, "core", _core_mod)
            _ge = importlib.import_module("ipfs_datasets_py.embeddings.generation_engine")
            if not _ge.HAVE_EMBEDDINGS:
                _ge.IPFSEmbeddings = _core_mod.IPFSEmbeddings
                _ge.HAVE_EMBEDDINGS = True
        except ImportError:
            pass
    except ImportError:
        pass

# Compatibility shim: faiss>=1.15 SWIG bindings require float32 contiguous
# arrays, but the backend's embedding engine returns float64. Older faiss
# coerced implicitly; restore that behavior so the genuine backend index
# creation works. (faiss operates in float32 internally regardless.)
try:
    import faiss
    import numpy as _np

    _orig_normalize_L2 = faiss.normalize_L2

    def _normalize_L2_compat(x):
        x = _np.ascontiguousarray(x, dtype=_np.float32)
        return _orig_normalize_L2(x)

    faiss.normalize_L2 = _normalize_L2_compat

    for _cls_name in ("IndexFlatIP", "IndexFlatL2"):
        _cls = getattr(faiss, _cls_name, None)
        if _cls is not None and not getattr(_cls.add, "_faiss_compat_patched", False):
            _orig_add = _cls.add

            def _add_compat(self, x, _orig_add=_orig_add):
                return _orig_add(self, _np.ascontiguousarray(x, dtype=_np.float32))

            _add_compat._faiss_compat_patched = True
            _cls.add = _add_compat
except ImportError:
    pass

def matches_annotation(value, annotation):
    if annotation in (None, typing.Any, inspect.Parameter.empty):
        return True
    origin = typing.get_origin(annotation)
    if origin in (typing.Union, types.UnionType):
        return any(matches_annotation(value, member) for member in typing.get_args(annotation))
    expected = origin or annotation
    if expected is type(None):
        return value is None
    if expected in (str, int, float, bool, dict, list):
        return isinstance(value, expected)
    return True

def execute(module_path, func_name, args, preview=False):
    module = importlib.import_module(module_path)
    func = getattr(module, func_name)
    if not callable(func):
        raise TypeError("The reviewed entry point is not callable")
    params = dict(args or {})
    params.pop("dry_run", None)
    sig = inspect.signature(func)
    accepted = sig.parameters
    has_var_kw = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in accepted.values())
    if not has_var_kw:
        params = {k: v for k, v in params.items() if k in accepted}
    sig.bind(**params)
    if preview:
        try:
            hints = typing.get_type_hints(func)
        except Exception:
            hints = {}
        for key, value in params.items():
            if not matches_annotation(value, hints.get(key)):
                raise TypeError(key + " must match the real callable annotation " + str(hints[key]))
        return {"ok": True, "dry_run": True, "validation": "real-callable-signature",
                "entrypoint": module_path + "." + func_name, "validated_parameters": sorted(params),
                "body_executed": False, "mutation_performed": False}
    result = func(**params)
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
        protocol_stdout.write(json.dumps({"id": None, "ok": False, "error": "bad request: " + str(exc)}) + "\\n")
        protocol_stdout.flush()
        continue
    try:
        result = execute(request["module"], request["func"], request.get("args") or {}, request.get("preview") is True)
        protocol_stdout.write(json.dumps({"id": request.get("id"), "ok": True, "result": result}, default=str) + "\\n")
    except Exception as exc:
        protocol_stdout.write(json.dumps({
            "id": request.get("id"),
            "ok": False,
            "error": type(exc).__name__ + ": " + str(exc),
            "traceback": traceback.format_exc(limit=8),
        }, default=str) + "\\n")
    protocol_stdout.flush()
`;

function ensureContractWorker() {
  if (contractWorkerState?.child && !contractWorkerState.child.killed) {
    return contractWorkerState;
  }
  const { spawn } = require("node:child_process");
  const workspaceRoot = path.resolve(datasetsRoot, "..", "..");
  const child = spawn(contractWorkerPython(), ["-u", "-c", CONTRACT_WORKER_CODE], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      // httpx (used by huggingface_hub/sentence_transformers) chokes on the
      // bracketed IPv6 entries in the ambient no_proxy; override for the worker
      // so model downloads work through the egress proxy.
      no_proxy: "localhost,127.0.0.1",
      NO_PROXY: "localhost,127.0.0.1",
      PYTHONPATH: [datasetsRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
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
    console.error(`[datasets-contract-worker] ${chunk.toString("utf8").trim()}`);
  });
  child.on("exit", (code) => {
    for (const waiter of state.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({ id: waiter.id, ok: false, error: `contract worker exited (code ${code})` });
    }
    state.pending.clear();
    if (contractWorkerState === state) contractWorkerState = null;
  });
  child.on("error", (error) => {
    for (const waiter of state.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({ id: waiter.id, ok: false, error: `contract worker could not start: ${error.message}` });
    }
    state.pending.clear();
    if (contractWorkerState === state) contractWorkerState = null;
  });
  contractWorkerState = state;
  return state;
}

function callContractPython(impl, args) {
  const state = ensureContractWorker();
  const id = state.nextId++;
  // Apply explicit argument renames (first present source wins).
  const renamed = { ...(args || {}) };
  for (const [from, to] of Object.entries(impl.argMap || {})) {
    if (renamed[from] !== undefined && renamed[to] === undefined) {
      renamed[to] = renamed[from];
    }
    if (from !== to) delete renamed[from];
  }
  // Combine listed source keys into a single object target (e.g. publish's
  // dataset_id+metadata -> dataset_data). Sources are consumed.
  for (const [target, sources] of Object.entries(impl.combineInto || {})) {
    if (renamed[target] === undefined) {
      const combined = {};
      let found = false;
      for (const src of sources || []) {
        if (renamed[src] !== undefined) {
          combined[src] = renamed[src];
          delete renamed[src];
          found = true;
        }
      }
      if (found) renamed[target] = combined;
    }
  }
  // Wrap listed keys in an array when they are not already (e.g. a single
  // artifact_cid string becomes the inputs list for record_provenance).
  for (const key of impl.listify || []) {
    if (renamed[key] !== undefined && !Array.isArray(renamed[key])) {
      renamed[key] = [renamed[key]];
    }
  }
  // Build a documents list for vector-index creation from GUI content+metadata
  // (the vector-store manager takes documents:[{text, metadata}]).
  if (impl.documentsFrom && renamed.documents === undefined) {
    const doc = {};
    if (renamed.content !== undefined) {
      doc.text = renamed.content;
      delete renamed.content;
    }
    if (renamed.metadata !== undefined) {
      doc.metadata = renamed.metadata;
      delete renamed.metadata;
    }
    if (doc.text !== undefined) renamed.documents = [doc];
  }
  // Fill defaults for parameters the GUI contract does not supply (e.g. the
  // required operation name for record_provenance). A destinationTemplate may
  // interpolate {arg} placeholders from the (renamed) arguments.
  for (const [key, value] of Object.entries(impl.defaults || {})) {
    if (renamed[key] === undefined) renamed[key] = value;
  }
  if (impl.destinationTemplate && renamed.destination === undefined) {
    renamed.destination = String(impl.destinationTemplate).replace(/\{(\w+)\}/g, (_, k) => {
      // Check direct args first, then inside combined objects (e.g. dataset_id
      // inside dataset_data after combineInto consumed it).
      let val = renamed[k];
      if (val === undefined && renamed.dataset_data && typeof renamed.dataset_data === 'object') {
        val = renamed.dataset_data[k];
      }
      return val !== undefined ? String(val).replace(/[^a-zA-Z0-9._-]/g, "_") : "unknown";
    });
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      resolve({ id, ok: false, error: `contract worker timed out after ${CONTRACT_OP_TIMEOUT_MS}ms` });
    }, CONTRACT_OP_TIMEOUT_MS);
    state.pending.set(id, { id, resolve, timer });
    try {
      state.child.stdin.write(JSON.stringify({ id, module: impl.module, func: impl.func, args: renamed,
        preview: args?.dry_run === true && (impl.kind === "write" || (impl.func === "get_from_ipfs" && Boolean(args.output_path))) }) + "\n");
    } catch (error) {
      clearTimeout(timer);
      state.pending.delete(id);
      resolve({ id, ok: false, error: `contract worker write failed: ${error.message}` });
    }
  });
}

async function callContractOperation(name, args, invokePython = callContractPython) {
  const impl = CONTRACT_OP_IMPLEMENTATIONS[name];
  if (impl === undefined) return null; // not a contract operation; use normal dispatch
  // A string value means "honestly unavailable": either no implementation exists
  // or the pinned implementation is a mock/stub/broken. Report the reason
  // instead of routing to fabricated results.
  if (typeof impl === "string") {
    const unavailable = {
      isError: true,
      content: [
        {
          type: "text",
          text: `Operation '${name}' is unavailable: ${impl}.`,
        },
      ],
      receipt: receipt(name, { status: "not_implemented", backend: "ipfs_datasets_py" }),
    };
    if (args?.dry_run === true) {
      unavailable.receipt = receipt(name, {
        status: "not_implemented",
        backend: "ipfs_datasets_py",
        dry_run: true,
      });
    }
    return unavailable;
  }
  const effectiveArgs = { ...(args || {}) };
  const outcome = await invokePython(impl, effectiveArgs);
  if (!outcome.ok || datasetResultFailed(outcome.result)) {
    return {
      isError: true,
      content: [{ type: "json", json: outcome.ok ? outcome.result : { error: outcome.error } }],
      receipt: receipt(name, {
        status: "backend_error",
        backend: "ipfs_datasets_py",
        module: impl.module,
        func: impl.func,
        ...(outcome.traceback ? { traceback: outcome.traceback } : {}),
      }),
    };
  }
  return {
    content: [{ type: "json", json: outcome.result }],
    receipt: receipt(name, {
      status: "ok",
      backend: "ipfs_datasets_py",
      module: impl.module,
      func: impl.func,
      note: impl.note,
      dry_run: args?.dry_run === true,
      execution_mode: args?.dry_run === true && (impl.kind === "write" || (impl.func === "get_from_ipfs" && Boolean(args.output_path))) ? "validated_preview" : "backend_execution",
    }),
  };
}

function datasetResultFailed(value) {
  if (!value || typeof value !== "object") return false;
  if (value.isError === true || value.ok === false || value.success === false || value.error || ["error", "failed", "failure", "unavailable", "not_implemented"].includes(value.status)) return true;
  if (value.result && datasetResultFailed(value.result)) return true;
  return Array.isArray(value.content) && value.content.some(item => {
    if (item?.type === "json") return datasetResultFailed(item.json);
    if (item?.type === "text") {
      const parsed = parseJson(item.text);
      return parsed ? datasetResultFailed(parsed) : false;
    }
    return false;
  });
}

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

if (require.main === module) server.listen(port, host, () => {
  console.log(
    `ipfs_datasets_py compatibility MCP adapter listening on http://${host}:${port}`,
  );
  console.log(`registered tool descriptors: ${tools.length}`);
  // Warm the Profile G backend dispatch in the background so the first
  // desktop inspection does not pay the cold Python import inline.
  profileG.profile().catch(() => {});
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
  const contracts = Object.entries(CONTRACT_OP_IMPLEMENTATIONS).map(([name, impl]) => ({
    name, category: "contract_operations", description: typeof impl === "string" ? impl : impl.note,
    inputSchema: { type: "object", additionalProperties: true },
    execution_mode: typeof impl === "string" ? "unavailable" : impl.kind === "read" ? "backend-read" : "backend-or-validated-preview",
  }));
  return dedupeTools([...metaTools(), ...contracts, ...discovered]);
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
  // Contract operations (GUI descriptor contract) resolve before the
  // module-basename tool registry so function-level tools are addressable.
  const contractResult = await callContractOperation(name, args);
  if (contractResult !== null) return contractResult;
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
    if (args?.dry_run === true) {
      const nestedName = args.tool ?? args.name;
      if (!nestedName || nestedName === "tools_dispatch") return errorResult("tools_dispatch requires a non-recursive tool name", name);
      const category = args.category;
      const bareName = category && (nestedName.startsWith(`${category}.`) || nestedName.startsWith(`${category}/`)) ? nestedName.slice(category.length + 1) : nestedName;
      return callDatasetTool({ params: { name: bareName, arguments: { ...(args.params ?? args.arguments ?? {}), dry_run: true } } });
    }
    return dispatch(
      args.category,
      args.tool ?? args.name,
      args.params ?? args.arguments ?? {},
    );
  }
  if (args?.dry_run === true) return errorResult(`No reviewed dry-run entrypoint exists for ${name}`, name, { dry_run: true });
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
    isError: !execution.ok || datasetResultFailed(execution.result),
    content: [{ type: "json", json: execution }],
    receipt: receipt("tools_dispatch", {
      category: tool.category,
      target: tool.name,
      dashboard_status: execution.status ?? 0,
      status: execution.ok && !datasetResultFailed(execution.result) ? "ok" : "backend_error",
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
  return { content: [{ type: "json", json }], receipt: receipt(tool, { status: "ok", ...extra }) };
}

function errorResult(message, tool, extra = {}) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    receipt: receipt(tool, { status: "error", ...extra }),
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

module.exports = { callDatasetTool, callContractOperation, CONTRACT_OP_IMPLEMENTATIONS, CONTRACT_WORKER_CODE, datasetResultFailed, tools };
