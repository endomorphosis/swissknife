/**
 * MCPPubSubBus — structured, transport-agnostic pub/sub lifecycle for MCP++.
 *
 * Provides deterministic lifecycle control, per-topic subscription management,
 * resubscribe-on-reconnect semantics, delivery metrics, and a pluggable
 * transport backend (in-process EventEmitter or external libp2p GossipSub).
 *
 * Conformance target: MCP++ Profile E §3 — "Structured PubSubBus lifecycle
 * parity (subscribe/topic mapping/resubscribe metrics)".
 *
 * Design principles
 * -----------------
 * 1. Zero hard dependencies — works fully in-process without libp2p installed.
 * 2. Pluggable backend: anything satisfying `PubSubTransport` can be swapped in.
 * 3. Subscription registry survives restarts: subscriptions declared before
 *    `start()` or while stopped are automatically replayed on reconnect.
 * 4. Per-topic and aggregate delivery metrics with no external deps.
 * 5. Process-global singleton via `MCPPubSubBus.getInstance()`.
 *
 * Usage
 * -----
 * ```ts
 * const bus = MCPPubSubBus.getInstance();
 * bus.subscribe('mcp/interface/announce', msg => console.log(msg));
 * await bus.start();
 * await bus.publish('mcp/interface/announce', { interfaceCid: 'sha256:...' });
 * ```
 */

import { EventEmitter } from 'events';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Well-known topics (mirrors mcp-discovery.ts constants)
// ---------------------------------------------------------------------------

export const MCP_TOPIC_INTERFACE_ANNOUNCE = 'mcp/interface/announce';
export const MCP_TOPIC_RECEIPT_ANNOUNCE = 'mcp/receipt/announce';
export const MCP_TOPIC_COORD_SIGNAL = 'mcp/coord/signal';
export const MCP_TOPIC_DELEGATION_MERGE = 'mcp/delegation/merge';
export const MCP_TOPIC_POLICY_UPDATE = 'mcp/policy/update';

/** The full set of well-known MCP++ topics. */
export const MCP_WELL_KNOWN_TOPICS = [
  MCP_TOPIC_INTERFACE_ANNOUNCE,
  MCP_TOPIC_RECEIPT_ANNOUNCE,
  MCP_TOPIC_COORD_SIGNAL,
  MCP_TOPIC_DELEGATION_MERGE,
  MCP_TOPIC_POLICY_UPDATE,
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A message delivered on a topic. */
export interface BusMessage {
  /** The topic this message was published on. */
  topic: string;
  /** Serialisable payload. */
  payload: unknown;
  /** ISO-8601 publish time. */
  published_at: string;
  /** Content-addressed CID of the message (`sha256:<hex>`). */
  message_cid: string;
  /** Optional UCAN proof from the publisher. */
  ucan_token?: string;
}

/** Handler called for each message delivered on a subscribed topic. */
export type BusMessageHandler = (message: BusMessage) => void | Promise<void>;

/** Per-topic delivery metrics. */
export interface TopicMetrics {
  topic: string;
  published: number;
  delivered: number;
  errors: number;
  subscriber_count: number;
}

/** Aggregate bus metrics. */
export interface BusMetrics {
  state: BusState;
  topics: Record<string, TopicMetrics>;
  total_published: number;
  total_delivered: number;
  total_errors: number;
  resubscribe_count: number;
  started_at?: string;
  uptime_ms?: number;
}

export type BusState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

/**
 * Pluggable transport backend.
 *
 * Any object satisfying this interface can be used as the underlying transport.
 * The built-in `InProcessBusTransport` works without libp2p.
 */
export interface PubSubTransport {
  /**
   * Publish `payload` on `topic`.  Called by the bus after computing the CID.
   * Transport may broadcast to remote peers or simply emit locally.
   */
  publish(topic: string, message: BusMessage): Promise<void>;

  /**
   * Register an inbound handler for `topic`.  The transport must invoke
   * `handler` for every message received on the topic — including messages
   * published via `publish()` that arrive back through the network.
   *
   * For in-process transports, calling `publish(topic, msg)` and then having
   * the transport call `handler(msg)` synchronously/async is valid.
   */
  subscribe(topic: string, handler: BusMessageHandler): void;

  /** Remove a previously-registered handler. */
  unsubscribe(topic: string, handler: BusMessageHandler): void;
}

// ---------------------------------------------------------------------------
// In-process transport (no libp2p required)
// ---------------------------------------------------------------------------

/**
 * A pure in-memory pub/sub transport using Node.js EventEmitter.
 * Messages published on a topic are immediately delivered to all subscribers.
 * Suitable for testing and for single-process deployments.
 */
export class InProcessBusTransport implements PubSubTransport {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0); // unlimited
  }

  async publish(topic: string, message: BusMessage): Promise<void> {
    this.emitter.emit(topic, message);
  }

  subscribe(topic: string, handler: BusMessageHandler): void {
    this.emitter.on(topic, handler);
  }

  unsubscribe(topic: string, handler: BusMessageHandler): void {
    this.emitter.off(topic, handler);
  }
}

