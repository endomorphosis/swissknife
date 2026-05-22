/**
 * Implements multi-protocol transport support for the Model Context Protocol (MCP).
 * Includes a factory for creating different transport instances (WebSocket, libp2p, WebRTC, HTTPS).
 */

// Proper imports with explicit types
import { EventEmitter } from 'events'; // Corrected import path

/** Defines the supported MCP transport protocol types. */
export type MCPTransportType = 'websocket' | 'libp2p' | 'webrtc' | 'https';

/** Options for configuring an MCP transport connection. */
export interface MCPTransportOptions {
  type: MCPTransportType;
  endpoint: string; // URL or multiaddr for the server/peer
  credentials?: Record<string, unknown>; // Authentication credentials (e.g., API key, UCAN token)
  timeout?: number; // Connection/request timeout in ms
  reconnect?: boolean; // Attempt automatic reconnection on disconnect
  encryption?: boolean; // Enable/disable transport-level encryption (if applicable)
  // Protocol-specific options
  libp2pOptions?: Record<string, unknown>; // Options for libp2p transport
  webRTCOptions?: Record<string, unknown>; // Options for WebRTC transport (e.g., signaling server)
}

/**
 * Interface defining the contract for all MCP transport implementations.
 */
export interface MCPTransport {
  /** Establishes a connection to the endpoint. */
  connect(): Promise<boolean>;
  /** Closes the connection. */
  disconnect(): Promise<void>;
  /** Sends an MCP message over the transport. */
  send(message: unknown): Promise<void>;
  /**
   * Receives the next MCP message from the transport.
   * Should handle message framing/parsing.
   * May return null or throw on disconnect/timeout.
   */
  receive(): Promise<unknown>;
  /** Returns true if the transport is currently connected. */
  isConnected(): boolean;
  /** Returns the approximate latency in ms (optional). */
  getLatency?(): number;
  /** Returns the type of the transport. */
  getType(): MCPTransportType;

  // Event handling for asynchronous messages or status changes
  on(event: 'message', listener: (message: unknown) => void): void;
  on(event: 'disconnect', listener: () => void): void;
  off(event: 'message' | 'disconnect', listener: (...args: unknown[]) => void): void;
}

// --- Transport Implementations ---

abstract class BaseTransport implements MCPTransport {
  protected options: MCPTransportOptions;
  protected connected: boolean = false;
  // Basic event emitter functionality
  private eventEmitter = new EventEmitter();

  constructor(options: MCPTransportOptions) {
    this.options = options;
  }

  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract send(message: unknown): Promise<void>;
  abstract receive(): Promise<unknown>; // May not be used if event-driven

  isConnected(): boolean {
    return this.connected;
  }

  getType(): MCPTransportType {
    return this.options.type;
  }

