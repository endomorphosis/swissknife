/**
 * P2P Discovery & Default Pub/Sub (MCP++ Phase 7)
 *
 * Provides:
 *  - `MCPDiscovery`  — browser-ready peer discovery (WebRTC/WebSocket relays,
 *                      optional mDNS-local, DHT, rendezvous)
 *  - `MCPPubSub`     — default-on GossipSub dissemination of interface_cids,
 *                      receipt_cids and coordination signals
 *
 * Per MCP++ §9.5: pub/sub MUST NOT be required for point-to-point session
 * correctness, but browser libp2p peers enable it by default for discovery
 * announcements and coordination.
 *
 * References: docs/spec/transport-mcp-p2p.md §6, §9.5
 */

import { utf8Bytes } from '../shared/browser-crypto.js';
import { BrowserEventEmitter } from '../shared/browser-event-emitter.js';
import { createMcpLibp2pNode } from './libp2p-browser-runtime.js';
import { computeCID } from './mcp-envelope.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeerInfo {
  peerId: string;
  multiaddrs: string[];
  /** Known MCP++ profiles advertised by this peer */
  profiles?: string[];
  /** Unix ms when we first saw this peer */
  discoveredAt: number;
}

export interface PubSubMessage {
  topic: string;
  payload: unknown;
  /** UCAN token authorising this broadcast (optional) */
  ucanToken?: string;
  /** Content identifier of the payload */
  cid: string;
}

export interface DiscoveryOptions {
  /** Enable mDNS discovery. Default is runtime-dependent: false in browsers, true in Node. */
  mdns?: boolean;
  /** Enable Kademlia DHT peer routing. Default is runtime-dependent: false in browsers, true in Node. */
  dht?: boolean;
  /** Enable browser-compatible WebRTC transport (default true) */
  webRTC?: boolean;
  /** Enable browser-compatible WebSocket transport (default true) */
  webSockets?: boolean;
  /** Bootstrap relay/peer multiaddrs for browser discovery */
  bootstrapMultiaddrs?: string[];
  /** libp2p listen multiaddrs; browser default is `/webrtc` */
  listenMultiaddrs?: string[];
  /** Custom rendezvous/relay multiaddr for NAT traversal (optional) */
  rendezvousAddr?: string;
  /** Additional libp2p config merged before defaults are applied */
  libp2pOptions?: Record<string, unknown>;
}

export interface PubSubOptions {
  /** Enable pub/sub at all (default true) */
  enabled?: boolean;
  /** Topics to subscribe to */
  topics?: string[];
  /** Bootstrap relay/peer multiaddrs for browser libp2p */
  bootstrapMultiaddrs?: string[];
  /** Additional libp2p config merged before defaults are applied */
  libp2pOptions?: Record<string, unknown>;
}

export interface PubSubUCANValidator {
  validateToken(token: string): boolean | Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Well-known pub/sub topics
// ---------------------------------------------------------------------------

export const TOPIC_INTERFACE_ANNOUNCE = 'mcp++/interface-announce';
export const TOPIC_RECEIPT_ANNOUNCE   = 'mcp++/receipt-announce';
export const TOPIC_COORD_SIGNAL       = 'mcp++/coord-signal';

// ---------------------------------------------------------------------------
// MCPDiscovery
// ---------------------------------------------------------------------------

export class MCPDiscovery extends BrowserEventEmitter {
  private peers: Map<string, PeerInfo> = new Map();
  private options: DiscoveryOptions;
  private node: unknown = null; // libp2p node once started
  private started = false;

