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
 *
 * References: docs/spec/transport-mcp-p2p.md §6, §9.5
 */

import { EventEmitter } from 'events';
import { UCANAuth } from '../auth/ucan-auth.js';
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

// ---------------------------------------------------------------------------
// Well-known pub/sub topics
// ---------------------------------------------------------------------------

export const TOPIC_INTERFACE_ANNOUNCE = 'mcp++/interface-announce';
export const TOPIC_RECEIPT_ANNOUNCE   = 'mcp++/receipt-announce';
export const TOPIC_COORD_SIGNAL       = 'mcp++/coord-signal';

// ---------------------------------------------------------------------------
// MCPDiscovery
// ---------------------------------------------------------------------------

export class MCPDiscovery extends EventEmitter {
  private peers: Map<string, PeerInfo> = new Map();
  private options: DiscoveryOptions;
  private node: unknown = null; // libp2p node once started
  private started = false;

  constructor(options: DiscoveryOptions = {}) {
    super();
    this.options = {
      mdns: options.mdns ?? true,
      dht: options.dht ?? true,
      rendezvousAddr: options.rendezvousAddr,
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
      const { createLibp2p } = await import('libp2p');
      const libp2pConfig: Record<string, unknown> = {};

      // Noise encryption + yamux muxer if available
      try {
        const { noise } = await import('@chainsafe/libp2p-noise');
        const { yamux } = await import('@chainsafe/libp2p-yamux');
        libp2pConfig.connectionEncrypters = [noise()];
        libp2pConfig.streamMuxers = [yamux()];
      } catch {
        // graceful degradation
      }

      // mDNS discovery
      if (this.options.mdns) {
        try {
          const { mdns } = await import('@libp2p/mdns');
          libp2pConfig.peerDiscovery = [
            ...(libp2pConfig.peerDiscovery as unknown[] ?? []),
            mdns(),
          ];
        } catch {
          // @libp2p/mdns not installed
        }
      }

      // Kad-DHT
      if (this.options.dht) {
        try {
          const { kadDHT } = await import('@libp2p/kad-dht');
          libp2pConfig.services = {
            ...(libp2pConfig.services as Record<string, unknown> ?? {}),
            dht: kadDHT({ clientMode: true }),
          };
        } catch {
          // @libp2p/kad-dht not installed
        }
      }

      const node = await createLibp2p(libp2pConfig as Parameters<typeof createLibp2p>[0]);

      // Listen to peer discovery events
      (node as EventEmitter).on('peer:discovery', (peer: unknown) => {
        const info = peer as {
          id: { toString(): string };
          multiaddrs: Array<{ toString(): string }>;
        };
        this.handlePeerDiscovery({
          peerId: info.id.toString(),
          multiaddrs: info.multiaddrs.map(m => m.toString()),
          discoveredAt: Date.now(),
        });
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

export class MCPPubSub extends EventEmitter {
  private enabled: boolean;
  private topics: Set<string>;
  private node: unknown = null;
  private ucanAuth: UCANAuth | null;
  private started = false;

  constructor(options: PubSubOptions = {}, ucanAuth?: UCANAuth) {
    super();
    this.enabled = options.enabled ?? false;
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
        const { createLibp2p } = await import('libp2p');
        const cfg: Record<string, unknown> = {};
        try {
          const { gossipsub } = await import('@libp2p/gossipsub');
          cfg.services = { pubsub: gossipsub() };
        } catch {
          // @libp2p/gossipsub not installed
          return;
        }
        node = await createLibp2p(cfg as Parameters<typeof createLibp2p>[0]);
        await (node as { start(): Promise<void> }).start();
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
    this.started = false;
    this.node = null;
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
    const data = Buffer.from(JSON.stringify(msg), 'utf8');

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
      const text = Buffer.from(raw.data).toString('utf8');
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