  on(event: 'message' | 'disconnect', listener: (...args: unknown[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  off(event: 'message' | 'disconnect', listener: (...args: unknown[]) => void): void {
    this.eventEmitter.off(event, listener);
  }

  protected emit(event: 'message' | 'disconnect', ...args: unknown[]): void {
    this.eventEmitter.emit(event, ...args);
  }
}

// Minimal interface for the Node.js `ws` WebSocket client.
// Using a structural type instead of importing the full `ws` types
// so the module loads even when `ws` is not installed (e.g., in browser builds).
interface NodeWebSocket {
  readyState: number;
  send(data: string, cb?: (err?: Error) => void): void;
  close(code?: number, reason?: string): void;
  on(event: 'open', listener: () => void): this;
  on(event: 'message', listener: (data: unknown) => void): this;
  on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
}

class WebSocketTransport extends BaseTransport {
  private ws: NodeWebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectBaseDelayMs = 1000;

  constructor(options: MCPTransportOptions) {
    super(options);
  }

  async connect(): Promise<boolean> {
    return new Promise<boolean>(async (resolve) => {
      let resolved = false;
      const settle = (val: boolean) => {
        if (!resolved) {
          resolved = true;
          resolve(val);
        }
      };

      try {
        let WS: new (url: string, options?: unknown) => NodeWebSocket;

        // Use native browser WebSocket if available, otherwise fall back to `ws`.
        if (typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).WebSocket === 'function') {
          WS = (globalThis as Record<string, unknown>).WebSocket as typeof WS;
        } else {
          // Dynamic import keeps the module load-safe in environments without `ws`.
          const mod = await import('ws');
          WS = (mod.WebSocket ?? mod.default) as unknown as typeof WS;
        }

        const headers = this.buildHeaders();
        this.ws = new WS(this.options.endpoint, headers ? { headers } : undefined);

        const timeoutMs = this.options.timeout ?? 10_000;
        const timer = setTimeout(() => {
          this.ws?.close();
          settle(false);
        }, timeoutMs);

        this.ws.on('open', () => {
          clearTimeout(timer);
          this.connected = true;
          this.reconnectAttempts = 0;
          settle(true);
        });

        this.ws.on('message', (raw) => {
          try {
            const text = typeof raw === 'string' ? raw : String(raw);
            const msg = JSON.parse(text);
            this.emit('message', msg);
          } catch {
            this.emit('message', raw);
          }
        });

        this.ws.on('close', () => {
          clearTimeout(timer);
          if (!this.connected) {
            // Connection was never established — resolve as failed
            settle(false);
            return;
          }
          this.connected = false;
          this.emit('disconnect');
          if (this.options.reconnect) {
            this.scheduleReconnect().catch(() => undefined);
          }
        });

        this.ws.on('error', (err: Error) => {
          // 'close' will fire after 'error' and handle the settle(false) path.
          console.error('[WebSocketTransport] error:', err.message);
        });
      } catch (err) {
        console.error('[WebSocketTransport] connect() failed:', err);
        settle(false);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.ws?.close(1000, 'client disconnect');
    this.ws = null;
    this.emit('disconnect');
  }

  async send(message: unknown): Promise<void> {
    if (!this.isConnected() || !this.ws) {
      throw new Error('WebSocket not connected.');
    }
    return new Promise<void>((resolve, reject) => {
      this.ws!.send(JSON.stringify(message), (err?: Error) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  async receive(): Promise<unknown> {
    // Event-driven; callers should listen for the 'message' event.
    throw new Error('WebSocket receive() is event-driven; listen for the "message" event.');
  }

  /** Returns the approximate round-trip latency by measuring a ping/pong. */
  getLatency(): number {
    // Not trivially measurable without a ping frame; return -1 as sentinel.
    return -1;
  }

  private buildHeaders(): Record<string, string> | undefined {
    const creds = this.options.credentials;
    if (!creds) return undefined;
    const headers: Record<string, string> = {};
    if (typeof creds.token === 'string') {
      headers['Authorization'] = `Bearer ${creds.token}`;
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocketTransport] Max reconnect attempts reached.');
      return;
    }
    const delay = this.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    await new Promise(r => setTimeout(r, delay));
    await this.connect();
  }
}

class Libp2pTransport extends BaseTransport {
  private session: import('./mcp-p2p-session.js').MCPp2pSession | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectBaseDelayMs = 1000;

  constructor(options: MCPTransportOptions) {
    super(options);
  }

  async connect(): Promise<boolean> {
    try {
      // Dynamically import libp2p to allow graceful degradation when
      // optional transport sub-packages are not installed.
      // @ts-ignore optional runtime dependency
      const { createLibp2p } = await import('libp2p');
      const { MCP_P2P_PROTOCOL_ID, MCPp2pSession } = await import(
        './mcp-p2p-session.js'
      );

      const libp2pOptions: Record<string, unknown> = {
        ...(this.options.libp2pOptions ?? {}),
      };

      // Try to load noise + yamux if available (graceful degradation)
      try {
        // @ts-ignore optional runtime dependency
        const { noise } = await import('@chainsafe/libp2p-noise');
        // @ts-ignore optional runtime dependency
        const { yamux } = await import('@chainsafe/libp2p-yamux');
        libp2pOptions.connectionEncrypters = [noise()];
        libp2pOptions.streamMuxers = [yamux()];
      } catch {
        // Transport sub-packages not installed; proceed without encryption layer
        // (only acceptable for local dev / testing).
      }

      const node = await createLibp2p(libp2pOptions as Parameters<typeof createLibp2p>[0]);
      await node.start();

      const endpoint = this.options.endpoint;
      const stream = await node.dialProtocol(endpoint, MCP_P2P_PROTOCOL_ID) as unknown as import('./mcp-p2p-session.js').P2PStream;

      this.session = new MCPp2pSession(stream, {
        maxFrameBytes:
          typeof this.options.libp2pOptions?.maxFrameBytes === 'number'
            ? this.options.libp2pOptions.maxFrameBytes
            : undefined,
      });

      await this.session.handshake({
        name: 'swissknife',
        version: '0.0.53',
      });

      // Forward session messages to this transport's 'message' event
      this.session.on('message', (msg: unknown) => this.emit('message', msg));
      this.session.on('close', () => {
        this.connected = false;
        this.emit('disconnect');
        if (this.options.reconnect) {
          this.scheduleReconnect().catch(() => undefined);
        }
      });
      this.session.on('error', (err: Error) => {
        console.error('[Libp2pTransport] Session error:', err.message);
      });

      this.connected = true;
      this.reconnectAttempts = 0;
      return true;
    } catch (err) {
      console.error('[Libp2pTransport] connect() failed:', err);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
    this.emit('disconnect');
  }

  async send(message: unknown): Promise<void> {
    if (!this.isConnected() || !this.session) {
      throw new Error('libp2p not connected.');
    }
    await this.session.sendNotification(
      message as import('./mcp-p2p-session.js').JsonRpcNotification,
    );
  }

  async receive(): Promise<unknown> {
    throw new Error(
      'libp2p receive() not used; listen for "message" event on the transport.',
    );
  }

  /** Expose the underlying session for higher-level callers (e.g. envelope layer). */
  getSession(): import('./mcp-p2p-session.js').MCPp2pSession | null {
    return this.session;
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Libp2pTransport] Max reconnect attempts reached.');
      return;
    }
    const delay =
      this.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    await new Promise(resolve => setTimeout(resolve, delay));
    await this.connect();
  }
}

/**
 * WebRTC Data-Channel transport for MCP++ Profile E (P2P browser transport).
 *
 * Architecture
 * ───────────
 *  1. Connects to the signaling server at `options.endpoint` via WebSocket.
 *  2. Negotiates an RTCPeerConnection with a remote peer by exchanging
 *     JSON-encoded SDP offer/answer and ICE candidates over the signaling
 *     channel.
 *  3. Opens an ordered, reliable RTCDataChannel ("mcp") for MCP messages.
 *
 * Node.js: RTCPeerConnection is not a native API.  If `globalThis.RTCPeerConnection`
 * is absent the constructor will throw a clear error; callers should prefer the
 * libp2p transport when running in Node.
 */
class WebRTCTransport extends BaseTransport {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pc: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dataChannel: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private signalingWs: any | null = null;

  constructor(options: MCPTransportOptions) {
    super(options);
  }

  async connect(): Promise<boolean> {
    // RTCPeerConnection is a browser-only global.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const RTC: (new (cfg?: unknown) => any) | undefined =
      typeof globalThis !== 'undefined'
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (globalThis as Record<string, any>).RTCPeerConnection
        : undefined;

    if (typeof RTC !== 'function') {
      throw new Error(
        '[WebRTCTransport] RTCPeerConnection is not available in this environment. ' +
          'WebRTC is a browser-only API; use the libp2p transport in Node.js.',
      );
    }

    return new Promise<boolean>(async (resolve) => {
      try {
        // 1. Open signaling WebSocket
        let WS: new (url: string) => unknown;
        if (typeof (globalThis as Record<string, unknown>).WebSocket === 'function') {
          WS = (globalThis as Record<string, unknown>).WebSocket as typeof WS;
        } else {
          const mod = await import('ws');
          WS = (mod.WebSocket ?? mod.default) as unknown as typeof WS;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sigWs: any = new WS(this.options.endpoint);
        this.signalingWs = sigWs;

        const sendSignal = (msg: unknown) =>
          sigWs.send(JSON.stringify(msg));

        const iceServers = Array.isArray(this.options.webRTCOptions?.iceServers)
          ? this.options.webRTCOptions!.iceServers
          : [{ urls: 'stun:stun.l.google.com:19302' }];

        // 2. Create peer connection
        this.pc = new RTC({ iceServers });
        const pc = this.pc;

        // 3. Create data channel (initiator role)
        this.dataChannel = pc.createDataChannel('mcp', {
          ordered: true,
          protocol: 'mcp++/1.0',
        });
        const dc = this.dataChannel;

        dc.onopen = () => {
          this.connected = true;
          resolve(true);
        };
        dc.onclose = () => {
          this.connected = false;
          this.emit('disconnect');
          if (this.options.reconnect) {
            this.connect().catch(() => undefined);
          }
        };
        dc.onmessage = (evt: { data: string }) => {
          try {
            this.emit('message', JSON.parse(evt.data));
          } catch {
            this.emit('message', evt.data);
          }
        };

        // 4. Gather ICE candidates and send to signaling server
        pc.onicecandidate = (evt: { candidate: unknown }) => {
          if (evt.candidate) {
            sendSignal({ type: 'ice-candidate', candidate: evt.candidate });
          }
        };

        // 5. Create and send SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', sdp: offer });

        // 6. Handle signaling messages (answer + remote ICE candidates)
        sigWs.onmessage = async (evt: { data: string }) => {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'answer') {
            await pc.setRemoteDescription(msg.sdp);
          } else if (msg.type === 'ice-candidate' && msg.candidate) {
            await pc.addIceCandidate(msg.candidate);
          }
        };

        sigWs.onerror = () => {
          this.connected = false;
          resolve(false);
        };

        // Connection timeout
        const timeout = this.options.timeout ?? 30_000;
        setTimeout(() => {
          if (!this.connected) {
            this.connected = false;
            sigWs.close();
            resolve(false);
          }
        }, timeout);
      } catch (err) {
        console.error('[WebRTCTransport] connect() error:', err);
        resolve(false);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.dataChannel?.close();
    this.pc?.close();
    this.signalingWs?.close();
    this.dataChannel = null;
    this.pc = null;
    this.signalingWs = null;
    this.emit('disconnect');
  }

  async send(message: unknown): Promise<void> {
    if (!this.isConnected() || !this.dataChannel) {
      throw new Error('WebRTC data channel not open.');
    }
    this.dataChannel.send(JSON.stringify(message));
  }

  async receive(): Promise<unknown> {
    // Event-driven; callers should listen for the 'message' event.
    throw new Error(
      'WebRTC receive() is event-driven; listen for the "message" event.',
    );
  }
}

class HttpsTransport extends BaseTransport {
  constructor(options: MCPTransportOptions) {
    super(options);
  }

  async connect(): Promise<boolean> {
    // HTTPS is connectionless per request; mark as ready to send requests.
    // Optionally do a HEAD/OPTIONS probe to verify the endpoint is reachable.
    try {
      // @ts-ignore optional runtime dependency
      const { default: fetch } = await import('node-fetch');
      const controller = new AbortController();
      const timeout = this.options.timeout ?? 10_000;
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const resp = await fetch(this.options.endpoint, {
          method: 'OPTIONS',
          headers: this.buildHeaders(),
          signal: controller.signal as Parameters<typeof fetch>[1] extends { signal?: infer S } ? S : never,
        });
        this.connected = resp.ok || resp.status === 405; // 405 = method not allowed — server reachable
      } catch {
        // Treat any error (including 4xx/5xx) as reachable — the POST will fail with proper error
        this.connected = true;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // node-fetch not available or network error — still mark ready
      this.connected = true;
    }
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('disconnect');
  }

  async send(message: unknown): Promise<void> {
    if (!this.isConnected()) throw new Error('HTTPS transport not ready.');
    // Fire-and-forget POST — responses arrive via server push (SSE/long-poll),
    // not via the return value. For request-response, use request() instead.
    await this.doPost(message);
  }

  async receive(): Promise<unknown> {
    // Standard HTTPS POST is request-response; use request() for that.
    // SSE/long-polling requires a dedicated streaming call.
    throw new Error(
      'HTTPS receive() is not supported for one-shot POST; use request() for request-response.',
    );
  }

  /**
   * Send `message` as a JSON POST and return the parsed JSON response body.
   */
  async request(message: unknown): Promise<unknown> {
    if (!this.isConnected()) throw new Error('HTTPS transport not ready.');
    return this.doPost(message);
  }

  private async doPost(message: unknown): Promise<unknown> {
    // @ts-ignore optional runtime dependency
    const { default: fetch } = await import('node-fetch');
    const controller = new AbortController();
    const timeout = this.options.timeout ?? 30_000;
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(this.options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.buildHeaders(),
        },
        body: JSON.stringify(message),
        signal: controller.signal as Parameters<typeof fetch>[1] extends { signal?: infer S } ? S : never,
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`HTTPS ${resp.status} ${resp.statusText}${body ? ': ' + body : ''}`);
      }

      const contentType = resp.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return resp.json();
      }
      return resp.text();
    } finally {
      clearTimeout(timer);
    }
  }

  private buildHeaders(): Record<string, string> {
    const creds = this.options.credentials;
    const headers: Record<string, string> = {};
    if (creds) {
      if (typeof creds.token === 'string') {
        headers['Authorization'] = `Bearer ${creds.token}`;
      } else if (typeof creds.apiKey === 'string') {
        headers['X-API-Key'] = creds.apiKey;
      }
    }
    return headers;
  }
}

/**
 * Factory class for creating MCPTransport instances based on configuration options.
 */
export class MCPTransportFactory {
  /**
   * Creates an MCPTransport instance.
   * @param {MCPTransportOptions} options - Configuration for the transport.
   * @returns {MCPTransport} The created transport instance.
   * @throws {Error} If the transport type is unsupported.
   */
  static create(options: MCPTransportOptions): MCPTransport {
    console.log(`Creating MCP transport of type: ${options.type}`);
    switch (options.type) {
      case 'websocket':
        return new WebSocketTransport(options);
      case 'libp2p':
        return new Libp2pTransport(options);
      case 'webrtc':
        return new WebRTCTransport(options);
      case 'https':
        return new HttpsTransport(options);
      default:
        // Ensure exhaustive check (though TypeScript should handle this)
        const exhaustiveCheck: never = options.type;
        throw new Error(`Unsupported MCP transport type: ${exhaustiveCheck}`);
    }
  }
}

/**
 * MCP Client using the transport abstraction.
 */
export class MCPClient {
  private transport: MCPTransport;
  private responseHandlers: Map<string, (response: unknown) => void> = new Map();
  private messageCounter = 0;

  constructor(options: MCPTransportOptions) {
    this.transport = MCPTransportFactory.create(options);
    this.setupTransportListeners();
  }

  private setupTransportListeners(): void {
    this.transport.on('message', (message) => {
      console.log('MCPClient received message:', message);
      
      // Handle message correlation (assuming messages have correlationId)
      if (typeof message === 'object' && message !== null && 'correlationId' in message) {
        const correlationId = String(message.correlationId);
        if (correlationId && this.responseHandlers.has(correlationId)) {
          const handler = this.responseHandlers.get(correlationId)!;
          this.responseHandlers.delete(correlationId);
          handler(message);
        } else {
          // Handle uncorrelated messages
          console.warn('Received uncorrelated MCP message:', message);
        }
      }
    });
    
    this.transport.on('disconnect', () => {
      console.log('MCPClient transport disconnected.');
      // Handle reconnection logic if configured
    });
  }

  /** Connects the underlying transport. */
  async connect(): Promise<boolean> {
    console.log('MCPClient connecting transport...');
    return this.transport.connect();
  }

  /** Disconnects the underlying transport. */
  async disconnect(): Promise<void> {
    console.log('MCPClient disconnecting transport...');
    await this.transport.disconnect();
  }

  /**
   * Sends a request and returns a promise that resolves with the response.
   * @param {unknown} requestPayload - The payload for the MCP request.
   * @param {number} [timeoutMs=30000] - Timeout for waiting for a response.
   * @returns {Promise<unknown>} The response payload.
   */
  async sendRequest(requestPayload: unknown, timeoutMs: number = 30000): Promise<unknown> {
    if (!this.transport.isConnected()) {
      throw new Error('MCP transport not connected.');
    }

    const correlationId = `req-${this.messageCounter++}`;
    const request = {
      ...((typeof requestPayload === 'object' && requestPayload !== null) ? requestPayload : {}),
      correlationId,
      timestamp: Date.now(),
    };

    return new Promise(async (resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.responseHandlers.delete(correlationId);
        reject(new Error(`MCP request timed out after ${timeoutMs}ms for ID ${correlationId}`));
      }, timeoutMs);

      this.responseHandlers.set(correlationId, (response) => {
        clearTimeout(timeoutHandle);
        
        // Check for error responses
        if (typeof response === 'object' && 
            response !== null && 
            'isError' in response && 
            response.isError) {
          const errorMessage = 
            typeof response === 'object' && 
            response !== null && 
            'error' in response && 
            typeof response.error === 'object' && 
            response.error !== null && 
            'message' in response.error
              ? String(response.error.message)
              : 'Unknown error';
          
          reject(new Error(`MCP server error: ${errorMessage}`));
        } else {
          resolve(response);
        }
      });

      try {
        // Use specific request method for HTTPS
        if (this.transport.getType() === 'https' && 
            this.transport instanceof HttpsTransport) {
          const response = await (this.transport as HttpsTransport).request(request);
          
          // Handle response directly
          const handler = this.responseHandlers.get(correlationId);
          if (handler) {
            this.responseHandlers.delete(correlationId);
            clearTimeout(timeoutHandle);
            
            if (typeof response === 'object' && 
                response !== null && 
                'isError' in response && 
                response.isError) {
              reject(new Error(`MCP server error: ${
                typeof response === 'object' && 
                response !== null && 
                'error' in response && 
                response.error ? 
                  String(response.error) : 'Unknown error'
              }`));
            } else {
              resolve(response);
            }
          } else {
            // Should not happen if timeout didn't fire
            console.warn(`Handler for ${correlationId} missing after HTTPS request.`);
          }
        } else {
          // For other transports, send and wait for handler via 'message' event
          await this.transport.send(request);
        }
      } catch (error) {
        clearTimeout(timeoutHandle);
        this.responseHandlers.delete(correlationId);
        reject(error);
      }
    });
  }

  // Example specific method using sendRequest
  async generateCompletion(prompt: string, options: Record<string, unknown> = {}): Promise<string> {
    const requestPayload = {
      type: 'completion', // Example MCP message type
      prompt,
      options
    };
    const response = await this.sendRequest(requestPayload);
    
    // Type guard for the response
    if (typeof response === 'object' && 
        response !== null && 
        'completion' in response && 
        typeof response.completion === 'string') {
      return response.completion;
    }
    
    throw new Error('Invalid completion response format');
  }

  // Add methods for other MCP interactions (list_tools, call_tool, etc.)
}
