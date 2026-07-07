/**
 * WASM Prover Sprint 19 — Logic Monitor + Submodule Registry + Batch Processor.
 *
 * Tasks:
 *   T-100: LogicMonitor (logic-monitor.ts)
 *   T-101: LogicSubmoduleRegistry (submodule-registry.ts)
 *   T-102: BatchProcessor (batch-processor.ts)
 *   T-103: ≥10 tests
 *
 * Sprint 19 (Phase 19 — Logic Monitor + Submodule Registry + Batch Processor, P2).
 * Reference: ipfs_datasets_py/logic/monitoring.py + submodule_registry.py + batch_processing.py
 */

import { LogicMonitor } from '../../src/services/logic/shared/logic-monitor.js';
import type { HealthStatus } from '../../src/services/logic/shared/logic-monitor.js';
import {
  getSubmoduleSpecs, getSubmoduleSpec, getSubmoduleNames,
  getIntegrationManifest,
} from '../../src/services/platform/submodule-registry.js';
import { BatchProcessor, successRate } from '../../src/services/logic/api/batch-processor.js';

// ---------------------------------------------------------------------------
// T-100: LogicMonitor
// ---------------------------------------------------------------------------

describe('T-100 LogicMonitor', () => {
  let monitor: LogicMonitor;
  beforeEach(() => {
    LogicMonitor.resetInstance();
    monitor = new LogicMonitor();
  });
  afterEach(() => LogicMonitor.resetInstance());

  it('trackOperation records success and duration', async () => {
    await monitor.trackOperation('fol_conversion', async () => 'result');
    const metrics = monitor.getMetrics();
    expect(metrics.operations['fol_conversion']).toBeDefined();
    expect(metrics.operations['fol_conversion']!.total_count).toBe(1);
    expect(metrics.operations['fol_conversion']!.success_count).toBe(1);
    expect(metrics.operations['fol_conversion']!.success_rate).toBe(1.0);
  });

  it('trackOperation records failure on thrown error', async () => {
    await expect(
      monitor.trackOperation('z3_proof', async () => { throw new Error('z3 unavailable'); }),
    ).rejects.toThrow();
    const metrics = monitor.getMetrics();
    expect(metrics.operations['z3_proof']!.failure_count).toBe(1);
    expect(metrics.operations['z3_proof']!.success_rate).toBe(0);
  });

  it('trackSync records synchronous operation', () => {
    monitor.trackSync('predicate_extract', () => 'done');
    const metrics = monitor.getMetrics();
    expect(metrics.operations['predicate_extract']!.total_count).toBe(1);
    expect(metrics.operations['predicate_extract']!.success_count).toBe(1);
  });

  it('recordError adds to error list', () => {
    monitor.recordError('z3', 'WASM init failed');
    const metrics = monitor.getMetrics();
    expect(metrics.errors).toHaveLength(1);
    expect(metrics.errors[0].category).toBe('z3');
    expect(metrics.errors[0].message).toBe('WASM init failed');
  });

  it('getHealthStatus returns healthy when all operations succeed', async () => {
    await monitor.trackOperation('op', async () => 'ok');
    const health = monitor.getHealthStatus();
    expect(health.status).toBe('healthy');
    expect(health.operations['op']).toBeDefined();
  });

  it('getHealthStatus returns degraded when success rate is low', async () => {
    for (let i = 0; i < 3; i++) {
      await monitor.trackOperation('flaky', async () => { throw new Error('fail'); }).catch(() => {});
    }
    await monitor.trackOperation('flaky', async () => 'ok');
    const health = monitor.getHealthStatus();
    expect(['degraded', 'unhealthy']).toContain(health.status);
  });

  it('resetMetrics clears all counters', async () => {
    await monitor.trackOperation('op', async () => 'ok');
    monitor.resetMetrics();
    const metrics = monitor.getMetrics();
    expect(Object.values(metrics.operations).every(m => m.total_count === 0)).toBe(true);
  });

  it('getMetrics.total_calls counts across operations', async () => {
    await monitor.trackOperation('a', async () => 1);
    await monitor.trackOperation('b', async () => 2);
    await monitor.trackOperation('a', async () => 3);
    const metrics = monitor.getMetrics();
    expect(metrics.total_calls).toBe(3);
  });

  it('getInstance returns the same singleton', () => {
    const a = LogicMonitor.getInstance();
    const b = LogicMonitor.getInstance();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// T-101: LogicSubmoduleRegistry
// ---------------------------------------------------------------------------

describe('T-101 LogicSubmoduleRegistry', () => {
  it('getSubmoduleSpecs returns ≥15 specs', () => {
    const specs = getSubmoduleSpecs();
    expect(specs.length).toBeGreaterThanOrEqual(15);
  });

  it('all implemented specs have required fields', () => {
    for (const spec of getSubmoduleSpecs()) {
      expect(typeof spec.name).toBe('string');
      expect(typeof spec.description).toBe('string');
      expect(Array.isArray(spec.roles)).toBe(true);
      expect(Array.isArray(spec.capabilities)).toBe(true);
      expect(typeof spec.sprint).toBe('number');
    }
  });

  it('getSubmoduleSpec returns correct spec by name', () => {
    const spec = getSubmoduleSpec('z3-wasm');
    expect(spec).toBeDefined();
    expect(spec!.name).toBe('z3-wasm');
    expect(spec!.roles).toContain('prover');
    expect(spec!.sprint).toBe(1);
  });

  it('getSubmoduleSpec returns undefined for unknown name', () => {
    expect(getSubmoduleSpec('nonexistent')).toBeUndefined();
  });

  it('getSubmoduleNames returns all names', () => {
    const names = getSubmoduleNames();
    expect(names).toContain('z3-wasm');
    expect(names).toContain('dcec-native');
    expect(names).toContain('tdfol-native');
    expect(names).toContain('legal-norm-ir');
    expect(names).toContain('prover-syntax');
  });

  it('getSubmoduleNames filtered by status', () => {
    const implemented = getSubmoduleNames({ status: 'implemented' });
    const stubs = getSubmoduleNames({ status: 'stub' });
    const partial = getSubmoduleNames({ status: 'partial' });
    expect(implemented.length).toBeGreaterThan(0);
    expect(stubs).not.toContain('lurk-wasm');
    expect(partial).toContain('lurk-wasm');
    expect(partial).toContain('multi-stark');
  });

  it('getIntegrationManifest has required top-level fields', () => {
    const manifest = getIntegrationManifest();
    expect(typeof manifest['version']).toBe('string');
    expect(typeof manifest['total']).toBe('number');
    expect(typeof manifest['implemented']).toBe('number');
    expect(typeof manifest['entries']).toBe('object');
    expect((manifest['total'] as number)).toBeGreaterThanOrEqual(15);
  });

  it('getIntegrationManifest.entries contains z3-wasm', () => {
    const manifest = getIntegrationManifest();
    const entries = manifest['entries'] as Record<string, unknown>;
    expect(entries['z3-wasm']).toBeDefined();
    expect((entries['z3-wasm'] as Record<string, unknown>)['status']).toBe('implemented');
  });
});

// ---------------------------------------------------------------------------
// T-102: BatchProcessor
// ---------------------------------------------------------------------------

describe('T-102 BatchProcessor', () => {
  it('process() returns correct counts on all-success batch', async () => {
    const items = [1, 2, 3, 4, 5];
    const result = await BatchProcessor.process(items, async n => n * 2);
    expect(result.total_items).toBe(5);
    expect(result.successful).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(5);
    expect(result.errors).toHaveLength(0);
    expect(successRate(result)).toBe(1.0);
  });

  it('process() records failures for throwing items', async () => {
    const items = ['ok', 'fail', 'ok'];
    const result = await BatchProcessor.process(items, async s => {
      if (s === 'fail') throw new Error('boom');
      return s.toUpperCase();
    });
    expect(result.successful).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors[0].error).toContain('boom');
    expect(successRate(result)).toBeCloseTo(2 / 3, 5);
  });

  it('process() respects concurrency limit', async () => {
    let concurrent = 0; let maxConcurrent = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await BatchProcessor.process(items, async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent--;
    }, { concurrency: 3 });
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('process() calls onProgress for each item', async () => {
    const progress: number[] = [];
    await BatchProcessor.process([1, 2, 3], async n => n, {
      onProgress: (done, total) => progress.push(done),
    });
    expect(progress).toEqual([1, 2, 3]);
  });

  it('process() returns items_per_second ≥ 0 and total_time_ms ≥ 0', async () => {
    const result = await BatchProcessor.process([1, 2], async n => n);
    // items_per_second may be 0 when elapsed_ms is 0 (instant on fast machines)
    expect(result.items_per_second).toBeGreaterThanOrEqual(0);
    expect(result.total_time_ms).toBeGreaterThanOrEqual(0);
    expect(result.successful).toBe(2);
  });

  it('processSerial() processes items in order', async () => {
    const order: number[] = [];
    await BatchProcessor.processSerial([3, 1, 2], async n => {
      order.push(n); return n;
    });
    expect(order).toEqual([3, 1, 2]);
  });

  it('process() handles empty array', async () => {
    const result = await BatchProcessor.process([], async n => n);
    expect(result.total_items).toBe(0);
    expect(result.successful).toBe(0);
    expect(successRate(result)).toBe(0);
  });
});
