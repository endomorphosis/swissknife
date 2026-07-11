/**
 * MCPp2pSession — encapsulates a single MCP+p2p session stream.
 *
 * Implements:
 *   - MCP++ Profile E §3.2  : session lifecycle (init handshake, capability negotiation)
 *   - MCP++ Profile E §5.1  : u32 big-endian length-prefix framing
 *   - MCP++ Profile E §9.1  : deterministic frame-error taxonomy + error codes
 *   - MCP++ Profile E §9.2  : JSON-RPC id correlation + concurrent in-flight requests
 *   - MCP++ Profile E §9.3  : per-peer rate-limiting (fixed window)
 *   - MCP++ Profile E §9.4  : peer identity ≠ execution authority
 *   - MCP++ Profile E §9.5  : explicit session state machine
 *   - MCP++ Profile E §9.6  : exponential backoff reconnection policy
 *
 * Transport substrate: libp2p streams (passed in as a Node.js Duplex-compatible
 * pair of {source, sink}).  The session does NOT create the underlying libp2p
 * node or stream — that responsibility belongs to Libp2pTransport in
 * mcp-transport.ts.
 */

import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MCP_P2P_PROTOCOL_ID = '/mcp+p2p/1.0.0';
/** Default maximum frame size: 16 MiB (MCP++ Profile E reference default). */
export const DEFAULT_MAX_FRAME_BYTES = 16 * 1024 * 1024;
/** Minimum allowed maximum frame size: 1 MiB. */
export const MIN_MAX_FRAME_BYTES = 1024 * 1024;
/** Fixed-window rate limiter: max messages per window */
export const RATE_LIMIT_MAX_MSGS = 200;
/** Fixed-window rate limiter: window duration (ms) */
export const RATE_LIMIT_WINDOW_MS = 1000;

// ---------------------------------------------------------------------------
// Session error codes (MCP++ Profile E §9.1 — deterministic error taxonomy)
// ---------------------------------------------------------------------------

/**
 * Deterministic error codes for transport-layer failures.
 *
 * Code ranges:
 *   1xxx: Framing errors
 *   2xxx: Protocol errors
 *   3xxx: Rate / policy violations
 *   4xxx: Session lifecycle errors
 */
export const SessionErrorCode = {
  /** Inbound frame length exceeds negotiated maxFrameBytes. */
  FRAME_OVERSIZE: 1001,
  /** Outbound frame length exceeds negotiated maxFrameBytes. */
  FRAME_OUTBOUND_OVERSIZE: 1002,
  /** Frame body is not valid UTF-8 JSON. */
  FRAME_MALFORMED_JSON: 1003,
  /** Frame header is malformed (truncated length prefix). */
  FRAME_TRUNCATED_HEADER: 1004,

  /** Peer sent an unrecognized protocol version during handshake. */
  PROTOCOL_VERSION_MISMATCH: 2001,
  /** Handshake response was missing required fields. */
  PROTOCOL_HANDSHAKE_INVALID: 2002,
  /** Server advertised no compatible MCP++ profiles. */
  PROTOCOL_NO_COMMON_PROFILE: 2003,

  /** Inbound message rate exceeded the per-peer limit. */
  RATE_LIMIT_EXCEEDED: 3001,

  /** Attempt to send on a closed session. */
  SESSION_CLOSED: 4001,
  /** In-flight request rejected because the read side ended. */
  SESSION_READ_ENDED: 4002,
  /** Request timed out waiting for a response. */
  SESSION_TIMEOUT: 4003,
} as const;

export type SessionErrorCode = typeof SessionErrorCode[keyof typeof SessionErrorCode];

