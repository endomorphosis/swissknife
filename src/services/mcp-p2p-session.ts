/**
 * MCPp2pSession — encapsulates a single MCP+p2p session stream.
 *
 * Implements:
 *   - MCP++ Profile E §3.2  : session lifecycle (init handshake)
 *   - MCP++ Profile E §5.1  : u32 big-endian length-prefix framing
 *   - MCP++ Profile E §9.2  : JSON-RPC id correlation + concurrent in-flight requests
 *   - MCP++ Profile E §9.3  : per-peer rate-limiting (leaky-bucket)
 *   - MCP++ Profile E §9.4  : peer identity ≠ execution authority
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
/** Default maximum frame size: 4 MiB */
export const DEFAULT_MAX_FRAME_BYTES = 4 * 1024 * 1024;
/** Leaky-bucket: max messages per window */
export const RATE_LIMIT_MAX_MSGS = 200;
/** Leaky-bucket: window duration (ms) */
export const RATE_LIMIT_WINDOW_MS = 1000;

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
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
  /** MCP++ extension profiles advertised */
  mcpPlusPlusProfiles?: string[];
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
// LeakyBucket — simple per-peer rate limiter
// ---------------------------------------------------------------------------

class LeakyBucket {
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
  private rateLimiter: LeakyBucket;
  private inFlight: Map<
    string | number,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  > = new Map();
  private nextId = 1;
  private _handshakeResult: MCPHandshakeResult | null = null;
  private _closed = false;
  private _readBuf = Buffer.alloc(0);
  /** True once the inbound iterator has ended (half-close). */
  private _readEnded = false;

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
    this.rateLimiter = new LeakyBucket(
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
    const initRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          mcpPlusPlusProfiles: [
            'mcp++/cid-envelope',
            'mcp++/ucan',
            'mcp++/idl',
            'mcp++/event-dag',
          ],
        },
        clientInfo,
      },
    };

    const response = await this.sendRequest(initRequest);
    if (!response.result) {
      throw new Error(`Handshake failed: ${JSON.stringify(response.error)}`);
    }
    const r = response.result as {
      protocolVersion: string;
      serverInfo: { name: string; version: string };
      capabilities: MCPCapabilities;
    };
    this._handshakeResult = {
      protocolVersion: r.protocolVersion,
      serverInfo: r.serverInfo,
      capabilities: r.capabilities,
    };

    // Send the 'initialized' notification
    await this.sendNotification({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return this._handshakeResult;
  }

  get handshakeResult(): MCPHandshakeResult | null {
    return this._handshakeResult;
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
        reject(new Error(`Request timed out: ${req.method} (id=${req.id})`));
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
    this._closed = true;
    for (const { reject, timer } of this.inFlight.values()) {
      clearTimeout(timer);
      reject(new Error('Session closed'));
    }
    this.inFlight.clear();
    try {
      if (typeof this.stream.close === 'function') {
        await this.stream.close();
      }
    } catch {
      // best effort
    }
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
      throw new Error(
        `Outgoing frame too large: ${body.length} > ${this.maxFrameBytes}`,
      );
    }
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(body.length, 0);
    const frame = Buffer.concat([header, body]);
    await this.stream.write(frame);
  }

  // -------------------------------------------------------------------------
  // Read loop
  // -------------------------------------------------------------------------

  private async _readLoop(): Promise<void> {
    try {
      for await (const chunk of this.stream) {
        this._readBuf = Buffer.concat([this._readBuf, chunk]);
        // Drain all complete frames from the buffer
        while (this._readBuf.length >= 4) {
          const frameLen = this._readBuf.readUInt32BE(0);
          if (frameLen > this.maxFrameBytes) {
            // Frame size violation — abort stream per §9.1
            const err = new Error(
              `Incoming frame too large: ${frameLen} > ${this.maxFrameBytes}`,
            );
            this.emit('error', err);
            await this.close();
            return;
          }
          if (this._readBuf.length < 4 + frameLen) break; // incomplete

          const body = this._readBuf.slice(4, 4 + frameLen);
          this._readBuf = this._readBuf.slice(4 + frameLen);

          // Rate limit check (§9.3)
          if (!this.rateLimiter.allow()) {
            this.emit('error', new Error('Rate limit exceeded; dropping message'));
            continue;
          }

          let msg: JsonRpcMessage;
          try {
            msg = JSON.parse(body.toString('utf8')) as JsonRpcMessage;
          } catch {
            this.emit('error', new Error('Failed to parse JSON-RPC frame'));
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
            reject(new Error('Session read side ended without response'));
          }
          this.inFlight.clear();
          this._closed = true;
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
    if (this._closed) throw new Error('Session is closed');
  }
}
