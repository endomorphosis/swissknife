/**
 * SWR-027 — MCP dashboard browser-truth policy tests.
 */
import {
  MCP_DASHBOARD_BROWSER_CONNECTABLE_TRANSPORTS,
  MCP_DASHBOARD_BROWSER_POLICY,
  MCP_DASHBOARD_HOST_DAEMON_DISCLAIMER,
  MCP_DASHBOARD_PYTHON_HOST_DAEMON_DISCLAIMER,
  classifyMcpDashboardHostDaemonCommand,
  classifyMcpDashboardRemoteEntry,
  detectMcpDashboardHostCommandInterpreter,
  isMcpDashboardBrowserConnectableTransport,
  isPythonHostDaemonCommand,
  normalizeMcpDashboardTransport,
} from '../../src/services/mcp/mcp-dashboard-browser-policy';

describe('MCP_DASHBOARD_BROWSER_CONNECTABLE_TRANSPORTS', () => {
  it('lists exactly http, https, websocket, and libp2p', () => {
    expect([...MCP_DASHBOARD_BROWSER_CONNECTABLE_TRANSPORTS]).toEqual(['http', 'https', 'websocket', 'libp2p']);
  });

  it('is used as the source of truth for the transport type guard', () => {
    for (const transport of MCP_DASHBOARD_BROWSER_CONNECTABLE_TRANSPORTS) {
      expect(isMcpDashboardBrowserConnectableTransport(transport)).toBe(true);
    }
    expect(isMcpDashboardBrowserConnectableTransport('stdio')).toBe(false);
    expect(isMcpDashboardBrowserConnectableTransport('child_process')).toBe(false);
  });
});

describe('detectMcpDashboardHostCommandInterpreter', () => {
  it('extracts the leading interpreter token', () => {
    expect(detectMcpDashboardHostCommandInterpreter('python server.py')).toBe('python');
    expect(detectMcpDashboardHostCommandInterpreter('uvicorn main:app')).toBe('uvicorn');
    expect(detectMcpDashboardHostCommandInterpreter('npx @modelcontextprotocol/server-filesystem')).toBe('npx');
    expect(detectMcpDashboardHostCommandInterpreter('/usr/bin/python3 server.py')).toBe('python3');
  });

  it('returns null for empty commands', () => {
    expect(detectMcpDashboardHostCommandInterpreter('')).toBeNull();
    expect(detectMcpDashboardHostCommandInterpreter('   ')).toBeNull();
  });
});

describe('isPythonHostDaemonCommand', () => {
  it('flags Python-family interpreters and servers', () => {
    expect(isPythonHostDaemonCommand('python server.py')).toBe(true);
    expect(isPythonHostDaemonCommand('python3 -m http.server')).toBe(true);
    expect(isPythonHostDaemonCommand('uvicorn main:app --reload')).toBe(true);
    expect(isPythonHostDaemonCommand('gunicorn app:app')).toBe(true);
  });

  it('does not flag non-Python host commands', () => {
    expect(isPythonHostDaemonCommand('npx @modelcontextprotocol/server-filesystem')).toBe(false);
    expect(isPythonHostDaemonCommand('node server.js')).toBe(false);
    expect(isPythonHostDaemonCommand('npm run start')).toBe(false);
  });
});

describe('classifyMcpDashboardHostDaemonCommand', () => {
  it('classifies a Python example command as a non-browser-executable host daemon command', () => {
    const entry = classifyMcpDashboardHostDaemonCommand('python server.py', []);
    expect(entry.kind).toBe('host-daemon-command');
    expect(entry.browserExecutable).toBe(false);
    expect(entry.isPythonCommand).toBe(true);
    expect(entry.badgeLabel).toBe('HOST DAEMON COMMAND');
    expect(entry.disclaimer).toBe(MCP_DASHBOARD_PYTHON_HOST_DAEMON_DISCLAIMER);
    expect(entry.disclaimer).toContain('never parsed or executed by any in-browser Python runtime');
  });

  it('classifies a non-Python example command with the base disclaimer', () => {
    const entry = classifyMcpDashboardHostDaemonCommand('npx @modelcontextprotocol/server-filesystem', ['--root', '/tmp']);
    expect(entry.isPythonCommand).toBe(false);
    expect(entry.disclaimer).toBe(MCP_DASHBOARD_HOST_DAEMON_DISCLAIMER);
    expect(entry.disclaimer).not.toContain('Python');
  });
});

describe('normalizeMcpDashboardTransport / classifyMcpDashboardRemoteEntry', () => {
  it('normalizes ws/wss to websocket', () => {
    expect(normalizeMcpDashboardTransport('ws', 'ws://localhost:8765')).toBe('websocket');
    expect(normalizeMcpDashboardTransport('wss', 'wss://localhost:8765')).toBe('websocket');
  });

  it('infers transport from the URL when protocol is omitted', () => {
    expect(normalizeMcpDashboardTransport(undefined, 'ws://localhost:8765')).toBe('websocket');
    expect(normalizeMcpDashboardTransport(undefined, 'https://api.example.com/mcp')).toBe('https');
    expect(normalizeMcpDashboardTransport(undefined, 'http://localhost:8765')).toBe('http');
    expect(normalizeMcpDashboardTransport(undefined, '/dns4/host/tcp/4001/p2p/peerid')).toBe('libp2p');
  });

  it('classifies a browser-connectable remote entry', () => {
    const entry = classifyMcpDashboardRemoteEntry('ws://localhost:8765', 'websocket');
    expect(entry.kind).toBe('browser-remote');
    expect(entry.browserExecutable).toBe(true);
    expect(entry.badgeLabel).toBe('BROWSER REMOTE');
    expect(entry.transport).toBe('websocket');
  });

  it('classifies a libp2p remote entry as browser-connectable', () => {
    const entry = classifyMcpDashboardRemoteEntry('/dns4/host/tcp/4001/p2p/peerid', 'libp2p');
    expect(entry.transport).toBe('libp2p');
    expect(entry.browserExecutable).toBe(true);
  });

  it('rejects non-browser-connectable transports', () => {
    expect(() => classifyMcpDashboardRemoteEntry('stdio://local', 'stdio')).toThrow(
      /Unsupported MCP dashboard browser-connectable transport/,
    );
  });
});

describe('MCP_DASHBOARD_BROWSER_POLICY', () => {
  it('exposes a stable machine-readable schema', () => {
    expect(MCP_DASHBOARD_BROWSER_POLICY.schema).toBe('swissknife.mcp_dashboard_browser_policy.v1');
    expect([...MCP_DASHBOARD_BROWSER_POLICY.browserConnectableTransports]).toEqual([
      'http',
      'https',
      'websocket',
      'libp2p',
    ]);
    expect(MCP_DASHBOARD_BROWSER_POLICY.hostDaemonCommandDisclaimer).toBe(MCP_DASHBOARD_HOST_DAEMON_DISCLAIMER);
    expect(MCP_DASHBOARD_BROWSER_POLICY.pythonHostDaemonCommandDisclaimer).toBe(
      MCP_DASHBOARD_PYTHON_HOST_DAEMON_DISCLAIMER,
    );
  });
});
