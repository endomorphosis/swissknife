/**
 * Phase 2 — Interop tests (MCP++ Profile E §9.6 checklist)
 * Tests for MCPp2pSession framing, correlation, rate-limiting, and the
 * principle that peer identity ≠ execution authority.
 */

import {
  MCPp2pSession,
  P2PStream,
  DEFAULT_MAX_FRAME_BYTES,
  MIN_MAX_FRAME_BYTES,
  SessionErrorCode,
  SessionError,
  computeBackoffDelay,
  negotiateCapabilities,
  MCP_PLUS_PLUS_PROFILES,
} from '../../src/services/mcp/mcp-p2p-session';

// ---------------------------------------------------------------------------
// Mock P2PStream
// ---------------------------------------------------------------------------

type MockStreamOpts = {
  /** bytes to inject into the read side (pre-chunked) */
  inbound?: Buffer[];
  /** custom max-frame override for abort testing */
  maxFrameOverride?: number;
};

function buildLengthPrefixedFrame(msg: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  const hdr = Buffer.allocUnsafe(4);
  hdr.writeUInt32BE(body.length, 0);
  return Buffer.concat([hdr, body]);
}

function makeMockStream(opts: MockStreamOpts = {}): P2PStream & {
  written: Buffer[];
  closed: boolean;
  aborted: boolean;
} {
  const written: Buffer[] = [];
  let closed = false;
  let aborted = false;
  const inbound = opts.inbound ? [...opts.inbound] : [];

  return {
    written,
    get closed() { return closed; },
    get aborted() { return aborted; },
    write(chunk: Uint8Array): void {
      written.push(Buffer.from(chunk));
    },
    close(): void {
      closed = true;
    },
    abort(): void {
      aborted = true;
    },
    async *[Symbol.asyncIterator]() {
      for (const chunk of inbound) {
        yield chunk;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInitResponse(): Buffer {
  return buildLengthPrefixedFrame({
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'test-server', version: '1.0.0' },
      capabilities: { tools: true, mcpPlusPlusProfiles: ['mcp++/ucan'] },
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCPp2pSession framing (MCP++ §5.1)', () => {
  it('uses 16 MiB as the default max frame size', () => {
    expect(DEFAULT_MAX_FRAME_BYTES).toBe(16 * 1024 * 1024);
  });

  it('rejects maxFrameBytes below the minimum guardrail', () => {
    const stream = makeMockStream();
    expect(
      () =>
        new MCPp2pSession(stream, {
          maxFrameBytes: MIN_MAX_FRAME_BYTES - 1,
        }),
    ).toThrow(/maxFrameBytes must be >=/i);
  });

  it('writes a u32 big-endian length-prefixed frame', async () => {
    const stream = makeMockStream({ inbound: [makeInitResponse()] });
    const session = new MCPp2pSession(stream);
    await session.handshake({ name: 'test', version: '1.0.0' });

    // The first write is the initialize request
    const frame = session['session'] ?? null;
    // Check that at least one write happened
    expect(stream.written.length).toBeGreaterThan(0);
    const firstFrame = stream.written[0];
    // First 4 bytes are length
    const len = firstFrame.readUInt32BE(0);
    expect(len).toBe(firstFrame.length - 4);
  });

  it('aborts session on oversized incoming frame', async () => {
    // Build a frame that claims to be larger than the limit
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(DEFAULT_MAX_FRAME_BYTES + 1, 0);

    const stream = makeMockStream({ inbound: [header] });
    const session = new MCPp2pSession(stream);

    await new Promise<void>(resolve => {
<<<<<<< Updated upstream
      session.on('error', _err => {
        // Session should emit an error and close
=======
      session.on('error', () => {
        // Session should emit an error and close.
>>>>>>> Stashed changes
        resolve();
      });
      session.on('close', () => resolve());
    });
  });
});

describe('MCPp2pSession request correlation (MCP++ §9.2)', () => {
  it('resolves concurrent requests to the correct handler', async () => {
    // Use a deferred stream so we can push frames at the right time
    const frameQueue: Buffer[] = [];
    let resolver: (() => void) | null = null;

    async function* deferredStream() {
      while (true) {
        if (frameQueue.length > 0) {
          yield frameQueue.shift()!;
        } else {
          await new Promise<void>(res => { resolver = res; });
        }
      }
    }

    function pushFrame(frame: Buffer) {
      frameQueue.push(frame);
      if (resolver) { resolver(); resolver = null; }
    }

    const written: Buffer[] = [];
    const stream: P2PStream = {
      write(chunk: Uint8Array) { written.push(Buffer.from(chunk)); },
      [Symbol.asyncIterator]() { return deferredStream(); },
    };

    const session = new MCPp2pSession(stream);

    // Push handshake response (id=1) immediately
    pushFrame(buildLengthPrefixedFrame({
      jsonrpc: '2.0', id: 1,
      result: { protocolVersion: '2024-11-05', serverInfo: { name: 's', version: '1' }, capabilities: {} },
    }));

    const hs = await session.handshake({ name: 'c', version: '1' });
    expect(hs.serverInfo.name).toBe('s');

    // Now register both requests BEFORE pushing their responses
    const r2 = session.sendRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const r3 = session.sendRequest({ jsonrpc: '2.0', id: 3, method: 'tools/get', params: { name: 'x' } });

    // Push responses AFTER the requests are registered
    pushFrame(buildLengthPrefixedFrame({ jsonrpc: '2.0', id: 2, result: { answer: 42 } }));
    pushFrame(buildLengthPrefixedFrame({ jsonrpc: '2.0', id: 3, result: { answer: 99 } }));

    const [res2, res3] = await Promise.all([r2, r3]);
    expect((res2.result as { answer: number }).answer).toBe(42);
    expect((res3.result as { answer: number }).answer).toBe(99);

    await session.close();
  });
});

describe('MCPp2pSession rate limiting (MCP++ §9.3)', () => {
  it('emits error when rate limit is exceeded', async () => {
    // Set a very small window limit
    const frames: Buffer[] = [];
    for (let i = 0; i < 5; i++) {
      frames.push(buildLengthPrefixedFrame({
        jsonrpc: '2.0',
        method: 'ping',
      }));
    }
    const stream = makeMockStream({ inbound: frames });
    const session = new MCPp2pSession(stream, {
      rateLimitMaxMsgs: 2,
      rateLimitWindowMs: 10_000, // long window so all 5 are in the same window
    });

<<<<<<< Updated upstream
    let errorCount = 0;
    await new Promise<void>(resolve => {
      session.on('error', () => {
        errorCount++;
        if (errorCount >= 1) resolve();
      });
      session.on('message', () => {
        // Some messages will get through (first 2 within limit)
      });
=======
    await new Promise<void>(resolve => {
      session.on('error', () => resolve());
    });
    session.on('message', () => {
      // Some messages will get through (first 2 within limit)
>>>>>>> Stashed changes
    });
  });
});

describe('Authorization separation (MCP++ §9.4)', () => {
  it('transport handshake succeeds even without a UCAN proof in params', async () => {
    // The session itself does not enforce UCAN — it is the application layer's job.
    // Here we verify the transport-level handshake works without any proof.
    const resp = buildLengthPrefixedFrame({
      jsonrpc: '2.0', id: 1,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'peer', version: '1' },
        capabilities: {},
      },
    });
    const stream = makeMockStream({ inbound: [resp] });
    const session = new MCPp2pSession(stream);
    const result = await session.handshake({ name: 'client', version: '1' });
    // Transport handshake succeeded
    expect(result.serverInfo.name).toBe('peer');
    // No UCAN token was sent at the transport level — that's intentional.
    // The actual tool call (application level) would enforce UCAN separately.
  });
});

describe('Session close', () => {
  it('rejects pending requests when closed', async () => {
    const stream = makeMockStream(); // no inbound — requests will hang
    const session = new MCPp2pSession(stream);

    const pending = session.sendRequest(
      { jsonrpc: '2.0', id: 99, method: 'slow/call' },
      5000,
    );
    await session.close();
    await expect(pending).rejects.toThrow(/closed/i);
  });
});

// ---------------------------------------------------------------------------
// Session error codes (MCP++ Profile E §9.1 — deterministic error taxonomy)
// ---------------------------------------------------------------------------

describe('SessionError and SessionErrorCode (MCP++ §9.1)', () => {
  it('SessionError carries a typed code', () => {
    const err = new SessionError(SessionErrorCode.FRAME_OVERSIZE, 'too big', { frameLen: 99 });
    expect(err.code).toBe(1001);
    expect(err.name).toBe('SessionError');
    expect(err.message).toBe('too big');
    expect((err.data as Record<string, unknown>)?.frameLen).toBe(99);
  });

  it('oversize outbound frame throws SessionError with FRAME_OUTBOUND_OVERSIZE', async () => {
    const session = new MCPp2pSession(makeSink(), { maxFrameBytes: 1024 * 1024 });
    // Build a message that will be larger than 1 MiB after serialisation
    const huge = 'x'.repeat(1024 * 1024 + 1);
    await expect(
      session.sendNotification({ jsonrpc: '2.0', method: 'test', params: { huge } }),
    ).rejects.toMatchObject({ code: SessionErrorCode.FRAME_OUTBOUND_OVERSIZE });
    await session.close();
  });

  it('SessionErrorCode FRAME_OVERSIZE is 1001', () => {
    expect(SessionErrorCode.FRAME_OVERSIZE).toBe(1001);
    expect(SessionErrorCode.FRAME_OUTBOUND_OVERSIZE).toBe(1002);
    expect(SessionErrorCode.FRAME_MALFORMED_JSON).toBe(1003);
    expect(SessionErrorCode.RATE_LIMIT_EXCEEDED).toBe(3001);
    expect(SessionErrorCode.SESSION_CLOSED).toBe(4001);
    expect(SessionErrorCode.SESSION_TIMEOUT).toBe(4003);
  });
});

// ---------------------------------------------------------------------------
// Session state machine (MCP++ Profile E §9.5)
// ---------------------------------------------------------------------------

describe('Session state machine (MCP++ §9.5)', () => {
  it('starts in idle state', () => {
    const session = new MCPp2pSession(makeSink());
    expect(session.sessionState).toBe('idle');
  });

  it('transitions through closing → closed on close()', async () => {
    const states: string[] = [];
    const session = new MCPp2pSession(makeSink());
    session.on('state', s => states.push(s));
    await session.close();
    expect(states).toContain('closing');
    expect(states).toContain('closed');
    expect(session.sessionState).toBe('closed');
  });

  it('emits state=handshaking then state=open during a successful handshake', async () => {
    const states: string[] = [];
    const { session } = makeHandshakingPair();
    session.on('state', s => states.push(s));
    await expect(
      session.handshake({ name: 'test', version: '0' }),
    ).resolves.toBeDefined();
    expect(states).toContain('handshaking');
    expect(states).toContain('open');
    await session.close();
  });
});

// ---------------------------------------------------------------------------
// Backoff reconnection policy (MCP++ Profile E §9.6)
// ---------------------------------------------------------------------------

describe('computeBackoffDelay (MCP++ §9.6)', () => {
  it('first attempt returns roughly initialDelayMs', () => {
    const d = computeBackoffDelay({ initialDelayMs: 500, jitter: 0 }, 0);
    expect(d).toBe(500);
  });

  it('doubles with backoffFactor=2', () => {
    const d1 = computeBackoffDelay({ initialDelayMs: 100, backoffFactor: 2, jitter: 0 }, 0);
    const d2 = computeBackoffDelay({ initialDelayMs: 100, backoffFactor: 2, jitter: 0 }, 1);
    const d3 = computeBackoffDelay({ initialDelayMs: 100, backoffFactor: 2, jitter: 0 }, 2);
    expect(d1).toBe(100);
    expect(d2).toBe(200);
    expect(d3).toBe(400);
  });

  it('caps at maxDelayMs', () => {
    const d = computeBackoffDelay({ initialDelayMs: 1000, backoffFactor: 10, maxDelayMs: 5000, jitter: 0 }, 5);
    expect(d).toBe(5000);
  });

  it('applies jitter so each call can differ slightly', () => {
    const results = new Set(
      Array.from({ length: 20 }, () =>
        computeBackoffDelay({ initialDelayMs: 1000, jitter: 0.5 }, 0),
      ),
    );
    // With 50% jitter over 20 draws, it's essentially impossible to get all identical
    expect(results.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Capability negotiation (MCP++ Profile E §3.2)
// ---------------------------------------------------------------------------

describe('negotiateCapabilities (MCP++ §3.2)', () => {
  it('returns full set when server supports everything', () => {
    const { negotiated, downgraded, unsupported } = negotiateCapabilities(
      ['a', 'b', 'c'],
      ['a', 'b', 'c', 'd'],
    );
    expect(negotiated).toEqual(['a', 'b', 'c']);
    expect(downgraded).toBe(false);
    expect(unsupported).toHaveLength(0);
  });

  it('downgrades and reports unsupported profiles', () => {
    const { negotiated, downgraded, unsupported } = negotiateCapabilities(
      ['a', 'b', 'c'],
      ['a'],
    );
    expect(negotiated).toEqual(['a']);
    expect(downgraded).toBe(true);
    expect(unsupported).toEqual(['b', 'c']);
  });

  it('MCP_PLUS_PLUS_PROFILES includes all current profiles', () => {
    expect(MCP_PLUS_PLUS_PROFILES).toContain('mcp++/cid-envelope');
    expect(MCP_PLUS_PLUS_PROFILES).toContain('mcp++/policy-d');
    expect(MCP_PLUS_PLUS_PROFILES).toContain('mcp++/pubsub-bus');
    expect(MCP_PLUS_PLUS_PROFILES).toContain('mcp++/p2p-transport');
    expect(MCP_PLUS_PLUS_PROFILES.length).toBeGreaterThanOrEqual(7);
  });

  it('handshake emits capability-downgrade when server lacks profiles', async () => {
    const downgradeEvents: unknown[] = [];
    const { session } = makeHandshakingPairWithProfiles(['mcp++/cid-envelope']);
    session.on('capability-downgrade', e => downgradeEvents.push(e));
    await session.handshake({ name: 'client', version: '1' });
    expect(downgradeEvents).toHaveLength(1);
    const ev = downgradeEvents[0] as { unsupported: string[] };
    expect(ev.unsupported.length).toBeGreaterThan(0);
    await session.close();
  });
});

// ---------------------------------------------------------------------------
// Helper: sink-only stream for state-machine tests
// ---------------------------------------------------------------------------

function makeSink(): P2PStream {
  return {
    async write() {},
    async *[Symbol.asyncIterator]() { /* never yields */ },
    async close() {},
  };
}

// Helper: build a handshake response frame for a given request id + server profiles
function buildHandshakeResponse(id: number, serverProfiles: readonly string[]): Buffer {
  return buildLengthPrefixedFrame({
    jsonrpc: '2.0', id,
    result: {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'mock', version: '1' },
      capabilities: { tools: true, mcpPlusPlusProfiles: serverProfiles },
    },
  });
}

// The session assigns nextId=1 on construction, so the first sendRequest id is 1.
function makeHandshakingPair() {
  const responseFrame = buildHandshakeResponse(1, MCP_PLUS_PLUS_PROFILES);
  const stream = makeMockStream({ inbound: [responseFrame] });
  const session = new MCPp2pSession(stream);
  return { session };
}

function makeHandshakingPairWithProfiles(serverProfiles: string[]) {
  const responseFrame = buildHandshakeResponse(1, serverProfiles);
  const stream = makeMockStream({ inbound: [responseFrame] });
  const session = new MCPp2pSession(stream);
  return { session };
}
