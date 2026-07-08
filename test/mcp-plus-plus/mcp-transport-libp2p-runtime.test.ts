import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => {
  const dialCalls: Array<{ endpoint: string; protocol: string }> = [];
  const createdConfigs: Record<string, unknown>[] = [];
  return {
    dialCalls,
    createdConfigs,
    createLibp2p: vi.fn(async (config: Record<string, unknown>) => {
      createdConfigs.push(config);
      return {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      dialProtocol: vi.fn(async (endpoint: unknown, protocol: string) => {
        dialCalls.push({ endpoint: String(endpoint), protocol });
        return {};
      }),
      };
    }),
  };
});

vi.mock('libp2p', () => ({
  createLibp2p: runtimeMocks.createLibp2p,
}));

vi.mock('../../src/services/mcp/mcp-p2p-session.js', () => {
  class MockMCPp2pSession {
    handshakeResult = {
      capabilities: { mcpPlusPlusProfiles: ['mcp++/p2p-transport'] },
    };

    constructor(
      readonly stream: unknown,
      readonly options?: Record<string, unknown>,
    ) {}

    async handshake(): Promise<void> {}
    on(): void {}
    async close(): Promise<void> {}
    async sendNotification(): Promise<void> {}
  }

  return {
    MCP_P2P_PROTOCOL_ID: '/mcp+p2p/1.0.0',
    MCPp2pSession: MockMCPp2pSession,
  };
});

describe('Libp2pTransport browser runtime wiring', () => {
  beforeEach(() => {
    runtimeMocks.dialCalls.length = 0;
    runtimeMocks.createdConfigs.length = 0;
    runtimeMocks.createLibp2p.mockClear();
  });

  it('dials the configured MCP+p2p protocol id', async () => {
    const { connectLibp2pMcpSession } = await import('../../src/services/mcp/mcp-transport');
    const endpoint = '/dns4/peer.example/tcp/443/tls/ws';
    const { transport } = await connectLibp2pMcpSession(endpoint, {
      p2pProtocolId: '/mcp+p2p/browser-test/1.0.0',
    });

    expect(runtimeMocks.dialCalls).toEqual([
      { endpoint, protocol: '/mcp+p2p/browser-test/1.0.0' },
    ]);
    await transport.disconnect();
  });

  it('keeps libp2p WebRTC, WebSocket, and relay enabled when dialing', async () => {
    const { connectLibp2pMcpSession } = await import('../../src/services/mcp/mcp-transport');
    await connectLibp2pMcpSession('/dns4/peer.example/tcp/443/tls/ws');

    expect(runtimeMocks.createLibp2p).toHaveBeenCalledOnce();
    const config = runtimeMocks.createdConfigs[0] as {
      transports?: unknown[];
      connectionEncrypters?: unknown[];
      streamMuxers?: unknown[];
      services?: Record<string, unknown>;
    };
    expect(config.transports?.length).toBeGreaterThanOrEqual(3);
    expect(config.connectionEncrypters?.length).toBeGreaterThanOrEqual(1);
    expect(config.streamMuxers?.length).toBeGreaterThanOrEqual(1);
    expect(config.services).toEqual(expect.objectContaining({
      identify: expect.anything(),
      pubsub: expect.anything(),
    }));
    expect(runtimeMocks.dialCalls[0]?.protocol).toBe('/mcp+p2p/1.0.0');
  });
});
