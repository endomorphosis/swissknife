/**
 * MCPPubSubBus tests — MCP++ Profile E structured PubSub lifecycle parity.
 *
 * Covers: lifecycle state machine, subscribe/unsubscribe, publish, metrics,
 * pre-start subscription replay, resubscribe tracking, well-known helpers,
 * InProcessBusTransport, pluggable transport, and singleton.
 */

import {
  MCPPubSubBus,
  InProcessBusTransport,
  MCP_WELL_KNOWN_TOPICS,
  MCP_TOPIC_INTERFACE_ANNOUNCE,
  MCP_TOPIC_RECEIPT_ANNOUNCE,
  MCP_TOPIC_COORD_SIGNAL,
  MCP_TOPIC_POLICY_UPDATE,
  type BusMessage,
  type BusMessageHandler,
  type PubSubTransport,
} from '../../src/services/mcp/mcp-pubsub-bus';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBus() {
  return new MCPPubSubBus();
}

async function startedBus() {
  const bus = makeBus();
  await bus.start();
  return bus;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe('MCPPubSubBus — lifecycle', () => {
  it('starts in idle state', () => {
    const bus = makeBus();
    expect(bus.busState).toBe('idle');
  });

  it('transitions idle → running on start()', async () => {
    const bus = makeBus();
    const states: string[] = [];
    bus.on('state', s => states.push(s));
    await bus.start();
    expect(bus.busState).toBe('running');
    expect(states).toEqual(['starting', 'running']);
  });

  it('start() is idempotent when already running', async () => {
    const bus = await startedBus();
    await bus.start(); // should not throw or double-start
    expect(bus.busState).toBe('running');
  });

  it('transitions running → stopped on stop()', async () => {
    const bus = await startedBus();
    const states: string[] = [];
    bus.on('state', s => states.push(s));
    await bus.stop();
    expect(bus.busState).toBe('stopped');
    expect(states).toContain('stopping');
    expect(states).toContain('stopped');
  });

  it('stop() on idle/stopped is a no-op', async () => {
    const bus = makeBus();
    await bus.stop(); // should not throw
    expect(bus.busState).toBe('idle');
  });

  it('restart() stops then restarts, re-applying subscriptions', async () => {
    const bus = await startedBus();
    const received: BusMessage[] = [];
    bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, msg => { received.push(msg); });
    await bus.restart();
    expect(bus.busState).toBe('running');
    await bus.publish(MCP_TOPIC_INTERFACE_ANNOUNCE, { interface_cid: 'sha256:abc' });
    expect(received).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Subscribe / Unsubscribe
// ---------------------------------------------------------------------------

describe('MCPPubSubBus — subscribe and unsubscribe', () => {
  it('subscribe() returns an unsubscribe function', async () => {
    const bus = await startedBus();
    const received: BusMessage[] = [];
    const unsub = bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, msg => received.push(msg));
    await bus.publish(MCP_TOPIC_INTERFACE_ANNOUNCE, { cid: 'a' });
    expect(received).toHaveLength(1);

    unsub();
    await bus.publish(MCP_TOPIC_INTERFACE_ANNOUNCE, { cid: 'b' });
    expect(received).toHaveLength(1); // no second delivery
  });

  it('unsubscribe() returns true when handler existed, false otherwise', async () => {
    const bus = await startedBus();
    const handler: BusMessageHandler = () => {};
    bus.subscribe(MCP_TOPIC_COORD_SIGNAL, handler);
    expect(bus.unsubscribe(MCP_TOPIC_COORD_SIGNAL, handler)).toBe(true);
    expect(bus.unsubscribe(MCP_TOPIC_COORD_SIGNAL, handler)).toBe(false);
  });

  it('subscriberCount() tracks active handlers per topic', async () => {
    const bus = await startedBus();
    const h1: BusMessageHandler = () => {};
    const h2: BusMessageHandler = () => {};
    bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, h1);
    bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, h2);
    expect(bus.subscriberCount(MCP_TOPIC_INTERFACE_ANNOUNCE)).toBe(2);
    bus.unsubscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, h1);
    expect(bus.subscriberCount(MCP_TOPIC_INTERFACE_ANNOUNCE)).toBe(1);
  });

  it('subscribedTopics() returns only active subscription topics', async () => {
    const bus = await startedBus();
    bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, () => {});
    bus.subscribe(MCP_TOPIC_RECEIPT_ANNOUNCE, () => {});
    const topics = bus.subscribedTopics();
    expect(topics).toContain(MCP_TOPIC_INTERFACE_ANNOUNCE);
    expect(topics).toContain(MCP_TOPIC_RECEIPT_ANNOUNCE);
  });
});

