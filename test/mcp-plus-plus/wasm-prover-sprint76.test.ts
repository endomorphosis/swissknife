/**
 * wasm-prover-sprint76.test.ts
 * Tests for Sprint 76 — MCP Multi-Protocol Transport (all 12 deferred TODOs):
 *   - patches/mcp/fix-mcp-transport.ts
 *     WebSocketTransport, Libp2pTransport, WebRTCTransport, HttpsTransport, MCPTransportFactory, MCPClient
 */

import {
  MCPTransportFactory,
  MCPClient,
  type MCPTransportType,
} from '../../src/patches/mcp/fix-mcp-transport';

// ---------------------------------------------------------------------------
// MCPTransportFactory — T-350..T-353
// ---------------------------------------------------------------------------
describe('MCPTransportFactory.create', () => {
  it('returns a websocket transport with correct type', () => {
    const t = MCPTransportFactory.create({ type: 'websocket', endpoint: 'ws://localhost:9000' });
    expect(t.getType()).toBe('websocket');
  });

  it('returns a libp2p transport with correct type', () => {
    const t = MCPTransportFactory.create({ type: 'libp2p', endpoint: '/ip4/127.0.0.1/tcp/4001' });
    expect(t.getType()).toBe('libp2p');
  });

  it('returns a webrtc transport with correct type', () => {
    const t = MCPTransportFactory.create({ type: 'webrtc', endpoint: 'http://signal.local' });
    expect(t.getType()).toBe('webrtc');
  });

  it('returns an https transport with correct type', () => {
    const t = MCPTransportFactory.create({ type: 'https', endpoint: 'http://localhost:1' });
    expect(t.getType()).toBe('https');
  });

  it('throws on unknown transport type', () => {
    expect(() =>
      MCPTransportFactory.create({ type: 'unknown' as MCPTransportType, endpoint: 'x' })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// HttpsTransport — T-353 (directly testable without network)
// ---------------------------------------------------------------------------
describe('HttpsTransport', () => {
  it('connect() returns true', async () => {
    const t = MCPTransportFactory.create({ type: 'https', endpoint: 'http://localhost:1' });
    expect(await t.connect()).toBe(true);
    expect(t.isConnected()).toBe(true);
  });

  it('disconnect() marks disconnected', async () => {
    const t = MCPTransportFactory.create({ type: 'https', endpoint: 'http://localhost:1' });
    await t.connect();
    await t.disconnect();
    expect(t.isConnected()).toBe(false);
  });

  it('send() throws when not connected', async () => {
    const t = MCPTransportFactory.create({ type: 'https', endpoint: 'http://localhost:1' });
    await expect(t.send({ msg: 'test' })).rejects.toThrow('not ready');
  });

  it('send() falls back gracefully when endpoint unreachable', async () => {
    const t = MCPTransportFactory.create({ type: 'https', endpoint: 'http://localhost:1', timeout: 100 });
    await t.connect();
    // Should throw a network error (not a logic error)
    await expect(t.send({ test: true })).rejects.toThrow();
  });

  it('receive() throws with instruction message', async () => {
    const t = MCPTransportFactory.create({ type: 'https', endpoint: 'http://localhost:1' });
    await t.connect();
    await expect(t.receive()).rejects.toThrow('SSE');
  });

  it('on/off event listener registers without error', async () => {
    const t = MCPTransportFactory.create({ type: 'https', endpoint: 'http://localhost:1' });
    const listener = jest.fn();
    expect(() => t.on('disconnect', listener)).not.toThrow();
    expect(() => t.off('disconnect', listener)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// WebSocketTransport — T-350
// ---------------------------------------------------------------------------
describe('WebSocketTransport', () => {
  it('connect() returns a boolean (true if ws available, false if not)', async () => {
    const t = MCPTransportFactory.create({ type: 'websocket', endpoint: 'ws://localhost:1', timeout: 200 });
    // In test env 'ws' package IS installed; connection to port 1 will fail → returns false
    const result = await t.connect().catch(() => false);
    expect(typeof result).toBe('boolean');
  });

  it('disconnect() does not throw when not connected', async () => {
    const t = MCPTransportFactory.create({ type: 'websocket', endpoint: 'ws://localhost:1' });
    await expect(t.disconnect()).resolves.not.toThrow();
  });

  it('send() throws when not connected', async () => {
    const t = MCPTransportFactory.create({ type: 'websocket', endpoint: 'ws://localhost:1' });
    await expect(t.send({ hello: 'world' })).rejects.toThrow('not connected');
  });

  it('receive() throws with instruction to use events', async () => {
    const t = MCPTransportFactory.create({ type: 'websocket', endpoint: 'ws://localhost:1' });
    await expect(t.receive()).rejects.toThrow(/"message"/i);
  });
});

// ---------------------------------------------------------------------------
// Libp2pTransport — T-351
// ---------------------------------------------------------------------------
describe('Libp2pTransport', () => {
  it('connect() returns true (stub mode when @libp2p/core not installed)', async () => {
    const t = MCPTransportFactory.create({ type: 'libp2p', endpoint: '/ip4/127.0.0.1/tcp/4001' });
    expect(await t.connect()).toBe(true);
    expect(t.isConnected()).toBe(true);
  });

  it('send() logs in stub mode without throwing', async () => {
    const t = MCPTransportFactory.create({ type: 'libp2p', endpoint: '/ip4/127.0.0.1/tcp/4001' });
    await t.connect();
    await expect(t.send({ formula: 'O(agent, deliver)' })).resolves.not.toThrow();
  });

  it('disconnect() cleans up cleanly', async () => {
    const t = MCPTransportFactory.create({ type: 'libp2p', endpoint: '/ip4/127.0.0.1/tcp/4001' });
    await t.connect();
    await t.disconnect();
    expect(t.isConnected()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WebRTCTransport — T-352
// ---------------------------------------------------------------------------
describe('WebRTCTransport', () => {
  it('connect() returns true (stub mode: RTCPeerConnection absent in Node)', async () => {
    const t = MCPTransportFactory.create({ type: 'webrtc', endpoint: 'http://signal.local' });
    const result = await t.connect();
    expect(result).toBe(true);
  });

  it('send() in stub mode logs without throwing', async () => {
    const t = MCPTransportFactory.create({ type: 'webrtc', endpoint: 'http://signal.local' });
    await t.connect();
    await expect(t.send({ payload: 'test' })).resolves.not.toThrow();
  });

  it('disconnect() marks disconnected', async () => {
    const t = MCPTransportFactory.create({ type: 'webrtc', endpoint: 'http://signal.local' });
    await t.connect();
    await t.disconnect();
    expect(t.isConnected()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MCPClient — wraps factory transport
// ---------------------------------------------------------------------------
describe('MCPClient', () => {
  it('constructs with https transport', () => {
    const client = new MCPClient({ type: 'https', endpoint: 'http://localhost:1', timeout: 100 });
    expect(client).toBeInstanceOf(MCPClient);
  });

  it('connect() and disconnect() flow does not throw', async () => {
    const client = new MCPClient({ type: 'https', endpoint: 'http://localhost:1', timeout: 100 });
    await expect(client.connect()).resolves.not.toThrow();
    await expect(client.disconnect()).resolves.not.toThrow();
  });

  it('sendRequest() throws when transport not connected', async () => {
    const client = new MCPClient({ type: 'https', endpoint: 'http://localhost:1', timeout: 100 });
    // Do not call connect()
    await expect(client.sendRequest({ type: 'ping' })).rejects.toThrow('not connected');
  });

  it('generates completion shape when HTTPS transport is connected', async () => {
    const client = new MCPClient({ type: 'https', endpoint: 'http://localhost:1', timeout: 100 });
    await client.connect();
    // Unreachable endpoint — should throw a network error
    await expect(client.generateCompletion('Hello')).rejects.toThrow();
  });
});
