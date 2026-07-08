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

<<<<<<< HEAD
import { utf8Bytes } from '../shared/browser-crypto.js';
import { BrowserEventEmitter } from '../shared/browser-event-emitter.js';
import { createMcpLibp2pNode, isBrowserRuntime } from './libp2p-browser-runtime.js';
=======
import { EventEmitter } from 'events';
import { UCANAuth } from '../../auth/ucan-auth.js';
import {
  createBrowserLibp2pNode,
  summarizeBrowserLibp2pGaps,
  type BrowserLibp2pCapabilityGap,
  type BrowserLibp2pRuntimeOptions,
  type BrowserLibp2pRuntimeReport,
} from './libp2p-browser-runtime.js';
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
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
<<<<<<< HEAD
  /** Additional libp2p config merged before defaults are applied */
  libp2pOptions?: Record<string, unknown>;
=======
  /** Override browser libp2p runtime assembly. Enabled by default. */
  libp2pRuntime?: BrowserLibp2pRuntimeOptions;
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
}

export interface PubSubOptions {
  /** Enable pub/sub at all (default true) */
  enabled?: boolean;
  /** Topics to subscribe to */
  topics?: string[];
<<<<<<< HEAD
  /** Bootstrap relay/peer multiaddrs for browser libp2p */
  bootstrapMultiaddrs?: string[];
  /** Additional libp2p config merged before defaults are applied */
  libp2pOptions?: Record<string, unknown>;
}

export interface PubSubUCANValidator {
  validateToken(token: string): boolean | Promise<boolean>;
=======
  /** Override browser libp2p runtime assembly when this class owns the node. */
  libp2pRuntime?: BrowserLibp2pRuntimeOptions;
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
}

// ---------------------------------------------------------------------------
// Well-known pub/sub topics
// ---------------------------------------------------------------------------

export const TOPIC_INTERFACE_ANNOUNCE = 'mcp++/interface-announce';
export const TOPIC_RECEIPT_ANNOUNCE   = 'mcp++/receipt-announce';
export const TOPIC_COORD_SIGNAL       = 'mcp++/coord-signal';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function appendConfigArray(
  config: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  config[key] = [
    ...(Array.isArray(config[key]) ? config[key] as unknown[] : []),
    value,
  ];
}

function appendConfigService(
  config: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  config.services = {
    ...(
      config.services && typeof config.services === 'object' && !Array.isArray(config.services)
        ? config.services as Record<string, unknown>
        : {}
    ),
    [key]: value,
  };
}

function toPeerInfo(peer: unknown): PeerInfo | null {
  const candidate = (
    peer && typeof peer === 'object' && 'detail' in peer
      ? (peer as { detail: unknown }).detail
      : peer
  ) as {
    id?: { toString(): string };
    peerId?: { toString(): string };
    multiaddrs?: Array<{ toString(): string }>;
  } | null;

  const id = candidate?.id ?? candidate?.peerId;
  if (!id) return null;

  return {
    peerId: id.toString(),
    multiaddrs: (candidate?.multiaddrs ?? []).map(addr => addr.toString()),
    discoveredAt: Date.now(),
  };
}

function addPeerDiscoveryListener(node: unknown, handler: (peer: PeerInfo) => void): void {
  const listener = (evt: unknown) => {
    const info = toPeerInfo(evt);
    if (info) handler(info);
  };
  const eventTarget = node as {
    addEventListener?: (event: string, listener: (evt: unknown) => void) => void;
    on?: (event: string, listener: (evt: unknown) => void) => void;
  };

  if (typeof eventTarget.addEventListener === 'function') {
    eventTarget.addEventListener('peer:discovery', listener);
    return;
  }
  if (typeof eventTarget.on === 'function') {
    eventTarget.on('peer:discovery', listener);
  }
}

// ---------------------------------------------------------------------------
// MCPDiscovery
// ---------------------------------------------------------------------------

export class MCPDiscovery extends BrowserEventEmitter {
  private peers: Map<string, PeerInfo> = new Map();
  private options: DiscoveryOptions;
  private node: unknown = null; // libp2p node once started
  private started = false;
  private runtimeReport: BrowserLibp2pRuntimeReport | null = null;
  private capabilityGaps: BrowserLibp2pCapabilityGap[] = [];