// ---------------------------------------------------------------------------
// Subscription registry
// ---------------------------------------------------------------------------

interface Subscription {
  handler: BusMessageHandler;
  subscribedAt: string;
}

// ---------------------------------------------------------------------------
// MCPPubSubBus
// ---------------------------------------------------------------------------

/**
 * Transport-agnostic MCP++ pub/sub bus.
 *
 * Lifecycle: idle → starting → running → stopping → stopped
 * Subscriptions declared in any state are auto-replayed on (re)start.
 */
export class MCPPubSubBus extends EventEmitter {
  private state: BusState = 'idle';
  private readonly transport: PubSubTransport;
  /** Original (user-supplied) handlers, indexed by topic. Never mutated. */
  private readonly subscriptions = new Map<string, Subscription[]>();
  /** Maps each original handler → its current metered wrapper on the transport. */
  private readonly _transportWrappers = new Map<string, Map<BusMessageHandler, BusMessageHandler>>();
  private readonly topicMetrics = new Map<string, TopicMetrics>();
  private resubscribeCount = 0;
  private startedAt?: Date;
  private totalPublished = 0;
  private totalDelivered = 0;
  private totalErrors = 0;

  constructor(opts?: { transport?: PubSubTransport }) {
    super();
    this.transport = opts?.transport ?? new InProcessBusTransport();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.state === 'running') return;
    if (this.state === 'starting') return;

    this.state = 'starting';
    this.emit('state', 'starting');

    try {
      // Replay all pre-registered subscriptions onto the transport.
      await this._replaySubscriptions();
      this.state = 'running';
      this.startedAt = new Date();
      this.emit('state', 'running');
    } catch (err) {
      this.state = 'error';
      this.emit('state', 'error');
      this.emit('error', err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'idle') return;
    this.state = 'stopping';
    this.emit('state', 'stopping');

    // Unsubscribe the metered wrappers (not the original handlers) from the transport.
    for (const [topic, wrapperMap] of this._transportWrappers) {
      for (const wrapper of wrapperMap.values()) {
        try { this.transport.unsubscribe(topic, wrapper); } catch { /* best effort */ }
      }
    }
    this._transportWrappers.clear();

    this.state = 'stopped';
    this.emit('state', 'stopped');
  }

  async restart(): Promise<void> {
    await this.stop();
    this.state = 'idle';
    await this.start();
  }

  /** Current lifecycle state. */
  get busState(): BusState { return this.state; }

  // ---------------------------------------------------------------------------
  // Subscribe / Unsubscribe
  // ---------------------------------------------------------------------------

