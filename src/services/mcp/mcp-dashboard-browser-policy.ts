/**
 * MCP Dashboard Browser Truth Policy (SWR-027)
 *
 * Canonical classification rules for anything the MCP Control dashboard
 * (`web/js/apps/mcp-control.js`) surfaces as a "server". Every entry the
 * dashboard renders must be classified into exactly one of two kinds:
 *
 *  - `browser-remote`      — an HTTP(S), WebSocket, or libp2p endpoint that
 *                             the SwissKnife browser build connects to
 *                             directly (`fetch`/`WebSocket`/browser libp2p).
 *  - `host-daemon-command` — a shell command (e.g. `npx ...`, `uvicorn
 *                             main:app`, `python server.py`) that only a
 *                             host process (Electron main process, desktop
 *                             app, CLI, or an externally supervised MCP
 *                             daemon) can execute. The command text is a
 *                             *record*, never something the browser runs.
 *
 * This module is the single source of truth for that split. It exists so
 * the dashboard can never present a host-managed launch command in a way
 * that looks like the browser executes it — in particular, so example
 * command text that references a Python interpreter (`python`, `python3`,
 * `uvicorn`, `gunicorn`, ...) can never be mistaken for an in-browser Python
 * runtime invocation (see `docs/browser-python-policy.md` for the separate,
 * stricter policy governing actual in-browser Python/Pyodide execution).
 *
 * `web/js/apps/mcp-control.js` is hand-authored browser JavaScript (it is
 * not compiled from TypeScript), so it embeds a literal mirror of the
 * constants and functions declared here rather than importing this module
 * at runtime. `scripts/test-mcp-dashboard-consumer.cjs` cross-checks the two
 * sources so they cannot silently drift; see
 * `docs/mcp-dashboard-browser-policy.md` for the full policy writeup.
 */

/** Transport protocols the SwissKnife browser build can connect to directly. */
export type McpDashboardBrowserTransport = 'http' | 'https' | 'websocket' | 'libp2p';

/** Ordered, canonical list of browser-connectable MCP dashboard transports. */
export const MCP_DASHBOARD_BROWSER_CONNECTABLE_TRANSPORTS: readonly McpDashboardBrowserTransport[] = Object.freeze([
  'http',
  'https',
  'websocket',
  'libp2p',
]);

/** The two dashboard entry kinds a rendered "server" card must resolve to. */
export type McpDashboardEntryKind = 'browser-remote' | 'host-daemon-command';

/** A remote MCP endpoint the browser build connects to directly. */
export interface McpDashboardRemoteEntry {
  readonly kind: 'browser-remote';
  readonly transport: McpDashboardBrowserTransport;
  readonly url: string;
  /** Always `true` — remote entries are, by construction, browser-connectable. */
  readonly browserExecutable: true;
  readonly badgeLabel: 'BROWSER REMOTE';
}

/** A host-managed daemon launch command, recorded (not executed) by the browser. */
export interface McpDashboardHostDaemonEntry {
  readonly kind: 'host-daemon-command';
  readonly command: string;
  readonly args: readonly string[];
  /** First path segment of the command, e.g. `python`, `npx`, `uvicorn`. */
  readonly interpreter: string | null;
  /** True when the command text references a Python-family interpreter/server. */
  readonly isPythonCommand: boolean;
  /** Always `false` — the browser build never executes host daemon commands. */
  readonly browserExecutable: false;
  readonly badgeLabel: 'HOST DAEMON COMMAND';
  readonly disclaimer: string;
}

export type McpDashboardEntry = McpDashboardRemoteEntry | McpDashboardHostDaemonEntry;

/**
 * Interpreters/launchers commonly seen in MCP server templates and daemon
 * catalogs. Used only to label command text for the user; the dashboard
 * never parses or executes any of these.
 */
export const MCP_DASHBOARD_HOST_COMMAND_INTERPRETERS: readonly string[] = Object.freeze([
  'python3',
  'python',
  'uvicorn',
  'gunicorn',
  'pip3',
  'pip',
  'node',
  'npx',
  'npm',
  'deno',
  'bun',
  'java',
  'dotnet',
  'ruby',
  'php',
  'go',
  'cargo',
]);

/** Interpreters/launchers that indicate a Python-family host process. */
const PYTHON_HOST_INTERPRETERS = new Set(['python', 'python3', 'uvicorn', 'gunicorn', 'pip', 'pip3']);

/** Fallback regex for Python references embedded anywhere in a command string. */
const PYTHON_TEXT_PATTERN = /\bpython[0-9.]*\b/i;

export const MCP_DASHBOARD_HOST_DAEMON_DISCLAIMER =
  'Host-managed daemon command \u2014 record only. SwissKnife web builds never execute this command in the browser; a host process (desktop app, CLI, or configured MCP daemon) must run it.';

