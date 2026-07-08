# MCP Dashboard Browser Truth Policy

The MCP Control dashboard (`web/js/apps/mcp-control.js`) lets a user manage
two fundamentally different kinds of Model Context Protocol "server"
entries. This policy makes the distinction explicit everywhere the dashboard
renders a server, so the browser build can never be mistaken for something
it is not — in particular, so example command text that references a Python
interpreter can never be mistaken for an in-browser Python execution
capability.

## The Two Entry Kinds

| Kind | What it is | Who executes it | Dashboard label |
|---|---|---|---|
| **Browser remote** | An HTTP(S), WebSocket, or libp2p endpoint. | The SwissKnife **browser build**, via `fetch`/`WebSocket`/browser libp2p, directly. | `BROWSER REMOTE · <TRANSPORT>` |
| **Host daemon command** | A shell command such as `npx @modelcontextprotocol/server-filesystem`, `uvicorn main:app`, or `python server.py`. | A **host process** only — the Electron main process, a desktop app, a CLI, or an externally supervised MCP daemon. | `HOST DAEMON COMMAND` |

A dashboard entry is always exactly one of these two kinds. There is no
third "ambiguous" state: every "Add Server" flow, every server template,
every auto-discovery suggestion, and every entry synced from the Hallucinate
Electron daemon bridge (`web/js/hallucinate-backend-bridge.js`) resolves to
one of the two kinds before it is rendered.

## Browser-Connectable Transports

Only these transports are ever presented as a browser-connectable remote:

- `http`
- `https`
- `websocket` (including `ws://`/`wss://` URLs)
- `libp2p` (multiaddr endpoints, e.g. `/dns4/host/tcp/4001/p2p/<peerId>`)

Any other protocol/command is, by definition, a host-managed daemon command
— the dashboard never invents a fifth "browser-connectable" category, and
`connectRemote()`/`testRemoteConnection()` reject unrecognized transport
values instead of silently falling back to HTTP.

The libp2p transport is a **real** connection attempt: `mcp-control.js`
looks for a browser libp2p bridge (`desktop.swissknife.mcp.libp2p` or the
existing `desktop.swissknife.p2p` bridge used by the P2P chat apps) and
dials through it. If no such bridge/runtime is wired into the current
build, the connection attempt fails with an explicit error pointing at
`docs/browser-libp2p-evidence.md` — it never fakes a successful connection.

## Host Daemon Commands Are Never Executed By The Browser

Every place the dashboard displays a host daemon command — the server list,
templates modal, discovery modal, and the "Add Host Daemon Command" /
"Edit" forms — shows:

1. An explicit `HOST DAEMON COMMAND` badge (as opposed to `BROWSER REMOTE`).
2. A disclaimer sentence: _"Host-managed daemon command — record only.
   SwissKnife web builds never execute this command in the browser; a host
   process (desktop app, CLI, or configured MCP daemon) must run it."_
3. When the command text references a Python-family interpreter or server
   (`python`, `python3`, `uvicorn`, `gunicorn`, `pip`, ...), the disclaimer
   gains an additional sentence: _"This example text references a Python
   interpreter/server; it documents the host command only and is never
   parsed or executed by any in-browser Python runtime."_ The command is
   also prefixed with a 🐍 icon instead of the default 🖥️ icon so it is
   visually distinct at a glance.

This directly satisfies the acceptance requirement that example Python
command text (e.g. the built-in `python server.py` / `uvicorn main:app`
fallback examples in `checkServerStatuses()`) cannot be mistaken for
browser runtime Python execution. It is a UI/labeling policy layered on top
of, and independent from, `docs/browser-python-policy.md`, which governs
whether an actual in-browser Python runtime (Pyodide) may ship in a default
web bundle at all. Even when Pyodide is completely absent from a build (the
default), the dashboard's host-daemon-command disclaimers still apply,
because the risk they address is a *user misreading command text*, not a
*bundle accidentally shipping a Python runtime*.

`scripts/audit-web-bundle.mjs`'s `python-command-or-text` rule independently
records (but does not fail on) any `python`/`` ```python `` text reachable
from the built bundle; the dashboard's host-daemon-command examples are
expected, non-failing findings under that rule. The rules that *do* fail
the bundle audit (`pyodide-runtime`, `host-python-bridge`, and the
`--fail-on-host-leakage` rule set) must remain clear — the dashboard must
never call a host Python bridge or statically pull in Pyodide just to
render command text.

## Canonical Policy Module

`src/services/mcp/mcp-dashboard-browser-policy.ts` is the canonical,
type-checked (`npm run typecheck:browser`) source of truth for this policy:

```ts
import {
  MCP_DASHBOARD_BROWSER_CONNECTABLE_TRANSPORTS, // ['http', 'https', 'websocket', 'libp2p']
  classifyMcpDashboardHostDaemonCommand,
  classifyMcpDashboardRemoteEntry,
  isPythonHostDaemonCommand,
  MCP_DASHBOARD_HOST_DAEMON_DISCLAIMER,
  MCP_DASHBOARD_PYTHON_HOST_DAEMON_DISCLAIMER,
  MCP_DASHBOARD_BROWSER_POLICY,
} from './src/services/mcp/mcp-dashboard-browser-policy';
```

`web/js/apps/mcp-control.js` is hand-authored browser JavaScript — it is not
compiled from TypeScript — so it cannot `import` this module at runtime.
Instead it embeds a literal mirror of the same constants and functions
(`MCP_DASHBOARD_BROWSER_POLICY`, `describeMcpDashboardHostDaemonCommand()`,
`describeMcpDashboardRemoteEntry()`, `normalizeMcpDashboardTransport()`,
`isPythonHostDaemonCommand()`) directly in the file. Both copies must stay
identical; `scripts/test-mcp-dashboard-consumer.cjs` cross-checks:

- the transport list embedded in `mcp-control.js` against
  `MCP_DASHBOARD_BROWSER_CONNECTABLE_TRANSPORTS`,
- the disclaimer strings embedded in `mcp-control.js` against
  `MCP_DASHBOARD_HOST_DAEMON_DISCLAIMER` /
  `MCP_DASHBOARD_PYTHON_HOST_DAEMON_DISCLAIMER`,
- that `mcp-control.js` labels the `HOST DAEMON COMMAND` badge on local /
  Hallucinate-daemon-managed entries and `BROWSER REMOTE` on remote
  entries, and that the libp2p protocol option exists in the "Add Browser
  Remote" form.

## Validation

```sh
cd swissknife
node scripts/test-mcp-dashboard-consumer.cjs
npm run build:web
node scripts/audit-web-bundle.mjs --fail-on-host-leakage
```

`npm run typecheck:browser` also type-checks
`src/services/mcp/mcp-dashboard-browser-policy.ts` (it is listed in
`tsconfig.browser.json`).