  /**
   * Subscribe `handler` to `topic`.
   *
   * Subscriptions registered before or after `start()` are both valid.
   * Newly-registered subscriptions are immediately forwarded to the transport
   * when the bus is `running`; otherwise they are queued for replay on start.
   *
   * @returns An unsubscribe function.
   */
  subscribe(topic: string, handler: BusMessageHandler): () => void {
    const sub: Subscription = { handler, subscribedAt: new Date().toISOString() };
    const existing = this.subscriptions.get(topic) ?? [];
    existing.push(sub);
    this.subscriptions.set(topic, existing);

    this._ensureTopicMetrics(topic);
    this._topicMetrics(topic).subscriber_count = existing.length;

    // If already running, hook into the transport immediately with a metered wrapper.
    if (this.state === 'running') {
      const wrapper = this._makeWrapper(topic, handler);
      if (!this._transportWrappers.has(topic)) {
        this._transportWrappers.set(topic, new Map());
      }
      this._transportWrappers.get(topic)!.set(handler, wrapper);
      this.transport.subscribe(topic, wrapper);
    }

    this.emit('subscribed', { topic });
    return () => this.unsubscribe(topic, handler);
  }

  /**
   * Remove a handler from a topic.
   *
   * @returns `true` if the handler was found and removed.
   */
  unsubscribe(topic: string, handler: BusMessageHandler): boolean {
    const subs = this.subscriptions.get(topic);
    if (!subs) return false;

    const idx = subs.findIndex(s => s.handler === handler);
    if (idx < 0) return false;

    subs.splice(idx, 1);
    if (subs.length === 0) {
      this.subscriptions.delete(topic);
    }

    if (this.state === 'running') {
      const wrapperMap = this._transportWrappers.get(topic);
      const wrapper = wrapperMap?.get(handler);
      if (wrapper) {
        try { this.transport.unsubscribe(topic, wrapper); } catch { /* best effort */ }
        wrapperMap!.delete(handler);
      }
    }

    if (this.topicMetrics.has(topic)) {
      this._topicMetrics(topic).subscriber_count = subs.length;
    }

    this.emit('unsubscribed', { topic });
    return true;
  }

  /** List currently-subscribed topics. */
  subscribedTopics(): string[] {
    return [...this.subscriptions.keys()];
  }