export const MCP_DASHBOARD_PYTHON_HOST_DAEMON_DISCLAIMER =
  `${MCP_DASHBOARD_HOST_DAEMON_DISCLAIMER} This example text references a Python interpreter/server; it documents the host command only and is never parsed or executed by any in-browser Python runtime.`;

/** Type guard: is `value` one of the browser-connectable MCP transports? */
export function isMcpDashboardBrowserConnectableTransport(
  value: string,
): value is McpDashboardBrowserTransport {
  return (MCP_DASHBOARD_BROWSER_CONNECTABLE_TRANSPORTS as readonly string[]).includes(value);
}

/** Extracts the leading interpreter/launcher token from a host command string. */
export function detectMcpDashboardHostCommandInterpreter(command: string): string | null {
  const first = String(command ?? '').trim().split(/\s+/)[0] ?? '';
  if (!first) return null;
  const base = first.split('/').pop() ?? first;
  return base || null;
}

/** True when a host daemon command string references a Python-family interpreter/server. */
export function isPythonHostDaemonCommand(command: string): boolean {
  const interpreter = detectMcpDashboardHostCommandInterpreter(command);
  if (interpreter && PYTHON_HOST_INTERPRETERS.has(interpreter)) return true;
  return PYTHON_TEXT_PATTERN.test(String(command ?? ''));
}

/**
 * Classifies a host-managed daemon launch command (`npx ...`, `uvicorn
 * main:app`, `python server.py`, ...) for dashboard rendering. Never
 * executes the command; it only labels the text so it cannot be mistaken
 * for something the browser runs.
 */
export function classifyMcpDashboardHostDaemonCommand(
  command: string,
  args: readonly string[] = [],
): McpDashboardHostDaemonEntry {
  const interpreter = detectMcpDashboardHostCommandInterpreter(command);
  const isPython = isPythonHostDaemonCommand(command);
  return {
    kind: 'host-daemon-command',
    command,
    args,
    interpreter,
    isPythonCommand: isPython,
    browserExecutable: false,
    badgeLabel: 'HOST DAEMON COMMAND',
    disclaimer: isPython ? MCP_DASHBOARD_PYTHON_HOST_DAEMON_DISCLAIMER : MCP_DASHBOARD_HOST_DAEMON_DISCLAIMER,
  };
}

/** Normalizes a user-supplied protocol/URL pair to a canonical transport name. */
export function normalizeMcpDashboardTransport(transport: string | undefined | null, url: string): string {
  const normalized = String(transport ?? '').toLowerCase().trim();
  if (normalized === 'ws' || normalized === 'wss') return 'websocket';
  if (normalized) return normalized;
  if (/^wss?:\/\//i.test(url ?? '')) return 'websocket';
  if (/^https:\/\//i.test(url ?? '')) return 'https';
  if (/^http:\/\//i.test(url ?? '')) return 'http';
  if (/^\/(?:dnsaddr|ip4|ip6|dns4|dns6)\//i.test(url ?? '') || /^libp2p:/i.test(url ?? '')) return 'libp2p';
  return normalized || 'http';
}

/**
 * Classifies a remote MCP endpoint URL/protocol pair. Throws if the
 * resolved transport is not one of the browser-connectable transports —
 * the dashboard must never present a non-browser-connectable transport as
 * a "remote" entry.
 */
export function classifyMcpDashboardRemoteEntry(url: string, transport: string): McpDashboardRemoteEntry {
  const resolved = normalizeMcpDashboardTransport(transport, url);
  if (!isMcpDashboardBrowserConnectableTransport(resolved)) {
    throw new Error(`Unsupported MCP dashboard browser-connectable transport: ${transport}`);
  }
  return {
    kind: 'browser-remote',
    transport: resolved,
    url,
    browserExecutable: true,
    badgeLabel: 'BROWSER REMOTE',
  };
}

/** Machine-readable snapshot of this policy, used for cross-checks in tests/docs. */
export const MCP_DASHBOARD_BROWSER_POLICY = Object.freeze({
  schema: 'swissknife.mcp_dashboard_browser_policy.v1',
  browserConnectableTransports: MCP_DASHBOARD_BROWSER_CONNECTABLE_TRANSPORTS,
  hostDaemonCommandDisclaimer: MCP_DASHBOARD_HOST_DAEMON_DISCLAIMER,
  pythonHostDaemonCommandDisclaimer: MCP_DASHBOARD_PYTHON_HOST_DAEMON_DISCLAIMER,
  hostCommandInterpreters: MCP_DASHBOARD_HOST_COMMAND_INTERPRETERS,
});

export type McpDashboardBrowserPolicy = typeof MCP_DASHBOARD_BROWSER_POLICY;
