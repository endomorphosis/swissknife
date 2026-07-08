<<<<<<< HEAD
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
=======
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBrowserLibp2pConfig,
  createBrowserLibp2pNode,
  summarizeBrowserLibp2pGaps,
  type BrowserLibp2pImport,
} from '../../src/services/mcp/libp2p-browser-runtime.js';

const ROOT = resolve(__dirname, '../..');

function component(kind: string) {
  return { kind };
}

function makeImporter(
  missingPackages: string[] = [],
  capture: { createdWith?: Record<string, unknown> } = {},
): BrowserLibp2pImport {
  const modules: Record<string, Record<string, unknown>> = {
    libp2p: {
      createLibp2p: async (config: Record<string, unknown>) => {
        capture.createdWith = config;
        return {
          started: false,
          services: config.services ?? {},
          async start() {
            this.started = true;
          },
          async stop() {
            this.started = false;
          },
        };
      },
    },
    '@libp2p/webrtc': {
      webRTC: () => component('webrtc'),
    },
    '@libp2p/websockets': {
      webSockets: () => component('websockets'),
    },
    '@libp2p/circuit-relay-v2': {
      circuitRelayTransport: () => component('circuit-relay-v2'),
    },
    '@chainsafe/libp2p-noise': {
      noise: () => component('noise'),
    },
    '@chainsafe/libp2p-yamux': {
      yamux: () => component('yamux'),
    },
    '@libp2p/identify': {
      identify: () => component('identify'),
    },
    '@chainsafe/libp2p-gossipsub': {
      gossipsub: () => component('gossipsub'),
    },
  };

  return async specifier => {
    if (missingPackages.includes(specifier) || !(specifier in modules)) {
      throw new Error(`Cannot find package ${specifier}`);
    }
    return modules[specifier];
  };
}

function kinds(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map(value => (value as { kind: string }).kind)
    : [];
}

describe('browser libp2p runtime defaults', () => {
  it('enables WebRTC, WebSockets, circuit relay v2, Noise, Yamux, Identify, and GossipSub by default', async () => {
    const { config, report } = await buildBrowserLibp2pConfig({
      importModule: makeImporter(['@libp2p/gossipsub']),
    });

    expect(report.enabled).toBe(true);
    expect(report.gaps).toEqual([]);
    expect(kinds(config.transports)).toEqual([
      'webrtc',
      'websockets',
      'circuit-relay-v2',
    ]);
    expect(kinds(config.connectionEncryption)).toEqual(['noise']);
    expect(kinds(config.streamMuxers)).toEqual(['yamux']);
    expect((config.services as Record<string, { kind: string }>).identify.kind).toBe('identify');
    expect((config.services as Record<string, { kind: string }>).pubsub.kind).toBe('gossipsub');
    expect((config.addresses as { listen: string[] }).listen).toEqual(['/webrtc']);

    const configured = report.capabilities
      .filter(capability => capability.configured)
      .map(capability => capability.name);
    expect(configured).toEqual([
      'webrtc',
      'websockets',
      'circuit-relay-v2',
      'noise',
      'yamux',
      'identify',
      'gossipsub',
    ]);
  });

  it('reports unavailable optional packages as capability gaps without adding substitute transports', async () => {
    const { config, report } = await buildBrowserLibp2pConfig({
      importModule: makeImporter([
        '@libp2p/webrtc',
        '@libp2p/circuit-relay-v2',
        '@libp2p/gossipsub',
        '@chainsafe/libp2p-gossipsub',
      ]),
    });

    expect(kinds(config.transports)).toEqual(['websockets']);
    expect((config.services as Record<string, unknown>).pubsub).toBeUndefined();
    expect(report.gaps.map(gap => gap.name)).toEqual([
      'webrtc',
      'circuit-relay-v2',
      'gossipsub',
    ]);
    expect(summarizeBrowserLibp2pGaps(report).join('\n')).toContain('@libp2p/webrtc');
  });

  it('creates libp2p with the assembled browser config and reports libp2p itself', async () => {
    const capture: { createdWith?: Record<string, unknown> } = {};
    const runtime = await createBrowserLibp2pNode({
      importModule: makeImporter(['@libp2p/gossipsub'], capture),
      libp2pOptions: {
        addresses: { listen: ['/webrtc', '/p2p-circuit'] },
      },
    });

    expect(runtime.node).toBeDefined();
    expect(capture.createdWith).toBe(runtime.config);
    expect((runtime.config.addresses as { listen: string[] }).listen).toEqual([
      '/webrtc',
      '/p2p-circuit',
    ]);
    expect(runtime.report.capabilities.some(capability =>
      capability.name === 'libp2p' &&
      capability.installed &&
      capability.configured
    )).toBe(true);
  });

  it('keeps the runtime free of local transport replacements', () => {
    const source = readFileSync(
      resolve(ROOT, 'src/services/mcp/libp2p-browser-runtime.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/\b(noop|mock|stub)\b/i);
    expect(source).not.toMatch(/fallback\s+transport/i);
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
  });
});
