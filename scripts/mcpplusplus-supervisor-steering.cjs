"use strict";

// MCP++ prompt-steering bridge for the ipfs_accelerate_py compat adapter.
//
// The Agent Supervisor console's confirmed prompt-steering capability
// (`agent_supervisor.prompt_steering.request`) is owned by
// ipfs_accelerate_py: the backend feature is the production Supervisor
// facade (`agent_supervisor/entrypoints/facade.py::Supervisor.steer`),
// published as the prompt-lifecycle MCP tool `agent_supervisor_steer`
// (ASE3-011, `mcp_server/tools/agent_supervisor_tools/prompt_entrypoints.py`).
//
// Those tools resolve their Supervisor through an embedder hook:
// `configure_prompt_lifecycle_supervisor(...)` installs ONE long-lived
// session; without it every call opens a fresh `Supervisor.open()` whose
// run registry is empty, so no run can ever be steered across calls.
// This bridge is that embedder for the compat adapter: a persistent
// Python worker process (JSON-lines over stdio, the same pattern as the
// Profile G worker bridges in mcpplusplus-profile-g-adapter.cjs) that
//
//   1. opens ONE production Supervisor session for a server-configured
//      repository (env IPFS_ACCELERATE_AGENT_REPOSITORY, defaulting to
//      the sibling external/ipfs_accelerate checkout — the only
//      repository in this workspace carrying an activated production
//      scheduler composition; the repository is NEVER client-supplied),
//   2. injects it via configure_prompt_lifecycle_supervisor,
//   3. seeds the session's run through the facade's own Supervisor.run()
//      (seed prompt from env IPFS_ACCELERATE_SUPERVISOR_SEED_PROMPT or a
//      built-in backlog prompt), and
//   4. dispatches steering requests to the backend's own
//      agent_supervisor_steer tool function, followed by a same-session
//      agent_supervisor_status read-back.
//
// Failure posture is fail-closed, mirroring the Profile G bridges: if the
// session cannot open or the seed run cannot be created, dispatch returns
// the backend's own typed error verbatim (the tool envelope
// {ok: false, error, error_code}) and the adapter surfaces it — no
// receipt or success is ever fabricated in the adapter or the worker.

const { spawn } = require("node:child_process");
const path = require("node:path");

const STEERING_METHOD = "agent_supervisor.prompt_steering.request";
const SERVICE = "ipfs_accelerate_py";
const REQUEST_TIMEOUT_MS = 120_000;

const SUPERVISOR_STEERING_WORKER_CODE = `
import importlib.util  # noqa: F401  (agent_supervisor lazy loader assumes it)
import asyncio
import json
import os
import sys

SESSION = {
    "repository": os.environ.get("IPFS_ACCELERATE_AGENT_REPOSITORY") or None,
    "open": False,
    "open_error": None,
    "composition_cid": None,
    "run_id": None,
    "run_state": None,
    "run_error": None,
    "seed_prompt_configured": bool(os.environ.get("IPFS_ACCELERATE_SUPERVISOR_SEED_PROMPT")),
}

DEFAULT_SEED_PROMPT = (
    "Maintain the ipfs_accelerate_py verification backlog: keep MCP++ "
    "Profile G conformance evidence current for the supervisor console."
)


def _open_session():
    from ipfs_accelerate_py.agent_supervisor.entrypoints.facade import Supervisor
    from ipfs_accelerate_py.mcp_server.tools.agent_supervisor_tools.prompt_entrypoints import (
        configure_prompt_lifecycle_supervisor,
    )

    repository = SESSION["repository"]
    try:
        supervisor = Supervisor.open(repository=repository)
    except Exception as error:  # typed configuration/activation failure
        SESSION["open_error"] = f"{type(error).__name__}: {error}"
        return
    configure_prompt_lifecycle_supervisor(supervisor)
    SESSION["open"] = True
    SESSION["composition_cid"] = supervisor.composition_cid
    seed_prompt = os.environ.get("IPFS_ACCELERATE_SUPERVISOR_SEED_PROMPT") or DEFAULT_SEED_PROMPT
    try:
        run = supervisor.run(seed_prompt)
        SESSION["run_id"] = run.run_id
        SESSION["run_state"] = run.state
    except Exception as error:  # run creation is a separate, typed boundary
        SESSION["run_error"] = f"{type(error).__name__}: {error}"


_open_session()
print(json.dumps({"id": "session", "session": SESSION}), flush=True)
print(f"supervisor steering session: {json.dumps(SESSION)}", file=sys.stderr, flush=True)


def _dispatch(params):
    from ipfs_accelerate_py.mcp_server.tools.agent_supervisor_tools.prompt_entrypoints import (
        agent_supervisor_status,
        agent_supervisor_steer,
    )

    prompt = params.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        return {"ok": False, "error": "prompt must be a non-empty string", "error_code": "SupervisorRouteBadRequest", "session": SESSION}
    if not SESSION["open"]:
        return {"ok": False, "error": SESSION["open_error"] or "supervisor session is not open", "error_code": "SupervisorSessionUnavailable", "session": SESSION}
    if not SESSION["run_id"]:
        return {"ok": False, "error": SESSION["run_error"] or "supervisor session has no run to steer", "error_code": "SupervisorRunUnavailable", "session": SESSION}
    result = asyncio.run(agent_supervisor_steer(prompt=prompt, run_id=SESSION["run_id"]))
    if result.get("ok"):
        status = asyncio.run(agent_supervisor_status(run_id=SESSION["run_id"]))
        result["post_status"] = status
    result["session"] = SESSION
    return result


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    request = json.loads(line)
    try:
        result = _dispatch(request.get("params") or {})
        print(json.dumps({"id": request["id"], "result": result}), flush=True)
    except Exception as error:
        wire = {"code": -32603, "message": str(error), "data": {"session": SESSION}}
        print(json.dumps({"id": request["id"], "error": wire}), flush=True)
`;