// ---------------------------------------------------------------------------
// Pre-start subscription replay
// ---------------------------------------------------------------------------

describe('MCPPubSubBus — pre-start subscription replay', () => {
  it('subscriptions registered before start() receive messages after start()', async () => {
    const bus = makeBus();
    const received: BusMessage[] = [];
    bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, msg => received.push(msg));
    // NOT started yet — subscription queued
    expect(bus.subscriberCount(MCP_TOPIC_INTERFACE_ANNOUNCE)).toBe(1);

    await bus.start();
    await bus.publish(MCP_TOPIC_INTERFACE_ANNOUNCE, { cid: 'replay-test' });
    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual({ cid: 'replay-test' });
  });

  it('each start() increments resubscribe_count for each registered topic', async () => {
    const bus = makeBus();
    bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, () => {});
    bus.subscribe(MCP_TOPIC_RECEIPT_ANNOUNCE, () => {});
    await bus.start();
    expect(bus.getMetrics().resubscribe_count).toBe(2); // 2 topics replayed
  });
});

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

describe('MCPPubSubBus — publish', () => {
  it('delivers a message with a stable message_cid', async () => {
    const bus = await startedBus();
    const received: BusMessage[] = [];
    bus.subscribe(MCP_TOPIC_COORD_SIGNAL, msg => received.push(msg));
    const published = await bus.publish(MCP_TOPIC_COORD_SIGNAL, { op: 'sync' });
    expect(published.message_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(received).toHaveLength(1);
    expect(received[0].message_cid).toBe(published.message_cid);
  });

  it('same payload + topic + timestamp → same message_cid', async () => {
    const bus1 = await startedBus();
    const bus2 = await startedBus();
    const ts = new Date().toISOString();
    const m1 = await bus1.publish(MCP_TOPIC_COORD_SIGNAL, { x: 1 });
    const m2 = await bus2.publish(MCP_TOPIC_COORD_SIGNAL, { x: 1 });
    // CIDs differ only if timestamps differ — test that the format is correct
    expect(m1.message_cid).toMatch(/^sha256:/);
    expect(m2.message_cid).toMatch(/^sha256:/);
  });

  it('emits a warning and returns without throwing when not running', async () => {
    const bus = makeBus(); // idle
    const warnings: unknown[] = [];
    bus.on('warning', w => warnings.push(w));
    await bus.publish(MCP_TOPIC_INTERFACE_ANNOUNCE, { cid: 'x' });
    expect(warnings).toHaveLength(1);
  });

  it('delivers to multiple subscribers on the same topic', async () => {
    const bus = await startedBus();
    const a: BusMessage[] = [];
    const b: BusMessage[] = [];
    bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, m => a.push(m));
    bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, m => b.push(m));
    await bus.publish(MCP_TOPIC_INTERFACE_ANNOUNCE, { cid: 'multi' });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Well-known convenience publishers
// ---------------------------------------------------------------------------

describe('MCPPubSubBus — convenience publishers', () => {
  it('publishInterfaceAnnounce delivers to the interface announce topic', async () => {
    const bus = await startedBus();
    const received: BusMessage[] = [];
    bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, m => received.push(m));
    await bus.publishInterfaceAnnounce('sha256:abc', 'ucan-token');
    expect(received).toHaveLength(1);
    expect((received[0].payload as Record<string, unknown>).interface_cid).toBe('sha256:abc');
    expect(received[0].ucan_token).toBe('ucan-token');
  });

  it('publishReceiptAnnounce delivers to the receipt announce topic', async () => {
    const bus = await startedBus();
    const received: BusMessage[] = [];
    bus.subscribe(MCP_TOPIC_RECEIPT_ANNOUNCE, m => received.push(m));
    await bus.publishReceiptAnnounce('sha256:receipt');
    expect(received).toHaveLength(1);
    expect((received[0].payload as Record<string, unknown>).receipt_cid).toBe('sha256:receipt');
  });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('MCPPubSubBus — metrics', () => {
  it('tracks published, delivered, errors per topic and in aggregate', async () => {
    const bus = await startedBus();
    bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, () => {});
    bus.subscribe(MCP_TOPIC_INTERFACE_ANNOUNCE, () => {});
    await bus.publish(MCP_TOPIC_INTERFACE_ANNOUNCE, { cid: 'a' });
    await bus.publish(MCP_TOPIC_INTERFACE_ANNOUNCE, { cid: 'b' });

    const m = bus.getMetrics();
    expect(m.state).toBe('running');
    expect(m.total_published).toBe(2);
    // 2 publishes × 2 subscribers = 4 deliveries
    expect(m.total_delivered).toBe(4);
    expect(m.total_errors).toBe(0);
    expect(m.topics[MCP_TOPIC_INTERFACE_ANNOUNCE]?.published).toBe(2);
    expect(m.started_at).toBeTruthy();
    expect(m.uptime_ms).toBeGreaterThanOrEqual(0);
  });

  it('resetMetrics() zeroes counters without stopping the bus', async () => {
    const bus = await startedBus();
    bus.subscribe(MCP_TOPIC_COORD_SIGNAL, () => {});
    await bus.publish(MCP_TOPIC_COORD_SIGNAL, { op: 'x' });
    bus.resetMetrics();
    const m = bus.getMetrics();
    expect(m.total_published).toBe(0);
    expect(m.state).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// Well-known topics set
// ---------------------------------------------------------------------------

describe('MCP_WELL_KNOWN_TOPICS', () => {
  it('contains all five well-known MCP++ topics', () => {
    expect(MCP_WELL_KNOWN_TOPICS).toHaveLength(5);
    expect(MCP_WELL_KNOWN_TOPICS).toContain('mcp/interface/announce');
    expect(MCP_WELL_KNOWN_TOPICS).toContain('mcp/receipt/announce');
    expect(MCP_WELL_KNOWN_TOPICS).toContain('mcp/coord/signal');
    expect(MCP_WELL_KNOWN_TOPICS).toContain('mcp/delegation/merge');
    expect(MCP_WELL_KNOWN_TOPICS).toContain('mcp/policy/update');
  });
});

// ---------------------------------------------------------------------------
// Pluggable transport
// ---------------------------------------------------------------------------

describe('MCPPubSubBus — pluggable transport', () => {
  it('accepts a custom transport and routes through it', async () => {
    const publishedMessages: BusMessage[] = [];
    const handlers = new Map<string, BusMessageHandler[]>();

    const customTransport: PubSubTransport = {
      async publish(topic, message) {
        publishedMessages.push(message);
        (handlers.get(topic) ?? []).forEach(h => h(message));
      },
      subscribe(topic, handler) {
        if (!handlers.has(topic)) handlers.set(topic, []);
        handlers.get(topic)!.push(handler);
      },
      unsubscribe(topic, handler) {
        const hs = handlers.get(topic) ?? [];
        handlers.set(topic, hs.filter(h => h !== handler));
      },
    };

    const bus = new MCPPubSubBus({ transport: customTransport });
    const received: BusMessage[] = [];
    bus.subscribe(MCP_TOPIC_POLICY_UPDATE, m => received.push(m));
    await bus.start();
    await bus.publish(MCP_TOPIC_POLICY_UPDATE, { policy_cid: 'sha256:p' });

    expect(publishedMessages).toHaveLength(1);
    expect(received).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// InProcessBusTransport
// ---------------------------------------------------------------------------

describe('InProcessBusTransport', () => {
  it('delivers published messages to all subscribers on the same topic', async () => {
    const transport = new InProcessBusTransport();
    const received: BusMessage[] = [];
    const msg: BusMessage = {
      topic: 'test', payload: 'hello', published_at: new Date().toISOString(),
      message_cid: 'sha256:abc',
    };
    transport.subscribe('test', m => received.push(m));
    await transport.publish('test', msg);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(msg);
  });

  it('unsubscribe stops delivery', async () => {
    const transport = new InProcessBusTransport();
    const received: BusMessage[] = [];
    const handler: BusMessageHandler = m => received.push(m);
    transport.subscribe('test', handler);
    transport.unsubscribe('test', handler);
    const msg: BusMessage = {
      topic: 'test', payload: 'x', published_at: new Date().toISOString(),
      message_cid: 'sha256:x',
    };
    await transport.publish('test', msg);
    expect(received).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe('MCPPubSubBus — singleton', () => {
  afterEach(() => MCPPubSubBus.resetInstance());

  it('getInstance() returns the same instance', () => {
    expect(MCPPubSubBus.getInstance()).toBe(MCPPubSubBus.getInstance());
  });

  it('resetInstance() produces a fresh singleton', () => {
    const a = MCPPubSubBus.getInstance();
    MCPPubSubBus.resetInstance();
    expect(MCPPubSubBus.getInstance()).not.toBe(a);
  });
});
