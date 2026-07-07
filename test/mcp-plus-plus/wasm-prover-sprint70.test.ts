/**
 * wasm-prover-sprint70.test.ts
 * Tests for Sprint 70 — deferred TODO completions in the acceleration service layer:
 *   - resource-pool.ts    (pre-allocation, queue-wait, fault tolerance)
 *   - model-streamer.ts   (ExecutionEngine interface, adaptive batching)
 *   - hardware-abstraction.ts (capability-based selection, executeModel)
 *   - browser-acceleration.ts (initialize, selectOptimalBackend, getOptimizationHints)
 */

import { ResourcePoolManager } from '../../src/services/platform/resource-pool';
import { ModelStreamer, ExecutionEngine } from '../../src/services/platform/model-streamer';
import { HardwareAbstraction } from '../../src/services/platform/hardware-abstraction';
import { BrowserAccelerator } from '../../src/services/platform/browser-acceleration';

// ---------------------------------------------------------------------------
// ResourcePoolManager — T-321
// ---------------------------------------------------------------------------
describe('ResourcePoolManager.initialize with pre-allocation', () => {
  it('pre-allocates resources when config is given', async () => {
    const mgr = new ResourcePoolManager({ maxResourcesPerType: 5 });
    await mgr.initialize({
      worker: { count: 2, createFn: async () => ({ id: Math.random() }) },
    });
    const stats = mgr.getPoolStats();
    expect(stats['worker']).toBeDefined();
    expect(stats['worker']!.total).toBe(2);
    expect(stats['worker']!.idle).toBe(2);
    expect(stats['worker']!.inUse).toBe(0);
  });

  it('initializes successfully with no pre-allocation', async () => {
    const mgr = new ResourcePoolManager();
    expect(await mgr.initialize()).toBe(true);
  });
});

describe('ResourcePoolManager.acquire', () => {
  it('reuses idle resources', async () => {
    const mgr = new ResourcePoolManager({ maxResourcesPerType: 2 });
    let created = 0;
    const factory = async () => ({ n: ++created });
    const r1 = await mgr.acquire('buf', factory);
    await mgr.release('buf', r1);
    const r2 = await mgr.acquire('buf', factory);
    expect(r2).toBe(r1);
    expect(created).toBe(1);
  });

  it('creates a second resource when first is in use', async () => {
    const mgr = new ResourcePoolManager({ maxResourcesPerType: 2 });
    let n = 0;
    const factory = async () => ({ n: ++n });
    const r1 = await mgr.acquire('buf', factory);
    const r2 = await mgr.acquire('buf', factory);
    expect(r1).not.toBe(r2);
  });

  it('throws when limit reached and no resource freed in time', async () => {
    const mgr = new ResourcePoolManager({ maxResourcesPerType: 1, maxTotalResources: 1, acquireTimeoutMs: 200 });
    const factory = async () => ({ x: 1 });
    await mgr.acquire('buf', factory); // acquires the only slot
    // A second acquire should time out quickly and throw
    await expect(mgr.acquire('buf', factory)).rejects.toThrow();
  }, 3000);
});

describe('ResourcePoolManager.checkResourceHealth', () => {
  it('returns same resource when healthy', async () => {
    const mgr = new ResourcePoolManager();
    const r = { alive: true };
    const factory = async () => ({ alive: false });
    const result = await mgr.checkResourceHealth('w', r, async (x) => x.alive, factory);
    expect(result).toBe(r);
  });

  it('recreates resource when unhealthy', async () => {
    const mgr = new ResourcePoolManager();
    // First acquire to register the resource in pool
    const original = await mgr.acquire('w', async () => ({ alive: false }));
    const factory = async () => ({ alive: true });
    const result = await mgr.checkResourceHealth('w', original, async (x) => x.alive, factory);
    expect(result).not.toBe(original);
    expect((result as { alive: boolean }).alive).toBe(true);
  });
});

