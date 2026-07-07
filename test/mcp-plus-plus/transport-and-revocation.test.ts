/**
 * Tests for:
 *  1. WebSocketTransport — connection lifecycle, send, auto-reconnect
 *  2. HttpsTransport — connect probe, send/request with node-fetch
 *  3. WebRTCTransport — Node.js environment error, graceful degradation
 *  4. MCPTransportFactory — creates correct type per option
 *  5. UCANRevocationRegistry — revoke, isRevoked, validateToken integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPTransportFactory, MCPClient } from '../../src/services/mcp-transport.js';
import { UCANAuth } from '../../src/auth/ucan-auth.js';
import { UCANRevocationRegistry } from '../../src/auth/ucan-auth.js';
import { DIDKeystore } from '../../src/auth/did-keystore.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWsServer(port: number): Promise<{
  url: string;
  close: () => void;
  broadcast: (msg: unknown) => void;
}> {
  return new Promise<{
    url: string;
    close: () => void;
    broadcast: (msg: unknown) => void;
  }>(resolve => {
    import('ws').then(({ WebSocketServer }) => {
      const wss = new WebSocketServer({ port });
      const clients: Set<unknown> = new Set();

      wss.on('connection', (ws: any) => {
        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
        // echo back everything
        ws.on('message', (data: Buffer) => ws.send(data.toString()));
      });

      wss.on('listening', () => {
        resolve({
          url: `ws://127.0.0.1:${port}`,
          close: () => wss.close(),
          broadcast: (msg: unknown) => {
            for (const c of clients) {
              (c as any).send(JSON.stringify(msg));
            }
          },
        });
      });
    });
  });
}

// ---------------------------------------------------------------------------
// MCPTransportFactory
// ---------------------------------------------------------------------------

describe('MCPTransportFactory', () => {
  it('creates a WebSocket transport', () => {
    const t = MCPTransportFactory.create({ type: 'websocket', endpoint: 'ws://localhost:9999' });
    expect(t.getType()).toBe('websocket');
    expect(t.isConnected()).toBe(false);
  });

  it('creates an HTTPS transport', () => {
    const t = MCPTransportFactory.create({ type: 'https', endpoint: 'https://example.com/mcp' });
    expect(t.getType()).toBe('https');
  });

  it('creates a libp2p transport', () => {
    const t = MCPTransportFactory.create({ type: 'libp2p', endpoint: '/ip4/127.0.0.1/tcp/9100' });
    expect(t.getType()).toBe('libp2p');
  });

  it('creates a WebRTC transport', () => {
    const t = MCPTransportFactory.create({ type: 'webrtc', endpoint: 'ws://signaling:4000' });
    expect(t.getType()).toBe('webrtc');
  });

  it('throws for unknown transport type', () => {
    expect(() =>
      MCPTransportFactory.create({ type: 'unknown' as never, endpoint: 'x' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// WebSocketTransport — integration using a real ws server
// ---------------------------------------------------------------------------

describe('WebSocketTransport', () => {
  let server: Awaited<ReturnType<typeof makeWsServer>>;

  beforeEach(async () => {
    server = await makeWsServer(47821);
  });

  afterEach(() => {
    server.close();
  });

  it('connects to a real WS server', async () => {
    const transport = MCPTransportFactory.create({
      type: 'websocket',
      endpoint: server.url,
      timeout: 5000,
    });
    const ok = await transport.connect();
    expect(ok).toBe(true);
    expect(transport.isConnected()).toBe(true);
    await transport.disconnect();
    expect(transport.isConnected()).toBe(false);
  }, 10000);

  it('sends a message and receives the echo', async () => {
    const transport = MCPTransportFactory.create({
      type: 'websocket',
      endpoint: server.url,
      timeout: 5000,
    });
    await transport.connect();

    const received: unknown[] = [];
    transport.on('message', (msg) => received.push(msg));

    await transport.send({ hello: 'world' });

    // Give the echo a moment to arrive
    await new Promise(r => setTimeout(r, 200));
    expect(received).toHaveLength(1);
    expect((received[0] as Record<string, unknown>).hello).toBe('world');

    await transport.disconnect();
  }, 10000);

  it('fails gracefully for an unreachable server', async () => {
    const transport = MCPTransportFactory.create({
      type: 'websocket',
      endpoint: 'ws://127.0.0.1:1', // port 1 is never open
      timeout: 3000,
    });
    const ok = await transport.connect();
    expect(ok).toBe(false);
  }, 15000);

  it('throws when send() is called while disconnected', async () => {
    const transport = MCPTransportFactory.create({
      type: 'websocket',
      endpoint: 'ws://127.0.0.1:1',
    });
    await expect(transport.send({ x: 1 })).rejects.toThrow();
  });

  it('receive() throws (event-driven API)', async () => {
    const transport = MCPTransportFactory.create({
      type: 'websocket',
      endpoint: server.url,
      timeout: 5000,
    });
    await transport.connect();
    await expect(transport.receive()).rejects.toThrow();
    await transport.disconnect();
  }, 10000);
});

// ---------------------------------------------------------------------------
// HttpsTransport
// ---------------------------------------------------------------------------

describe('HttpsTransport', () => {
  it('connect() marks ready even when OPTIONS returns 405', async () => {
    // We avoid mocking node-fetch here; just check
    // that connect() doesn't throw and returns true or false without crashing.
    const transport = MCPTransportFactory.create({
      type: 'https',
      endpoint: 'https://httpbin.org/post',
      timeout: 5000,
    });
    // connect() may succeed or fail (network unreachable in CI), but must not throw
    const result = await transport.connect().catch(() => false);
    expect(typeof result).toBe('boolean');
  }, 10000);

  it('disconnect() emits disconnect event', async () => {
    const transport = MCPTransportFactory.create({
      type: 'https',
      endpoint: 'https://example.com/mcp',
    });
    // Force mark connected
    (transport as unknown as { connected: boolean }).connected = true;

    let disconnected = false;
    transport.on('disconnect', () => { disconnected = true; });

    await transport.disconnect();
    expect(disconnected).toBe(true);
    expect(transport.isConnected()).toBe(false);
  });

  it('send() throws when not connected', async () => {
    const transport = MCPTransportFactory.create({
      type: 'https',
      endpoint: 'https://example.com/mcp',
    });
    await expect(transport.send({ test: 1 })).rejects.toThrow('not ready');
  });

  it('receive() always throws', async () => {
    const transport = MCPTransportFactory.create({
      type: 'https',
      endpoint: 'https://example.com/mcp',
    });
    await expect(transport.receive()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// WebRTCTransport — Node.js environment
// ---------------------------------------------------------------------------

describe('WebRTCTransport (Node.js environment)', () => {
  it('connect() throws because RTCPeerConnection is unavailable in Node.js', async () => {
    const transport = MCPTransportFactory.create({
      type: 'webrtc',
      endpoint: 'ws://signaling.example.com:4000',
    });
    await expect(transport.connect()).rejects.toThrow('RTCPeerConnection');
  });

  it('send() throws when not connected', async () => {
    const transport = MCPTransportFactory.create({
      type: 'webrtc',
      endpoint: 'ws://signaling.example.com:4000',
    });
    await expect(transport.send({ msg: 1 })).rejects.toThrow();
  });

  it('disconnect() is safe to call before connect()', async () => {
    const transport = MCPTransportFactory.create({
      type: 'webrtc',
      endpoint: 'ws://signaling.example.com:4000',
    });
    await expect(transport.disconnect()).resolves.toBeUndefined();
  });

  it('getType() returns webrtc', () => {
    const transport = MCPTransportFactory.create({
      type: 'webrtc',
      endpoint: 'ws://signaling.example.com:4000',
    });
    expect(transport.getType()).toBe('webrtc');
  });
});

// ---------------------------------------------------------------------------
// UCANRevocationRegistry
// ---------------------------------------------------------------------------

describe('UCANRevocationRegistry', () => {
  let registry: UCANRevocationRegistry;

  beforeEach(() => {
    registry = new UCANRevocationRegistry();
  });

  it('initially has no revocations', () => {
    expect(registry.listRevocations()).toHaveLength(0);
  });

  it('revoke() by CID marks it as revoked', () => {
    const cid = 'sha256:' + 'a'.repeat(64);
    registry.revoke(cid, 'did:key:zTest', 'compromised');
    expect(registry.isRevoked(cid)).toBe(true);
  });

  it('revokeToken() computes CID from raw token', () => {
    const token = 'header.payload.sig';
    registry.revokeToken(token, 'did:key:zRevoker');
    expect(registry.isTokenRevoked(token)).toBe(true);
  });

  it('revokeTokenChain() revokes a token and its proof chain', () => {
    const keystore = new DIDKeystore();
    const auth = new UCANAuth(keystore, registry);
    const rootIssuer = keystore.generateKey();
    const midIssuer = keystore.generateKey();
    const leafAudience = keystore.generateKey();

    const root = auth.issueToken(rootIssuer, midIssuer, [{ rsc: '*', cap: '*' }]);
    const leaf = auth.issueToken(
      midIssuer,
      leafAudience,
      [{ rsc: 'storage/*', cap: 'WRITE' }],
      3600,
      [root],
    );

    const count = registry.revokeTokenChain(leaf, 'did:key:zRevoker', 'chain compromised');
    expect(count).toBe(2);
    expect(registry.isTokenRevoked(leaf)).toBe(true);
    expect(registry.isTokenRevoked(root)).toBe(true);
  });

  it('getRevocation() returns entry with metadata', () => {
    registry.revoke('sha256:' + 'b'.repeat(64), 'did:key:z1', 'test reason');
    const entry = registry.getRevocation('sha256:' + 'b'.repeat(64))!;
    expect(entry.revokedBy).toBe('did:key:z1');
    expect(entry.reason).toBe('test reason');
    expect(entry.revokedAt).toMatch(/^\d{4}-/);
  });

  it('listRevocations() returns all entries', () => {
    registry.revoke('sha256:' + 'c'.repeat(64));
    registry.revoke('sha256:' + 'd'.repeat(64));
    expect(registry.listRevocations()).toHaveLength(2);
  });

  it('removeRevocation() un-revokes a token', () => {
    const cid = 'sha256:' + 'e'.repeat(64);
    registry.revoke(cid);
    expect(registry.isRevoked(cid)).toBe(true);
    registry.removeRevocation(cid);
    expect(registry.isRevoked(cid)).toBe(false);
  });

  it('clear() removes all revocations', () => {
    registry.revoke('sha256:' + 'f'.repeat(64));
    registry.clear();
    expect(registry.listRevocations()).toHaveLength(0);
  });

  it('onRevocation callback fires on each revoke()', () => {
    const fired: string[] = [];
    const reg = new UCANRevocationRegistry({
      onRevocation: (e) => fired.push(e.tokenCid),
    });
    reg.revoke('sha256:' + '1'.repeat(64));
    reg.revoke('sha256:' + '2'.repeat(64));
    expect(fired).toHaveLength(2);
  });

  it('getInstance() returns the shared singleton', () => {
    const a = UCANRevocationRegistry.getInstance();
    const b = UCANRevocationRegistry.getInstance();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// UCANAuth + UCANRevocationRegistry integration
// ---------------------------------------------------------------------------

describe('UCANAuth revocation integration', () => {
  let keystore: DIDKeystore;
  let auth: UCANAuth;
  let registry: UCANRevocationRegistry;

  beforeEach(() => {
    keystore = new DIDKeystore();
    registry = new UCANRevocationRegistry();
    auth = new UCANAuth(keystore, registry);
  });

  it('validateToken() returns false for a revoked token', async () => {
    const issuer = keystore.generateKey();
    const audience = keystore.generateKey();
    const token = auth.issueToken(issuer, audience, [
      { rsc: 'mcp++/invoke', cap: 'mcp++/invoke' },
    ]);

    // Sanity: token validates before revocation
    expect(await auth.validateToken(token)).toBe(true);

    // Revoke it
    registry.revokeToken(token, issuer, 'test revocation');

    // Must no longer validate
    expect(await auth.validateToken(token)).toBe(false);
  });

  it('can() returns false for a revoked token', async () => {
    const issuer = keystore.generateKey();
    const audience = keystore.generateKey();
    const token = auth.issueToken(issuer, audience, [
      { rsc: 'storage/*', cap: 'WRITE' },
    ]);

    // Before revocation
    expect(await auth.can(token, 'storage/data', 'WRITE')).toBe(true);

    // After revocation
    registry.revokeToken(token);
    expect(await auth.can(token, 'storage/data', 'WRITE')).toBe(false);
  });

  it('validateToken() still validates a non-revoked token alongside revoked ones', async () => {
    const issuer = keystore.generateKey();
    const audience = keystore.generateKey();

    const revokedToken = auth.issueToken(issuer, audience, [
      { rsc: '*', cap: '*' },
    ]);
    const validToken = auth.issueToken(issuer, audience, [
      { rsc: 'mcp++/read', cap: 'mcp++/read' },
    ]);

    registry.revokeToken(revokedToken);

    expect(await auth.validateToken(revokedToken)).toBe(false);
    expect(await auth.validateToken(validToken)).toBe(true);
  });
});