  /** Return the number of registered handlers for `topic`. */
  subscriberCount(topic: string): number {
    return this.subscriptions.get(topic)?.length ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Publish
  // ---------------------------------------------------------------------------

  /**
   * Publish `payload` on `topic`.
   *
   * Computes a deterministic `message_cid`, then calls `transport.publish()`.
   * If the bus is not `running`, the message is dropped and a warning is emitted.
   */
  async publish(
    topic: string,
    payload: unknown,
    opts?: { ucan_token?: string },
  ): Promise<BusMessage> {
    const msg: BusMessage = {
      topic,
      payload,
      published_at: new Date().toISOString(),
      message_cid: '', // filled below
      ucan_token: opts?.ucan_token,
    };
    msg.message_cid = computeMessageCID(msg);

    if (this.state !== 'running') {
      this.emit('warning', { message: `publish called in state '${this.state}'; dropping`, topic });
      return msg;
    }

    this._ensureTopicMetrics(topic);
    this.totalPublished++;
    this._topicMetrics(topic).published++;

    try {
      await this.transport.publish(topic, msg);
      this.emit('published', msg);
    } catch (err) {
      this.totalErrors++;
      this._topicMetrics(topic).errors++;
      this.emit('error', err);
    }

    return msg;
  }

  // ---------------------------------------------------------------------------
  // Well-known convenience publishers
  // ---------------------------------------------------------------------------

  publishInterfaceAnnounce(interfaceCid: string, ucanToken?: string): Promise<BusMessage> {
    return this.publish(MCP_TOPIC_INTERFACE_ANNOUNCE, { interface_cid: interfaceCid }, { ucan_token: ucanToken });
  }

  publishReceiptAnnounce(receiptCid: string, ucanToken?: string): Promise<BusMessage> {
    return this.publish(MCP_TOPIC_RECEIPT_ANNOUNCE, { receipt_cid: receiptCid }, { ucan_token: ucanToken });
  }

  publishCoordSignal(signal: Record<string, unknown>, ucanToken?: string): Promise<BusMessage> {
    return this.publish(MCP_TOPIC_COORD_SIGNAL, signal, { ucan_token: ucanToken });
  }

  publishDelegationMerge(payload: Record<string, unknown>, ucanToken?: string): Promise<BusMessage> {
    return this.publish(MCP_TOPIC_DELEGATION_MERGE, payload, { ucan_token: ucanToken });
  }

  publishPolicyUpdate(payload: Record<string, unknown>, ucanToken?: string): Promise<BusMessage> {
    return this.publish(MCP_TOPIC_POLICY_UPDATE, payload, { ucan_token: ucanToken });
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  /** Return aggregate + per-topic delivery metrics. */
  getMetrics(): BusMetrics {
    const topics: Record<string, TopicMetrics> = {};
    for (const [topic, m] of this.topicMetrics) {
      topics[topic] = { ...m };
    }
    // Also include topics with active subscriptions but no messages yet
    for (const [topic, subs] of this.subscriptions) {
      if (!topics[topic]) {
        topics[topic] = {
          topic,
          published: 0,
          delivered: 0,
          errors: 0,
          subscriber_count: subs.length,
        };
      }
    }
    return {
      state: this.state,
      topics,
      total_published: this.totalPublished,
      total_delivered: this.totalDelivered,
      total_errors: this.totalErrors,
      resubscribe_count: this.resubscribeCount,
      started_at: this.startedAt?.toISOString(),
      uptime_ms: this.startedAt ? Date.now() - this.startedAt.getTime() : undefined,
    };
  }

  /** Reset metrics counters (does not affect subscriptions or state). */
  resetMetrics(): void {
    this.totalPublished = 0;
    this.totalDelivered = 0;
    this.totalErrors = 0;
    this.resubscribeCount = 0;
    this.topicMetrics.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async _replaySubscriptions(): Promise<void> {
    for (const [topic, subs] of this.subscriptions) {
      if (!this._transportWrappers.has(topic)) {
        this._transportWrappers.set(topic, new Map());
      }
      const wrapperMap = this._transportWrappers.get(topic)!;
      for (const sub of subs) {
        // Always create a FRESH wrapper from the original (un-wrapped) handler.
        const wrapper = this._makeWrapper(topic, sub.handler);
        wrapperMap.set(sub.handler, wrapper);
        this.transport.subscribe(topic, wrapper);
      }
      this.resubscribeCount++;
    }
  }

  private _makeWrapper(topic: string, originalHandler: BusMessageHandler): BusMessageHandler {
    return (msg: BusMessage) => {
      this._ensureTopicMetrics(msg.topic);
      this.totalDelivered++;
      this._topicMetrics(msg.topic).delivered++;
      this.emit('message', msg);
      return originalHandler(msg);
    };
  }

  private _ensureTopicMetrics(topic: string): void {
    if (!this.topicMetrics.has(topic)) {
      this.topicMetrics.set(topic, {
        topic,
        published: 0,
        delivered: 0,
        errors: 0,
        subscriber_count: this.subscriptions.get(topic)?.length ?? 0,
      });
    }
  }

  private _topicMetrics(topic: string): TopicMetrics {
    return this.topicMetrics.get(topic)!;
  }

  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  private static _instance: MCPPubSubBus | null = null;

  static getInstance(): MCPPubSubBus {
    if (!MCPPubSubBus._instance) {
      MCPPubSubBus._instance = new MCPPubSubBus();
    }
    return MCPPubSubBus._instance;
  }

  static resetInstance(): void {
    MCPPubSubBus._instance = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeMessageCID(msg: Omit<BusMessage, 'message_cid'>): string {
  const canonical = JSON.stringify({
    topic: msg.topic,
    payload: msg.payload,
    published_at: msg.published_at,
    ucan_token: msg.ucan_token ?? null,
  });
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}