class SupervisorSteeringError extends Error {
  constructor(code, message, data = {}) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

function createSupervisorSteeringBridge({ workspaceRoot, python } = {}) {
  const accelerateRoot = path.join(workspaceRoot, "external", "ipfs_accelerate");
  const datasetsRoot = path.join(workspaceRoot, "external", "ipfs_datasets");
  const kitRoot = path.join(workspaceRoot, "external", "ipfs_kit");
  const resolvedPython = python
    ?? process.env.PYTHON
    ?? path.join(workspaceRoot, ".venv", "bin", "python");
  let worker = null;
  let nextId = 1;

  function failAll(state, cause) {
    for (const entry of state.pending.values()) {
      entry.reject(new SupervisorSteeringError(-32051, `Supervisor steering provider is unavailable: ${cause}`, {
        code: "G_PROVIDER_UNAVAILABLE",
        message: "Supervisor steering provider is unavailable",
        retryable: true,
        details: { method: STEERING_METHOD, service: SERVICE, cause: String(cause).slice(0, 300) },
      }));
    }
    state.pending.clear();
  }

  function ensureWorker() {
    if (worker) return worker;
    const env = {
      ...process.env,
      PYTHONPATH: [kitRoot, datasetsRoot, accelerateRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      IPFS_ACCELERATE_AGENT_REPOSITORY: process.env.IPFS_ACCELERATE_AGENT_REPOSITORY || accelerateRoot,
    };
    const child = spawn(resolvedPython, ["-c", SUPERVISOR_STEERING_WORKER_CODE], { cwd: workspaceRoot, env });
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
          entry.reject(new SupervisorSteeringError(
            typeof wire.code === "number" ? wire.code : -32603,
            String(wire.message ?? "Supervisor steering backend error"),
            wire.data ?? {},
          ));
        } else if ("result" in payload) {
          entry.resolve(payload.result);
        } else {
          entry.reject(new SupervisorSteeringError(-32051, "Supervisor steering backend returned no result", {
            code: "G_PROVIDER_UNAVAILABLE",
            message: "Supervisor steering backend returned no result",
            retryable: true,
            details: { method: STEERING_METHOD, service: SERVICE },
          }));
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

  async function call(params) {
    const state = ensureWorker();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        try { state.child.kill("SIGKILL"); } catch { /* already gone */ }
        if (worker === state) worker = null;
        failAll(state, `python dispatch timed out after ${REQUEST_TIMEOUT_MS}ms`);
        reject(new SupervisorSteeringError(-32051, `Supervisor steering provider is unavailable: python dispatch timed out after ${REQUEST_TIMEOUT_MS}ms`, {
          code: "G_PROVIDER_UNAVAILABLE",
          message: "Supervisor steering provider is unavailable",
          retryable: true,
          details: { method: STEERING_METHOD, service: SERVICE },
        }));
      }, REQUEST_TIMEOUT_MS);
      state.pending.set(id, { resolve, reject, timer });
      state.child.stdin.write(`${JSON.stringify({ id, method: STEERING_METHOD, params: params ?? {} })}\n`);
    });
  }

  return {
    call,
    warm() {
      try { ensureWorker(); } catch { /* dispatch surfaces the failure */ }
    },
  };
}

module.exports = {
  STEERING_METHOD,
  SupervisorSteeringError,
  createSupervisorSteeringBridge,
};
