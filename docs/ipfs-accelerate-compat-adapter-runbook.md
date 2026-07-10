# ipfs_accelerate_py Compatibility Adapter Runbook

## Purpose

SwissKnife exposes `ipfs_accelerate_py` through a supervisor-managed local compatibility MCP adapter on `http://127.0.0.1:3003`. The adapter normalizes the required SwissKnife accelerate surfaces, keeps the hierarchical tool facade available, and proxies compatible calls to the real local upstream service on `http://127.0.0.1:9000`.

This is a host-side boundary. Browser bundles may expose browser-safe descriptors, logical `mcp://ipfs_accelerate_py` endpoint names, policies, and receipt metadata. They must not start the adapter, read its PID/log evidence, call localhost adapter/upstream URLs directly, or execute `python -m ipfs_accelerate_py`.

The supervisor evidence for SWR-087 is:

- `test-results/virtual-desktop-ipfs-mcp-orb/ipfs-accelerate-compat.pid`
- `test-results/virtual-desktop-ipfs-mcp-orb/ipfs-accelerate-adapter-coverage.json`
- `docs/ipfs-accelerate-compat-adapter-runbook.md`

## Start and Verify

Run the coverage capture from the SwissKnife repository root:

```sh
node scripts/capture-ipfs-accelerate-adapter-coverage.cjs
```

The capture command is intentionally restart-aware. It checks the configured listener on port `3003`, refuses to take over a non-SwissKnife listener, restarts an owned `scripts/start-ipfs-accelerate-mcp-compat.cjs` listener, writes the active PID to `ipfs-accelerate-compat.pid`, and then records coverage. On a clean machine it starts the adapter and performs a second controlled restart so the evidence still proves restartability.

Verify the listener evidence:

```sh
ss -ltnp | grep ':3003'
cat test-results/virtual-desktop-ipfs-mcp-orb/ipfs-accelerate-compat.pid
```

The PID in the file must match the PID shown by `ss`.

## Coverage Gates

`ipfs-accelerate-adapter-coverage.json` is green only when all of these are true:

- JSON-RPC `tools/list` on `http://127.0.0.1:3003/mcp` succeeds.
- The PID file points at the same process that owns the port `3003` listener.
- `/mcp/health` identifies `swissknife-ipfs-accelerate-compat` and the expected adapter version.
- The hierarchical facade tools are present: `tools_dispatch`, `tools_list_categories`, `tools_list_tools`, and `tools_get_schema`.
- The hierarchical facade tools execute through `tools/call` probes for category listing, schema lookup, and dispatch.
- Every required normalized alias is visible at the configured endpoint and maps to a real upstream tool on `http://127.0.0.1:9000`.
- The browser boundary section records that direct adapter execution is forbidden and points to `npm run audit:bundle-host-leakage`.

The required normalized aliases are `detect_hardware`, `get_task`, `hardware_profile`, `HardwareDetector.get_available_hardware`, `HealthChecker.check_detailed`, `job_status`, `PrometheusMetrics.generate_metrics`, `ProvenanceLogger.log_inference`, `run_inference_job`, `submit_task`, and `telemetry`.

## Manual Start

The coverage command is the preferred entry point. For direct debugging, start the adapter manually:

```sh
node scripts/start-ipfs-accelerate-mcp-compat.cjs --host 127.0.0.1 --port 3003 --upstream http://127.0.0.1:9000
```

Then inspect:

```sh
curl -s http://127.0.0.1:3003/mcp/health | jq .
curl -s http://127.0.0.1:3003/mcp/manifest | jq .
```

## Stale PID Handling

A stale PID file is not enough to pass coverage. The capture command compares the PID file to the live `ss -ltnp` listener and records both values under `process` in `ipfs-accelerate-adapter-coverage.json`.

If `process.pid_file_matches_listener` is false, rerun:

```sh
node scripts/capture-ipfs-accelerate-adapter-coverage.cjs
```

If another non-SwissKnife process owns port `3003`, stop that process first or change the configured port before rerunning. The coverage gate will remain `no_go` while the listener is not a verified SwissKnife compatibility adapter.

## Browser Boundary

The adapter evidence is host-side evidence only. Browser-safe code can import descriptor packs and render generated UI from them, but it must not contain these direct execution surfaces:

- `scripts/start-ipfs-accelerate-mcp-compat.cjs`
- `ipfs-accelerate-compat.pid` or `ipfs-accelerate-compat.log`
- `127.0.0.1:3003`, `localhost:3003`, `127.0.0.1:9000`, or `localhost:9000`
- `python -m ipfs_accelerate_py`
- Node subprocess APIs such as `child_process`, `spawn(`, or `exec(`

The release validation command is:

```sh
npm run audit:bundle-host-leakage
```

That command scans built browser output and fails when any direct host adapter surface appears. It does not fail merely because a browser descriptor names `ipfs_accelerate_py` or describes a Python-owned backend.

## Dispatch Behavior

The adapter exposes the normalized aliases expected by SwissKnife while preserving the upstream tool names. Calls through `tools/call` resolve the requested alias against the live upstream tool list and record the selected upstream name in the receipt as `mapped_tool`.

Example JSON-RPC dispatch:

```sh
curl -s http://127.0.0.1:3003/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"tools_get_schema","arguments":{"name":"run_inference_job"}}}' \
  | jq .
```

Use `tools_list_categories` and `tools_list_tools` for facade navigation, `tools_get_schema` for per-tool schema lookup, and `tools_dispatch` for category-aware delegated calls.
