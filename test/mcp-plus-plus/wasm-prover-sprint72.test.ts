/**
 * wasm-prover-sprint72.test.ts
 * Tests for Sprint 72 deferred TODO completions:
 *   - storage/cache/cache-manager.ts  (LRU eviction, TTL sweep, getStats)
 *   - core/execution.ts               (typed ExecutionEngine, all backend stubs)
 *   - vector/faiss-index.ts           (L2/cosine/innerproduct search, update semantics)
 *   - connectors/data-lake.ts         (connect, partitionForQuery, getPartitionData, disconnect)
 */

import { CacheManager } from '../../src/storage/cache/cache-manager';
import { ExecutionEngine, ModelData, TensorData } from '../../src/core/execution';
import { FAISSVectorIndex } from '../../src/vector/faiss-index';
import { GraphRAGDataLakeConnector } from '../../src/connectors/data-lake';

// ---------------------------------------------------------------------------
// CacheManager — T-328
// ---------------------------------------------------------------------------
describe('CacheManager.get / set / delete', () => {
  it('stores and retrieves a value', () => {
    const c = new CacheManager({ cleanupIntervalMs: 0 });
    c.set('k', 42);
    expect(c.get<number>('k')).toBe(42);
  });

  it('returns undefined for missing key', () => {
    const c = new CacheManager({ cleanupIntervalMs: 0 });
    expect(c.get('missing')).toBeUndefined();
  });

  it('expires entries after TTL', async () => {
    const c = new CacheManager({ cleanupIntervalMs: 0 });
    c.set('k', 'val', 50);
    expect(c.get('k')).toBe('val');
    await new Promise(r => setTimeout(r, 80));
    expect(c.get('k')).toBeUndefined();
  });

  it('delete removes an entry', () => {
    const c = new CacheManager({ cleanupIntervalMs: 0 });
    c.set('x', 1);
    expect(c.delete('x')).toBe(true);
    expect(c.get('x')).toBeUndefined();
  });
});

describe('CacheManager LRU eviction', () => {
  it('evicts the least-recently-used entry when maxSize is reached', async () => {
    const c = new CacheManager({ maxSize: 2, cleanupIntervalMs: 0 });
    c.set('a', 1);
    await new Promise(r => setTimeout(r, 5)); // ensure different timestamps
    c.set('b', 2);
    c.get('a'); // access 'a' to make it more-recently used
    c.set('c', 3); // should evict 'b' (LRU)
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
    expect(c.get('b')).toBeUndefined();
  });

  it('getSize stays within maxSize', () => {
    const c = new CacheManager({ maxSize: 3, cleanupIntervalMs: 0 });
    for (let i = 0; i < 10; i++) c.set(`k${i}`, i);
    expect(c.getSize()).toBeLessThanOrEqual(3);
  });
});

