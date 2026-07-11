import { describe, expect, it } from 'vitest';
import * as browserMcp from '../../src/services/mcp/mcp-browser.js';

describe('MCP browser service entrypoint', () => {
  it('exports browser-safe MCP and libp2p runtime modules', () => {
    expect(browserMcp).toHaveProperty('MCPDiscovery');
    expect(browserMcp).toHaveProperty('MCPPubSub');
    expect(browserMcp).toHaveProperty('Libp2pTransport');
    expect(browserMcp).toHaveProperty('MCPTransportFactory');
    expect(browserMcp).toHaveProperty('MCPClient');
    expect(browserMcp).toHaveProperty('MCPp2pSession');
    expect(browserMcp).toHaveProperty('connectLibp2pMcpSession');
    expect(browserMcp).toHaveProperty('buildEnvelope');
    expect(browserMcp).toHaveProperty('buildReceipt');
    expect(browserMcp).toHaveProperty('computeCID');
    expect(browserMcp).toHaveProperty('WasmProverHub');
    expect(browserMcp).toHaveProperty('AGENT_SUPERVISOR_CONSOLE_CONTRACT');
    expect(browserMcp).toHaveProperty('createAgentSupervisorConsoleGateway');
  });

  it('does not export host-only or deprecated Python-remote compatibility adapters', () => {
    expect(browserMcp).not.toHaveProperty('RemoteDeonticEngine');
    expect(browserMcp).not.toHaveProperty('createRemoteDeonticORBEvaluator');
    expect(browserMcp).not.toHaveProperty('DeploymentManager');
    expect(browserMcp).not.toHaveProperty('ServerRegistry');
    expect(browserMcp).not.toHaveProperty('TrafficManager');
    expect(browserMcp).not.toHaveProperty('getClients');
    expect(browserMcp).not.toHaveProperty('getMCPCommands');
  });
});
