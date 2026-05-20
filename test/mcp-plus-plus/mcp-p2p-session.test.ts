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
} from '../../src/services/mcp-p2p-session';

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

  it('aborts session on oversized incoming frame', done => {
    // Build a frame that claims to be larger than the limit
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(DEFAULT_MAX_FRAME_BYTES + 1, 0);

    const stream = makeMockStream({ inbound: [header] });
    const session = new MCPp2pSession(stream);

    session.on('error', _err => {
      // Session should emit an error and close
      done();
    });
    session.on('close', () => done());
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
  it('emits error when rate limit is exceeded', done => {
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

    let errorCount = 0;
    session.on('error', () => {
      errorCount++;
      if (errorCount >= 1) done();
    });
    session.on('message', () => {
      // Some messages will get through (first 2 within limit)
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
