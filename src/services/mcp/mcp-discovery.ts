<<<<<<< Updated upstream
<<<<<<<< Updated upstream:src/services/mcp/mcp-discovery.ts
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
=======
/**
 * P2P Discovery & Optional Pub/Sub (MCP++ Phase 7)
 *
 * Provides:
 *  - `MCPDiscovery`  — peer discovery (mDNS-local, DHT, rendezvous)
 *  - `MCPPubSub`     — opt-in GossipSub dissemination of interface_cids,
 *                      receipt_cids and coordination signals
 *
 * Per MCP++ §9.5: pub/sub MUST NOT be required for point-to-point session
 * correctness.  Everything here is opt-in and controlled by feature flags.
>>>>>>> Stashed changes
 *
 * References: docs/spec/transport-mcp-p2p.md §6, §9.5
 */

<<<<<<< Updated upstream
import { utf8Bytes } from '../shared/browser-crypto.js';
import { BrowserEventEmitter } from '../shared/browser-event-emitter.js';
import { createMcpLibp2pNode } from './libp2p-browser-runtime.js';
import { computeCID } from './mcp-envelope.js';
=======
import { computeCID } from './mcp-envelope.js';
import {
  bytesToUtf8,
  utf8ToBytes,
} from '../shared/browser-bytes.js';
import {
  createMcpLibp2pConfig,
  createMcpLibp2pNode,
  isBrowserRuntime,
} from './mcp-transport.js';

type DiscoveryEventListener = (...args: any[]) => void;

class LocalEventEmitter {
  private readonly listeners = new Map<string, Set<DiscoveryEventListener>>();

  on(event: string, listener: DiscoveryEventListener): this {
    const bucket = this.listeners.get(event) ?? new Set<DiscoveryEventListener>();
    bucket.add(listener);
    this.listeners.set(event, bucket);
    return this;
  }

  off(event: string, listener: DiscoveryEventListener): this {
    const bucket = this.listeners.get(event);
    if (!bucket) return this;
    bucket.delete(listener);
    if (bucket.size === 0) this.listeners.delete(event);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const bucket = this.listeners.get(event);
    if (!bucket || bucket.size === 0) return false;
    for (const listener of bucket) {
      listener(...args);
    }
    return true;
  }
}
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
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
=======
  /** Enable mDNS discovery (default true) */
  mdns?: boolean;
  /** Enable Kademlia DHT peer routing (default true) */
  dht?: boolean;
  /** Custom rendezvous/relay multiaddr for NAT traversal (optional) */
  rendezvousAddr?: string;
}

export interface PubSubOptions {
  /** Enable pub/sub at all (default false) */
  enabled?: boolean;
  /** Topics to subscribe to */
  topics?: string[];
}

export interface MCPDiscoveryUCANValidator {
  validateToken(token: string): Promise<boolean> | boolean;
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
export class MCPDiscovery extends BrowserEventEmitter {
=======
export class MCPDiscovery extends LocalEventEmitter {
>>>>>>> Stashed changes
  private peers: Map<string, PeerInfo> = new Map();
  private options: DiscoveryOptions;
  private node: unknown = null; // libp2p node once started
  private started = false;

  constructor(options: DiscoveryOptions = {}) {
    super();
<<<<<<< Updated upstream
    this.options = {
      mdns: options.mdns,
      dht: options.dht,
      webRTC: options.webRTC ?? true,
      webSockets: options.webSockets ?? true,
      bootstrapMultiaddrs: options.bootstrapMultiaddrs ?? [],
      listenMultiaddrs: options.listenMultiaddrs,
      rendezvousAddr: options.rendezvousAddr,
      libp2pOptions: options.libp2pOptions,
=======
    const browser = isBrowserRuntime();
    this.options = {
      mdns: options.mdns ?? !browser,
      dht: options.dht ?? !browser,
      rendezvousAddr: options.rendezvousAddr,
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
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
=======
      const { createLibp2p } = await import('libp2p');
      const { config: libp2pConfig } = await createMcpLibp2pConfig({
        bootstrapMultiaddrs: this.options.rendezvousAddr
          ? [this.options.rendezvousAddr]
          : [],
      });

      // mDNS discovery
      if (this.options.mdns) {
        try {
          const mod = await optionalRuntimeImport('@libp2p/mdns');
          const mdns = mod?.mdns as (() => unknown) | undefined;
          if (mdns) {
            libp2pConfig.peerDiscovery = [
              ...(libp2pConfig.peerDiscovery as unknown[] ?? []),
              mdns(),
            ];
          }
        } catch {
          // @libp2p/mdns not installed
        }
      }

      // Kad-DHT
      if (this.options.dht) {
        try {
          const mod = await optionalRuntimeImport('@libp2p/kad-dht');
          const kadDHT = mod?.kadDHT as ((options: { clientMode: boolean }) => unknown) | undefined;
          if (kadDHT) {
            libp2pConfig.services = {
              ...(libp2pConfig.services as Record<string, unknown> ?? {}),
              dht: kadDHT({ clientMode: true }),
            };
          }
        } catch {
          // @libp2p/kad-dht not installed
        }
      }

      const node = await createLibp2p(libp2pConfig as Parameters<typeof createLibp2p>[0]);

      // Listen to peer discovery events
      (node as { on(event: string, listener: (value: unknown) => void): void }).on('peer:discovery', (peer: unknown) => {
        const info = peer as {
          id: { toString(): string };
          multiaddrs: Array<{ toString(): string }>;
        };
        this.handlePeerDiscovery({
          peerId: info.id.toString(),
          multiaddrs: info.multiaddrs.map(m => m.toString()),
          discoveredAt: Date.now(),
        });
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
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
=======
export class MCPPubSub extends LocalEventEmitter {
  private enabled: boolean;
  private topics: Set<string>;
  private node: unknown = null;
  private ucanAuth: MCPDiscoveryUCANValidator | null;
  private started = false;

  constructor(options: PubSubOptions = {}, ucanAuth?: MCPDiscoveryUCANValidator) {
    super();
    this.enabled = options.enabled ?? false;
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        node = await createMcpLibp2pNode({
          overrides: this.options.libp2pOptions,
          bootstrapMultiaddrs: this.options.bootstrapMultiaddrs,
          pubsub: true,
        });
        await (node as { start(): Promise<void> }).start();
        this.ownsNode = true;
=======
        node = await createMcpLibp2pNode({ pubsub: true });
        await (node as { start(): Promise<void> }).start();
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
    if (this.ownsNode && this.node) {
      await (this.node as { stop?: () => Promise<void> }).stop?.().catch(() => undefined);
    }
    this.started = false;
    this.node = null;
    this.ownsNode = false;
=======
    this.started = false;
    this.node = null;
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
    const data = utf8Bytes(JSON.stringify(msg));
=======
    const data = utf8ToBytes(JSON.stringify(msg));
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
      const text = new TextDecoder().decode(raw.data);
=======
      const text = bytesToUtf8(raw.data);
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
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
========
export * from './mcp/mcp-discovery.js';
>>>>>>>> Stashed changes:src/services/mcp-discovery.ts
=======
async function optionalRuntimeImport(specifier: string): Promise<Record<string, unknown> | null> {
  try {
    return await import(/* @vite-ignore */ specifier) as Record<string, unknown>;
  } catch {
    return null;
  }
}
>>>>>>> Stashed changes