describe('CacheManager.getStats', () => {
  it('tracks hits and misses', () => {
    const c = new CacheManager({ cleanupIntervalMs: 0 });
    c.set('k', 'v');
    c.get('k');      // hit
    c.get('miss');   // miss
    const s = c.getStats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.hitRate).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// ExecutionEngine — T-329
// ---------------------------------------------------------------------------
describe('ExecutionEngine', () => {
  const cpuBackend = { id: 'cpu', name: 'CPU (JavaScript)', priority: 3, isAvailable: true, capabilities: [] };
  const wasmBackend = { id: 'wasm', name: 'WebAssembly', priority: 2, isAvailable: true, capabilities: ['simd'] };
  const gpuBackend  = { id: 'webgpu', name: 'WebGPU', priority: 0, isAvailable: true, capabilities: ['fp32', 'fp16'] };

  const model: ModelData = { id: 'test-model', config: { layers: 4 } };
  const input: TensorData = { shape: [1, 4], data: new Float32Array([1, 2, 3, 4]) };

  it('executes on CPU backend and returns TensorData', async () => {
    const engine = new ExecutionEngine(cpuBackend, model);
    const output = await engine.execute(input);
    expect(output.shape).toEqual(input.shape);
    expect(output.data).toHaveLength(input.data.length);
  });

  it('executes on WASM backend (stub)', async () => {
    const engine = new ExecutionEngine(wasmBackend, model);
    const output = await engine.execute(input);
    expect(output.shape).toEqual(input.shape);
  });

  it('executes on WebGPU backend (stub)', async () => {
    const engine = new ExecutionEngine(gpuBackend, model);
    const output = await engine.execute(input);
    expect(output.shape).toEqual(input.shape);
  });

  it('throws if model not initialized', async () => {
    // Bypass constructor by creating then corrupting internal state — use CPU backend
    const engine = new ExecutionEngine(cpuBackend, model);
    (engine as unknown as Record<string, unknown>)['model'] = null;
    await expect(engine.execute(input)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FAISSVectorIndex — T-330
// ---------------------------------------------------------------------------
function makeVec(dim: number, ...vals: number[]): Float32Array {
  const v = new Float32Array(dim);
  vals.forEach((x, i) => (v[i] = x));
  return v;
}

describe('FAISSVectorIndex — L2 metric', () => {
  it('finds nearest neighbor', async () => {
    const idx = new FAISSVectorIndex({ dimensions: 3, metric: 'l2' });
    await idx.add('a', makeVec(3, 1, 0, 0));
    await idx.add('b', makeVec(3, 0, 1, 0));
    await idx.add('c', makeVec(3, 0, 0, 1));
    const results = await idx.search(makeVec(3, 1, 0, 0), 1);
    expect(results[0]!.id).toBe('a');
    expect(results[0]!.score).toBeCloseTo(0, 5);
  });

  it('returns at most k results', async () => {
    const idx = new FAISSVectorIndex({ dimensions: 2, metric: 'l2' });
    for (let i = 0; i < 5; i++) await idx.add(`v${i}`, makeVec(2, i, 0));
    const results = await idx.search(makeVec(2, 0, 0), 3);
    expect(results.length).toBe(3);
  });
});

describe('FAISSVectorIndex — cosine metric', () => {
  it('ranks same-direction vector highest', async () => {
    const idx = new FAISSVectorIndex({ dimensions: 3, metric: 'cosine' });
    await idx.add('same',  makeVec(3, 1, 0, 0));
    await idx.add('ortho', makeVec(3, 0, 1, 0));
    const results = await idx.search(makeVec(3, 1, 0, 0), 2);
    expect(results[0]!.id).toBe('same');
    expect(results[0]!.score).toBeCloseTo(1, 5);
  });
});

describe('FAISSVectorIndex — innerproduct metric', () => {
  it('ranks highest dot-product first', async () => {
    const idx = new FAISSVectorIndex({ dimensions: 2, metric: 'innerproduct' });
    await idx.add('big',   makeVec(2, 10, 0));
    await idx.add('small', makeVec(2, 1, 0));
    const results = await idx.search(makeVec(2, 1, 0), 2);
    expect(results[0]!.id).toBe('big');
  });
});

describe('FAISSVectorIndex — update / remove / count / clear', () => {
  it('update (re-add same ID) replaces the vector', async () => {
    const idx = new FAISSVectorIndex({ dimensions: 2, metric: 'l2' });
    await idx.add('x', makeVec(2, 10, 0));
    await idx.add('x', makeVec(2, 0, 0)); // update
    expect(await idx.count()).toBe(1);
    const r = await idx.search(makeVec(2, 0, 0), 1);
    expect(r[0]!.score).toBeCloseTo(0, 5);
  });

  it('remove returns false for unknown id', async () => {
    const idx = new FAISSVectorIndex({ dimensions: 2, metric: 'l2' });
    expect(await idx.remove('nonexistent')).toBe(false);
  });

  it('clear empties the index', async () => {
    const idx = new FAISSVectorIndex({ dimensions: 2, metric: 'l2' });
    await idx.add('a', makeVec(2, 1, 0));
    await idx.clear();
    expect(await idx.count()).toBe(0);
  });

  it('throws on dimension mismatch', async () => {
    const idx = new FAISSVectorIndex({ dimensions: 3, metric: 'l2' });
    await expect(idx.add('bad', makeVec(2, 1, 0))).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GraphRAGDataLakeConnector — T-331
// ---------------------------------------------------------------------------
describe('GraphRAGDataLakeConnector', () => {
  it('connect() returns true with default stub', async () => {
    const conn = new GraphRAGDataLakeConnector({});
    expect(await conn.connect()).toBe(true);
  });

  it('partitionForQuery returns DataPartition array', async () => {
    const conn = new GraphRAGDataLakeConnector({});
    await conn.connect();
    const parts = await conn.partitionForQuery('find legal obligations');
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.length).toBeGreaterThan(0);
    expect(typeof parts[0]!.id).toBe('string');
  });

  it('getPartitionData returns content for a partition id', async () => {
    const conn = new GraphRAGDataLakeConnector({});
    await conn.connect();
    const data = await conn.getPartitionData('part1') as Record<string, unknown>;
    expect(data).not.toBeNull();
  });

  it('disconnect can be called without error', async () => {
    const conn = new GraphRAGDataLakeConnector({});
    await conn.connect();
    await expect(conn.disconnect()).resolves.not.toThrow();
  });

  it('uses injected GraphRAGDatabase', async () => {
    let called = false;
    const db = {
      initialize:        async () => {},
      generateEmbedding: async (_: string) => { called = true; return [1, 2]; },
      findRelevantNodes: async (_: number[]) => [{ id: 'custom', locationHint: 'n1' }],
    };
    const conn = new GraphRAGDataLakeConnector({}, db);
    const parts = await conn.partitionForQuery('test');
    expect(called).toBe(true);
    expect(parts[0]!.id).toBe('custom');
  });
});