  constructor(options: DiscoveryOptions = {}) {
    super();
    this.options = {
      mdns: options.mdns,
      dht: options.dht,
      webRTC: options.webRTC ?? true,
      webSockets: options.webSockets ?? true,
      bootstrapMultiaddrs: options.bootstrapMultiaddrs ?? [],
      listenMultiaddrs: options.listenMultiaddrs,
      rendezvousAddr: options.rendezvousAddr,
      libp2pOptions: options.libp2pOptions,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start peer discovery.
   *
   * Dynamically imports libp2p and optional discovery sub-packages, falling
   * back gracefully when they are not installed.
   */
  async start(): Promise<void> {
    if (this.started) return;

    try {
      const bootstrapMultiaddrs = [
        ...(this.options.bootstrapMultiaddrs ?? []),
        ...(this.options.rendezvousAddr ? [this.options.rendezvousAddr] : []),
      ];
      const node = await createMcpLibp2pNode({
        overrides: this.options.libp2pOptions,
        bootstrapMultiaddrs,
        listenMultiaddrs: this.options.listenMultiaddrs,
        webRTC: this.options.webRTC,
        webSockets: this.options.webSockets,
        mdns: this.options.mdns,
        dht: this.options.dht,
        pubsub: true,
      });

      addLibp2pEventListener(node, 'peer:discovery', (event: unknown) => {
        const info = extractPeerDiscoveryInfo(event);
        if (info) this.handlePeerDiscovery(info);
      });

      await (node as { start(): Promise<void> }).start();
      this.node = node;
      this.started = true;
    } catch (err) {
      console.error('[MCPDiscovery] Failed to start:', err);
    }
  }

  async stop(): Promise<void> {
    if (!this.started || !this.node) return;
    try {
      await (this.node as { stop(): Promise<void> }).stop();
    } catch {
      // best effort
    }
    this.started = false;
    this.node = null;
  }

  // -------------------------------------------------------------------------
  // Peer management
  // -------------------------------------------------------------------------

  private handlePeerDiscovery(info: PeerInfo): void {
    const existing = this.peers.get(info.peerId);
    if (!existing) {
      this.peers.set(info.peerId, info);
      this.emit('peer:discovered', info);
    } else {
      // Merge multiaddrs
      const merged = Array.from(
        new Set([...existing.multiaddrs, ...info.multiaddrs]),
      );
      existing.multiaddrs = merged;
      this.emit('peer:updated', existing);
    }
  }

  /** Register a peer manually (e.g. from a static bootstrap list). */
  addStaticPeer(info: PeerInfo): void {
    this.handlePeerDiscovery(info);
  }

  getKnownPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  getPeer(peerId: string): PeerInfo | null {
    return this.peers.get(peerId) ?? null;
  }
}

// ---------------------------------------------------------------------------
// MCPPubSub
// ---------------------------------------------------------------------------

export class MCPPubSub extends BrowserEventEmitter {
  private enabled: boolean;
  private topics: Set<string>;
  private node: unknown = null;
  private ucanAuth: PubSubUCANValidator | null;
  private started = false;
  private options: PubSubOptions;
  private ownsNode = false;

  constructor(options: PubSubOptions = {}, ucanAuth?: PubSubUCANValidator) {
    super();
    this.options = options;
    this.enabled = options.enabled ?? true;
    this.topics = new Set(options.topics ?? [
      TOPIC_INTERFACE_ANNOUNCE,
      TOPIC_RECEIPT_ANNOUNCE,
      TOPIC_COORD_SIGNAL,
    ]);
    this.ucanAuth = ucanAuth ?? null;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(libp2pNode?: unknown): Promise<void> {
    if (!this.enabled || this.started) return;

    try {
      let node = libp2pNode;
      if (!node) {
        node = await createMcpLibp2pNode({
          overrides: this.options.libp2pOptions,
          bootstrapMultiaddrs: this.options.bootstrapMultiaddrs,
          pubsub: true,
        });
        await (node as { start(): Promise<void> }).start();
        this.ownsNode = true;
      }
      this.node = node;

      // Subscribe to topics
      for (const topic of this.topics) {
        try {
          (this.node as {
            services: { pubsub: { subscribe(t: string): void; addEventListener(e: string, h: (e: unknown) => void): void } };
          }).services.pubsub.subscribe(topic);
          (this.node as {
            services: { pubsub: { addEventListener(e: string, h: (e: unknown) => void): void } };
          }).services.pubsub.addEventListener('message', (evt: unknown) => {
            void this.handleMessage(evt);
          });
        } catch {
          // best effort
        }
      }
      this.started = true;
    } catch (err) {
      console.error('[MCPPubSub] Failed to start:', err);
    }
  }

  async stop(): Promise<void> {
    if (this.ownsNode && this.node) {
      await (this.node as { stop?: () => Promise<void> }).stop?.().catch(() => undefined);
    }
    this.started = false;
    this.node = null;
    this.ownsNode = false;
  }

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  /**
   * Announce an interface CID to other peers.
   * @param interfaceCid   The CID to announce
   * @param ucanToken      Optional UCAN proof authorising this announcement
   */
  async announceInterface(
    interfaceCid: string,
    ucanToken?: string,
  ): Promise<void> {
    await this.publish(TOPIC_INTERFACE_ANNOUNCE, { interfaceCid }, ucanToken);
  }

  /** Broadcast a receipt CID for audit sharing. */
  async announceReceipt(
    receiptCid: string,
    ucanToken?: string,
  ): Promise<void> {
    await this.publish(TOPIC_RECEIPT_ANNOUNCE, { receiptCid }, ucanToken);
  }

  /** Send a multi-agent coordination signal. */
  async sendCoordSignal(
    signal: Record<string, unknown>,
    ucanToken?: string,
  ): Promise<void> {
    await this.publish(TOPIC_COORD_SIGNAL, signal, ucanToken);
  }

  private async publish(
    topic: string,
    payload: unknown,
    ucanToken?: string,
  ): Promise<void> {
    if (!this.enabled || !this.started || !this.node) return;

    const cid = computeCID(JSON.stringify(payload));
    const msg: PubSubMessage = { topic, payload, ucanToken, cid };
    const data = utf8Bytes(JSON.stringify(msg));

    try {
      await (this.node as {
        services: { pubsub: { publish(t: string, d: Uint8Array): Promise<void> } };
      }).services.pubsub.publish(topic, data);
    } catch (err) {
      console.warn('[MCPPubSub] publish failed:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Receiving
  // -------------------------------------------------------------------------

  private async handleMessage(evt: unknown): Promise<void> {
    try {
      const raw = (evt as { detail: { data: Uint8Array; topic: string } }).detail;
      const text = new TextDecoder().decode(raw.data);
      const msg: PubSubMessage = JSON.parse(text);

      // Validate CID integrity
      const expectedCid = computeCID(JSON.stringify(msg.payload));
      if (expectedCid !== msg.cid) {
        console.warn('[MCPPubSub] CID mismatch; discarding message');
        return;
      }

      // Validate UCAN signature if present (§9.5)
      if (msg.ucanToken && this.ucanAuth) {
        const valid = await this.ucanAuth.validateToken(msg.ucanToken);
        if (!valid) {
          console.warn('[MCPPubSub] Invalid UCAN on received pubsub message; discarding');
          return;
        }
      }

      this.emit('message', msg);
    } catch {
      // best effort
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }
}

function addLibp2pEventListener(
  target: unknown,
  event: string,
  listener: (event: unknown) => void,
): void {
  const eventTarget = target as {
    addEventListener?: (event: string, listener: (event: unknown) => void) => void;
    on?: (event: string, listener: (event: unknown) => void) => void;
  };
  if (typeof eventTarget.addEventListener === 'function') {
    eventTarget.addEventListener(event, listener);
  } else if (typeof eventTarget.on === 'function') {
    eventTarget.on(event, listener);
  }
}

function extractPeerDiscoveryInfo(event: unknown): PeerInfo | null {
  const detail = typeof event === 'object' && event !== null && 'detail' in event
    ? (event as { detail: unknown }).detail
    : event;
  if (typeof detail !== 'object' || detail === null) return null;
  const raw = detail as {
    id?: { toString(): string };
    peerId?: { toString(): string };
    multiaddrs?: Array<{ toString(): string }>;
  };
  const id = raw.id ?? raw.peerId;
  if (!id) return null;
  return {
    peerId: id.toString(),
    multiaddrs: Array.isArray(raw.multiaddrs) ? raw.multiaddrs.map(m => m.toString()) : [],
    discoveredAt: Date.now(),
  };
}