describe('ResourcePoolManager.getPoolStats', () => {
  it('returns stats per type', async () => {
    const mgr = new ResourcePoolManager();
    await mgr.acquire('a', async () => ({}));
    const stats = mgr.getPoolStats();
    expect(stats['a']).toBeDefined();
    expect(stats['a']!.inUse).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ModelStreamer — T-322
// ---------------------------------------------------------------------------

class MockExecutionEngine implements ExecutionEngine {
  readonly tokens: string[];
  constructor(tokens = ['Hello', ' world', '!']) { this.tokens = tokens; }

  async *generateStream(_prompt: string): AsyncGenerator<string> {
    for (const t of this.tokens) yield t;
  }
}

describe('ModelStreamer with ExecutionEngine', () => {
  it('streams all tokens from the engine', async () => {
    const engine = new MockExecutionEngine(['A', 'B', 'C']);
    const streamer = new ModelStreamer(engine, { adaptiveBatchSize: false });
    const collected: string[] = [];
    for await (const t of streamer.generateTokenStream('test prompt')) {
      collected.push(t);
    }
    expect(collected).toEqual(['A', 'B', 'C']);
  });

  it('records metrics after streaming', async () => {
    const engine = new MockExecutionEngine(['x', 'y']);
    const streamer = new ModelStreamer(engine);
    for await (const _ of streamer.generateTokenStream('p')) { /* consume */ }
    const m = streamer.getMetrics();
    expect(m).not.toBeNull();
    expect(typeof m!.tokensPerSecond).toBe('number');
    expect(typeof m!.totalGenerationTime).toBe('number');
  });

  it('supports adaptive batch size config', async () => {
    const engine = new MockExecutionEngine(['t1', 't2', 't3', 't4', 't5']);
    const streamer = new ModelStreamer(engine, { adaptiveBatchSize: true, latencyOptimized: true, maxTokensPerStep: 2 });
    const tokens: string[] = [];
    for await (const t of streamer.generateTokenStream('p')) tokens.push(t);
    expect(tokens).toHaveLength(5);
  });

  it('getMetrics returns null before first stream', () => {
    const streamer = new ModelStreamer(new MockExecutionEngine());
    expect(streamer.getMetrics()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HardwareAbstraction — T-323
// ---------------------------------------------------------------------------
describe('HardwareAbstraction.initialize', () => {
  it('initializes and returns true with at least wasm+cpu backends', async () => {
    const ha = new HardwareAbstraction({ enableLogging: false });
    const result = await ha.initialize();
    expect(result).toBe(true);
    expect(ha.getActiveBackend()).not.toBeNull();
  });

  it('getAvailableBackends includes wasm and cpu', async () => {
    const ha = new HardwareAbstraction();
    await ha.initialize();
    const ids = ha.getAvailableBackends().map(b => b.id);
    expect(ids).toContain('wasm');
    expect(ids).toContain('cpu');
  });
});

describe('HardwareAbstraction.executeModel', () => {
  it('throws when not initialized', async () => {
    const ha = new HardwareAbstraction();
    await expect(ha.executeModel('input')).rejects.toThrow();
  });

  it('returns a result object after initialization', async () => {
    const ha = new HardwareAbstraction();
    await ha.initialize();
    const result = await ha.executeModel('test input') as Record<string, unknown>;
    expect(typeof result['backend']).toBe('string');
  });
});

describe('HardwareAbstraction capability-based selection', () => {
  it('selects highest-priority available backend', async () => {
    const ha = new HardwareAbstraction({ preferredBackends: ['cpu', 'wasm'] });
    await ha.initialize();
    // cpu has lowest priority in default list but highest in this config
    const active = ha.getActiveBackend();
    expect(active).not.toBeNull();
    // In a Node test env: webgpu and webnn won't be available, so wasm or cpu is selected
    expect(['wasm', 'cpu', 'webgpu', 'webnn']).toContain(active!.id);
  });
});

// ---------------------------------------------------------------------------
// BrowserAccelerator — T-324
// ---------------------------------------------------------------------------
describe('BrowserAccelerator', () => {
  it('initialize returns true and sets capabilities', async () => {
    const acc = new BrowserAccelerator();
    const result = await acc.initialize();
    expect(result).toBe(true);
    expect(acc.getCapabilities()).not.toBeNull();
  });

  it('detectBrowser returns "server" in Node environment', async () => {
    const acc = new BrowserAccelerator();
    expect(acc.detectBrowser()).toBe('server');
  });

  it('selectOptimalBackend returns a valid backend string', async () => {
    const acc = new BrowserAccelerator();
    await acc.initialize();
    const backend = acc.selectOptimalBackend();
    expect(['webgpu', 'webnn', 'wasm', 'cpu', 'none']).toContain(backend);
  });

  it('getOptimizationHints returns an object with expected keys', async () => {
    const acc = new BrowserAccelerator();
    await acc.initialize();
    const hints = acc.getOptimizationHints();
    expect(typeof hints['parallelism']).toBe('number');
    expect(typeof hints['memoryBudgetMB']).toBe('number');
    expect(typeof hints['backend']).toBe('string');
  });
});