/** A typed transport error carrying a deterministic error code. */
export class SessionError extends Error {
  constructor(
    public readonly code: SessionErrorCode,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

// ---------------------------------------------------------------------------
// Session state machine (MCP++ Profile E §9.5)
// ---------------------------------------------------------------------------

/**
 * Explicit lifecycle states for an {@link MCPp2pSession}.
 *
 * Transitions:
 *   idle  → handshaking  (handshake() called)
 *   handshaking → open   (initialize exchange complete)
 *   handshaking → error  (handshake failed)
 *   open  → closing      (close() called)
 *   open  → error        (unrecoverable frame/protocol error)
 *   closing → closed     (stream fully drained)
 *   error → closed       (after emitting 'error')
 */
export type SessionState =
  | 'idle'
  | 'handshaking'
  | 'open'
  | 'closing'
  | 'closed'
  | 'error';

// ---------------------------------------------------------------------------
// Reconnect backoff policy (MCP++ Profile E §9.6)
// ---------------------------------------------------------------------------

export interface ReconnectPolicy {
  /** Initial delay before the first reconnect attempt (ms). Default 500. */
  initialDelayMs: number;
  /** Multiplier applied to the delay after each failed attempt. Default 2. */
  backoffFactor: number;
  /** Maximum delay cap (ms). Default 30_000. */
  maxDelayMs: number;
  /** Maximum number of attempts (0 = unlimited). Default 0. */
  maxAttempts: number;
  /** Optional jitter fraction (0–1) added to each delay. Default 0.1. */
  jitter: number;
}

const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  initialDelayMs: 500,
  backoffFactor: 2,
  maxDelayMs: 30_000,
  maxAttempts: 0,
  jitter: 0.1,
};

/**
 * Compute the next backoff delay for attempt `n` (0-based).
 * Exported for deterministic unit testing.
 */
export function computeBackoffDelay(policy: Partial<ReconnectPolicy>, attempt: number): number {
  const p = { ...DEFAULT_RECONNECT_POLICY, ...policy };
  const raw = Math.min(p.initialDelayMs * Math.pow(p.backoffFactor, attempt), p.maxDelayMs);
  const jitter = raw * p.jitter * Math.random();
  return Math.round(raw + jitter);
}

// ---------------------------------------------------------------------------
// Capability negotiation helpers (MCP++ Profile E §3.2)
// ---------------------------------------------------------------------------

/** Profiles advertised by this client. */
export const MCP_PLUS_PLUS_PROFILES = [
  'mcp++/cid-envelope',
  'mcp++/ucan',
  'mcp++/idl',
  'mcp++/event-dag',
  'mcp++/policy-d',
  'mcp++/pubsub-bus',
  'mcp++/p2p-transport',
] as const;

export type MCPPlusPlusProfile = typeof MCP_PLUS_PLUS_PROFILES[number];

/** Draft Profile capability keys used in canonical MCP InitializeResult values. */
export const MCP_PLUS_PLUS_EXPERIMENTAL_CAPABILITIES: Record<MCPPlusPlusProfile, string> = {
  'mcp++/cid-envelope': 'mcp++/cid-envelope',
  'mcp++/ucan': 'mcp++/ucan',
  'mcp++/idl': 'mcp++/mcp-idl',
  'mcp++/event-dag': 'mcp++/event-dag',
  'mcp++/policy-d': 'mcp++/deontic-policy',
  'mcp++/pubsub-bus': 'mcp++/pubsub-bus',
  'mcp++/p2p-transport': 'mcp++/p2p-transport',
};

function profilesFromExperimentalCapabilities(experimental: unknown): string[] {
  if (!experimental || typeof experimental !== 'object') return [];
  const advertised = experimental as Record<string, unknown>;
  return MCP_PLUS_PLUS_PROFILES.filter(profile =>
    advertised[MCP_PLUS_PLUS_EXPERIMENTAL_CAPABILITIES[profile]] === true,
  );
}

/**
 * Negotiate capabilities: intersect client profiles with server-advertised ones.
 * Returns the subset of profiles both sides support, plus a
 * `downgraded` flag if any client profile is not supported by the server.
 */
export function negotiateCapabilities(
  clientProfiles: readonly string[],
  serverProfiles: readonly string[],
): { negotiated: string[]; downgraded: boolean; unsupported: string[] } {
  const serverSet = new Set(serverProfiles);
  const negotiated = clientProfiles.filter(p => serverSet.has(p));
  const unsupported = clientProfiles.filter(p => !serverSet.has(p));
  return {
    negotiated,
    downgraded: unsupported.length > 0,
    unsupported,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A minimal stream abstraction compatible with libp2p streams. */
export interface P2PStream {
  /** Write bytes to the stream */
  write(chunk: Uint8Array): Promise<void> | void;
  /** Async iterator over incoming Uint8Array chunks */
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
  /** Close the outgoing half */
  close?(): Promise<void> | void;
  /** Abort / reset the stream */
  abort?(err?: Error): void;
}

export interface MCPCapabilities {
  tools?: boolean | Record<string, unknown>;
  resources?: boolean;
  prompts?: boolean;
  /** MCP++ extension profiles advertised */
  mcpPlusPlusProfiles?: string[];
  /** Canonical MCP extension negotiation surface used by the MCP++ draft. */
  experimental?: Record<string, unknown>;
}

export interface MCPHandshakeResult {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  capabilities: MCPCapabilities;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ---------------------------------------------------------------------------
// FixedWindowRateLimiter — per-peer rate limiter
// ---------------------------------------------------------------------------

/** Fixed-window rate limiter: allows up to `maxMsgs` per `windowMs`. */
class FixedWindowRateLimiter {
  private count = 0;
  private lastReset = Date.now();

  constructor(
    private readonly maxMsgs: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if this message is within the rate limit; false if rejected. */
  allow(): boolean {
    const now = Date.now();
    if (now - this.lastReset >= this.windowMs) {
      this.count = 0;
      this.lastReset = now;
    }
    if (this.count >= this.maxMsgs) return false;
    this.count++;
    return true;
  }
}

// ---------------------------------------------------------------------------
// MCPp2pSession
// ---------------------------------------------------------------------------

export class MCPp2pSession extends EventEmitter {
  private stream: P2PStream;
  private maxFrameBytes: number;
  private rateLimiter: FixedWindowRateLimiter;
  private inFlight: Map<
    string | number,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  > = new Map();
  private nextId = 1;
  /** Serialize framed writes while allowing concurrent requests to remain in flight. */
  private writeQueue: Promise<void> = Promise.resolve();
  private _handshakeResult: MCPHandshakeResult | null = null;
  private _closed = false;
  private _readBuf = Buffer.alloc(0);
  /** True once the inbound iterator has ended (half-close). */
  private _readEnded = false;
  /** Explicit session state (MCP++ Profile E §9.5). */
  private _state: SessionState = 'idle';

  constructor(
    stream: P2PStream,
    options: {
      maxFrameBytes?: number;
      rateLimitMaxMsgs?: number;
      rateLimitWindowMs?: number;
    } = {},
  ) {
    super();
    this.stream = stream;
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
    if (this.maxFrameBytes < MIN_MAX_FRAME_BYTES) {
      throw new Error(
        `maxFrameBytes must be >= ${MIN_MAX_FRAME_BYTES}, got ${this.maxFrameBytes}`,
      );
    }
    this.rateLimiter = new FixedWindowRateLimiter(
      options.rateLimitMaxMsgs ?? RATE_LIMIT_MAX_MSGS,
      options.rateLimitWindowMs ?? RATE_LIMIT_WINDOW_MS,
    );
    // Start the read loop in the background
    this._readLoop().catch(err => this.emit('error', err));
  }

  // -------------------------------------------------------------------------
  // Handshake (MCP++ Profile E §3.2)
  // -------------------------------------------------------------------------

  /**
   * Run the MCP initialization handshake as a client.
   * Must be called once, immediately after the stream is opened.
   */
  async handshake(clientInfo: { name: string; version: string }): Promise<MCPHandshakeResult> {
    this._setState('handshaking');
    const initRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          mcpPlusPlusProfiles: [...MCP_PLUS_PLUS_PROFILES],
          experimental: Object.fromEntries(
            MCP_PLUS_PLUS_PROFILES.map(profile => [MCP_PLUS_PLUS_EXPERIMENTAL_CAPABILITIES[profile], true]),
          ),
        },
        clientInfo,
      },
    };

    let response: JsonRpcResponse;
    try {
      response = await this.sendRequest(initRequest);
    } catch (err) {
      this._setState('error');
      throw err;
    }

    if (!response.result) {
      this._setState('error');
      throw new SessionError(
        SessionErrorCode.PROTOCOL_HANDSHAKE_INVALID,
        `Handshake failed: ${JSON.stringify(response.error)}`,
      );
    }
    const r = response.result as {
      protocolVersion: string;
      serverInfo: { name: string; version: string };
      capabilities: MCPCapabilities;
    };

    if (
      typeof r.protocolVersion !== 'string'
      || !r.serverInfo
      || typeof r.serverInfo.name !== 'string'
      || typeof r.serverInfo.version !== 'string'
      || !r.capabilities
      || typeof r.capabilities !== 'object'
    ) {
      this._setState('error');
      throw new SessionError(
        SessionErrorCode.PROTOCOL_HANDSHAKE_INVALID,
        'Handshake response is not a canonical MCP InitializeResult',
      );
    }

    // Capability negotiation — downgrade to the profiles both sides support.
    const serverProfiles = Array.from(new Set([
      ...(r.capabilities?.mcpPlusPlusProfiles ?? []),
      ...profilesFromExperimentalCapabilities(r.capabilities?.experimental),
    ]));
    const { negotiated, downgraded, unsupported } = negotiateCapabilities(
      MCP_PLUS_PLUS_PROFILES,
      serverProfiles,
    );
    const negotiatedCapabilities: MCPCapabilities = {
      ...r.capabilities,
      mcpPlusPlusProfiles: negotiated,
    };
    if (downgraded) {
      this.emit('capability-downgrade', { unsupported, negotiated });
    }

    this._handshakeResult = {
      protocolVersion: r.protocolVersion,
      serverInfo: r.serverInfo,
      capabilities: negotiatedCapabilities,
    };

    // Send the 'initialized' notification
    await this.sendNotification({ jsonrpc: '2.0', method: 'notifications/initialized' });
    this._setState('open');
    return this._handshakeResult;
  }

  get handshakeResult(): MCPHandshakeResult | null {
    return this._handshakeResult;
  }

  /** Current session state (MCP++ Profile E §9.5). */
  get sessionState(): SessionState {
    return this._state;
  }

  private _setState(state: SessionState): void {
    this._state = state;
    this.emit('state', state);
  }

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  /** Send a JSON-RPC request and wait for the matching response. */
  async sendRequest(
    req: JsonRpcRequest,
    timeoutMs = 30_000,
  ): Promise<JsonRpcResponse> {
    this.assertOpen();
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.inFlight.delete(req.id);
        reject(new SessionError(
          SessionErrorCode.SESSION_TIMEOUT,
          `Request timed out: ${req.method} (id=${req.id})`,
          { method: req.method, id: req.id },
        ));
      }, timeoutMs);
      this.inFlight.set(req.id, { resolve, reject, timer });
      this.writeFrame(req).catch(err => {
        clearTimeout(timer);
        this.inFlight.delete(req.id);
        reject(err);
      });
    });
  }

  /** Send a JSON-RPC notification (no response expected). */
  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    this.assertOpen();
    await this.writeFrame(notification);
  }

  /** Close the session gracefully. */
  async close(): Promise<void> {
    if (this._closed) return;
    this._setState('closing');
    this._closed = true;
    for (const { reject, timer } of this.inFlight.values()) {
      clearTimeout(timer);
      reject(new SessionError(SessionErrorCode.SESSION_CLOSED, 'Session closed'));
    }
    this.inFlight.clear();
    try {
      if (typeof this.stream.close === 'function') {
        await this.stream.close();
      }
    } catch {
      // best effort
    }
    this._setState('closed');
    this.emit('close');
  }

  // -------------------------------------------------------------------------
  // Framing (MCP++ Profile E §5.1)
  // 4-byte big-endian uint32 length + UTF-8 JSON bytes
  // -------------------------------------------------------------------------

  private async writeFrame(msg: JsonRpcMessage): Promise<void> {
    const json = JSON.stringify(msg);
    const body = Buffer.from(json, 'utf8');
    if (body.length > this.maxFrameBytes) {
      throw new SessionError(
        SessionErrorCode.FRAME_OUTBOUND_OVERSIZE,
        `Outgoing frame too large: ${body.length} > ${this.maxFrameBytes}`,
        { frameLen: body.length, maxFrameBytes: this.maxFrameBytes },
      );
    }
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(body.length, 0);
    const frame = Buffer.concat([
      header as unknown as Uint8Array,
      body as unknown as Uint8Array,
    ]);
    const write = this.writeQueue.then(async () => {
      await this.stream.write(frame as unknown as Uint8Array);
    });
    // A failed write must not poison the queue for a later close/error path.
    this.writeQueue = write.catch(() => undefined);
    await write;
  }

  // -------------------------------------------------------------------------
  // Read loop
  // -------------------------------------------------------------------------

  private async _readLoop(): Promise<void> {
    try {
      for await (const chunk of this.stream) {
        this._readBuf = Buffer.concat([
          this._readBuf as unknown as Uint8Array,
          Buffer.from(chunk) as unknown as Uint8Array,
        ]);
        // Drain all complete frames from the buffer
        while (this._readBuf.length >= 4) {
          const frameLen = this._readBuf.readUInt32BE(0);
          if (frameLen > this.maxFrameBytes) {
            // Frame size violation — abort stream per §9.1
            const err = new SessionError(
              SessionErrorCode.FRAME_OVERSIZE,
              `Incoming frame too large: ${frameLen} > ${this.maxFrameBytes}`,
              { frameLen, maxFrameBytes: this.maxFrameBytes },
            );
            this._setState('error');
            this.emit('error', err);
            await this.close();
            return;
          }
          if (this._readBuf.length < 4 + frameLen) break; // incomplete

          const body = this._readBuf.slice(4, 4 + frameLen);
          this._readBuf = this._readBuf.slice(4 + frameLen);

          // Rate limit check (§9.3)
          if (!this.rateLimiter.allow()) {
            this.emit('error', new SessionError(
              SessionErrorCode.RATE_LIMIT_EXCEEDED,
              'Rate limit exceeded; dropping message',
            ));
            continue;
          }

          let msg: JsonRpcMessage;
          try {
            msg = JSON.parse(body.toString('utf8')) as JsonRpcMessage;
          } catch {
            this.emit('error', new SessionError(
              SessionErrorCode.FRAME_MALFORMED_JSON,
              'Failed to parse JSON-RPC frame',
            ));
            continue;
          }
          this._dispatch(msg);
        }
      }
    } finally {
      // The read side has ended (half-close).  Reject any remaining in-flight
      // requests that will never receive a response.  We use setImmediate so
      // that any promises resolved by _dispatch() (e.g. the handshake response)
      // have a chance to run their continuations before we mark the session closed.
      this._readEnded = true;
      setImmediate(() => {
        if (!this._closed) {
          for (const { reject, timer } of this.inFlight.values()) {
            clearTimeout(timer);
            reject(new SessionError(
              SessionErrorCode.SESSION_READ_ENDED,
              'Session read side ended without response',
            ));
          }
          this.inFlight.clear();
          this._closed = true;
          this._setState('closed');
          this.emit('close');
        }
      });
    }
  }

  private _dispatch(msg: JsonRpcMessage): void {
    // Is it a response? (has 'result' or 'error' + 'id')
    if ('result' in msg || ('error' in msg && 'id' in msg)) {
      const res = msg as JsonRpcResponse;
      const pending = this.inFlight.get(res.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.inFlight.delete(res.id);
        pending.resolve(res);
      }
      return;
    }
    // Notification or request
    this.emit('message', msg);
  }

  private assertOpen(): void {
    if (this._closed) throw new SessionError(SessionErrorCode.SESSION_CLOSED, 'Session is closed');
  }
}