  constructor(options: DiscoveryOptions = {}) {
    super();
    const browser = isBrowserRuntime();
    this.options = {
      mdns: options.mdns ?? !browser,
      dht: options.dht ?? !browser,
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
   * back by reporting capability gaps when they are not installed.
   */
  async start(): Promise<void> {
    if (this.started) return;

    try {
<<<<<<< HEAD
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
=======
      const libp2pConfig: Record<string, unknown> = {
        ...(this.options.libp2pRuntime?.libp2pOptions ?? {}),
      };

      // mDNS discovery
      if (this.options.mdns) {
        const packageName = '@libp2p/mdns';
        try {
          const module = await import(/* @vite-ignore */ packageName) as Record<string, unknown>;
          const mdns = module.mdns;
          if (typeof mdns !== 'function') {
            throw new Error(`${packageName} does not export mdns`);
          }
          appendConfigArray(libp2pConfig, 'peerDiscovery', mdns());
        } catch (err) {
          this.capabilityGaps.push({
            name: 'libp2p',
            packageName,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Kad-DHT
      if (this.options.dht) {
        const packageName = '@libp2p/kad-dht';
        try {
          const module = await import(/* @vite-ignore */ packageName) as Record<string, unknown>;
          const kadDHT = module.kadDHT;
          if (typeof kadDHT !== 'function') {
            throw new Error(`${packageName} does not export kadDHT`);
          }
          appendConfigService(libp2pConfig, 'dht', kadDHT({ clientMode: true }));
        } catch (err) {
          this.capabilityGaps.push({
            name: 'libp2p',
            packageName,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const runtime = await createBrowserLibp2pNode({
        ...this.options.libp2pRuntime,
        libp2pOptions: libp2pConfig,
      });
      const node = runtime.node;
      this.runtimeReport = runtime.report;
      this.capabilityGaps.push(...runtime.report.gaps);

      // Listen to peer discovery events
      addPeerDiscoveryListener(node, info => this.handlePeerDiscovery(info));
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

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

  getLibp2pRuntimeReport(): BrowserLibp2pRuntimeReport | null {
    return this.runtimeReport;
  }

  getCapabilityGaps(): BrowserLibp2pCapabilityGap[] {
    return [...this.capabilityGaps];
  }

  getCapabilityGapSummary(): string[] {
    return summarizeBrowserLibp2pGaps({
      enabled: this.runtimeReport?.enabled ?? true,
      capabilities: this.runtimeReport?.capabilities ?? [],
      gaps: this.capabilityGaps,
    });
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
<<<<<<< HEAD
  private options: PubSubOptions;
  private ownsNode = false;
=======
  private runtimeOptions: BrowserLibp2pRuntimeOptions | undefined;
  private runtimeReport: BrowserLibp2pRuntimeReport | null = null;
  private capabilityGaps: BrowserLibp2pCapabilityGap[] = [];
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

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
    this.runtimeOptions = options.libp2pRuntime;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(libp2pNode?: unknown): Promise<void> {
    if (!this.enabled || this.started) return;

    try {
      let node = libp2pNode;
      if (!node) {
<<<<<<< HEAD
        node = await createMcpLibp2pNode({
          overrides: this.options.libp2pOptions,
          bootstrapMultiaddrs: this.options.bootstrapMultiaddrs,
          pubsub: true,
        });
=======
        const runtime = await createBrowserLibp2pNode({
          ...this.runtimeOptions,
          includeGossipSub: true,
        });
        this.runtimeReport = runtime.report;
        this.capabilityGaps.push(...runtime.report.gaps);
        node = runtime.node;
        if (!this.getPubSubService(node)) {
          this.capabilityGaps.push({
            name: 'gossipsub',
            packageName: '@libp2p/gossipsub | @chainsafe/libp2p-gossipsub',
            reason: 'libp2p node has no pubsub service',
          });
          return;
        }
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
        await (node as { start(): Promise<void> }).start();
        this.ownsNode = true;
      }
      this.node = node;
      if (!this.getPubSubService(this.node)) {
        this.capabilityGaps.push({
          name: 'gossipsub',
          packageName: '@libp2p/gossipsub | @chainsafe/libp2p-gossipsub',
          reason: 'libp2p node has no pubsub service',
        });
        return;
      }

      // Subscribe to topics
      for (const topic of this.topics) {
        try {
          const pubsub = this.getPubSubService(this.node)!;
          pubsub.subscribe(topic);
          pubsub.addEventListener('message', (evt: unknown) => {
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
<<<<<<< HEAD
    const data = utf8Bytes(JSON.stringify(msg));
=======
    const data = textEncoder.encode(JSON.stringify(msg));
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

    try {
      await this.getPubSubService(this.node)!.publish(topic, data);
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
<<<<<<< HEAD
      const text = new TextDecoder().decode(raw.data);
=======
      const text = textDecoder.decode(raw.data);
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
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

  private getPubSubService(node: unknown): {
    subscribe(t: string): void;
    addEventListener(e: string, h: (e: unknown) => void): void;
    publish(t: string, d: Uint8Array): Promise<void>;
  } | null {
    const services = (node as { services?: Record<string, unknown> } | null)?.services;
    const pubsub = services?.pubsub;
    if (!pubsub || typeof pubsub !== 'object') return null;
    const candidate = pubsub as {
      subscribe?: (t: string) => void;
      addEventListener?: (e: string, h: (e: unknown) => void) => void;
      publish?: (t: string, d: Uint8Array) => Promise<void>;
    };
    return (
      typeof candidate.subscribe === 'function' &&
      typeof candidate.addEventListener === 'function' &&
      typeof candidate.publish === 'function'
    ) ? candidate as {
      subscribe(t: string): void;
      addEventListener(e: string, h: (e: unknown) => void): void;
      publish(t: string, d: Uint8Array): Promise<void>;
    } : null;
  }

  getLibp2pRuntimeReport(): BrowserLibp2pRuntimeReport | null {
    return this.runtimeReport;
  }

  getCapabilityGaps(): BrowserLibp2pCapabilityGap[] {
    return [...this.capabilityGaps];
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
async function optionalRuntimeImport(specifier: string): Promise<Record<string, unknown> | null> {
  try {
    return await import(/* @vite-ignore */ specifier) as Record<string, unknown>;
  } catch {
    return null;
  }
}
