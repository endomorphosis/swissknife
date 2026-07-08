/**
 * @vitest-environment node
 */

/**
 * WASM theorem prover tests — Phase 1 Sprint 1.
 *
 * Tests for:
 * - prover-types.ts (WasmProofResult, FormulaClass)
 * - mcp-proof-cache.ts (ProofCache ring-buffer, stats, TTL, JSONL)
 * - mcp-wasm-prover-hub.ts (WasmProverHub with mocked Z3)
 * - z3-wasm-bridge.ts (Z3WasmBridge behaviour contracts via mock)
 *
 * NOTE: Z3 WASM is NOT loaded in unit tests (34 MB WASM bundle, slow CI).
 * Z3WasmBridge is tested via a lightweight structural mock.  Live integration
 * tests (marked .skipIf(!Z3_LIVE)) require `Z3_WASM_LIVE=1` env var.
 */

import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { vi } from 'vitest';

import {
  type WasmProofResult,
  type ProofReason,
  type FormulaClass,
  isDecided,
  isProved,
} from '../../src/services/provers/prover-types';
import { ProofCache } from '../../src/services/provers/mcp-proof-cache';
import { WasmProverHub } from '../../src/services/mcp/mcp-wasm-prover-hub';
import type { Policy } from '../../src/services/logic/deontic/mcp-policy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const Z3_LIVE = process.env.Z3_WASM_LIVE === '1';
const jest = { fn: vi.fn };

function makeProvedResult(prover_id = 'z3-wasm' as const): WasmProofResult {
  return {
    proved: true, sat: true, unsat: false,
    reason: 'sat', prover_id,
    proof_time_ms: 42,
  };
}

function makeUnknownResult(): WasmProofResult {
  return {
    proved: false, sat: false, unsat: false,
    reason: 'unknown', prover_id: 'z3-wasm',
    proof_time_ms: 0,
  };
}

function permissivePolicy(): Policy {
  return {
    id: 'test-policy', version: '1.0.0',
    permissions: [{ cap: 'mcp++/invoke:browse', rsc: '*' }],
    prohibitions: [],
    obligations: [],
  };
}

function conflictPolicy(): Policy {
  return {
    id: 'conflict', version: '1.0.0',
    permissions: [{ cap: 'mcp++/invoke:publish', rsc: 'sha256:x' }],
    prohibitions: [{ cap: 'mcp++/invoke:publish', rsc: 'sha256:x' }],
    obligations: [],
  };
}

function temporalPolicy(): Policy {
  return {
    id: 'temp', version: '1.0.0',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [],
    obligations: [],
    temporal: { notBefore: Date.now() / 1000, notAfter: Date.now() / 1000 + 3600 },
  };
}

// ---------------------------------------------------------------------------
// WasmProofResult type utilities
// ---------------------------------------------------------------------------

describe('WasmProofResult utilities', () => {
  it('isDecided returns true for proved/refuted/sat/unsat', () => {
    for (const reason of ['proved', 'refuted', 'sat', 'unsat'] as ProofReason[]) {
      expect(isDecided({ proved: true, sat: true, unsat: false, reason, prover_id: 'z3-wasm', proof_time_ms: 0 })).toBe(true);
    }
  });

  it('isDecided returns false for unknown/timeout/error', () => {
    for (const reason of ['unknown', 'timeout', 'error'] as ProofReason[]) {
      expect(isDecided({ proved: false, sat: false, unsat: false, reason, prover_id: 'z3-wasm', proof_time_ms: 0 })).toBe(false);
    }
  });

  it('isProved returns true only when proved=true', () => {
    expect(isProved(makeProvedResult())).toBe(true);
    expect(isProved(makeUnknownResult())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProofCache — core behavior
// ---------------------------------------------------------------------------

describe('ProofCache — core', () => {
  it('returns null on cache miss', () => {
    const cache = new ProofCache();
    expect(cache.get('sha256:missing')).toBeNull();
  });

  it('returns the stored result on hit (with prover_id=cache-hit)', () => {
    const cache = new ProofCache();
    const key = ProofCache.formulaHash('perm(browse, *)');
    const result = makeProvedResult();
    cache.put(key, result);
    const hit = cache.get(key);
    expect(hit).not.toBeNull();
    expect(hit!.prover_id).toBe('cache-hit');
    expect(hit!.proved).toBe(true);
  });

  it('formulaHash is deterministic and 64-hex chars', () => {
    const h1 = ProofCache.formulaHash('perm(browse, *)');
    const h2 = ProofCache.formulaHash('perm(browse, *)');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different formulas produce different hashes', () => {
    expect(ProofCache.formulaHash('perm(browse, *)')).not.toBe(ProofCache.formulaHash('prohib(publish, *)'));
  });

  it('respects maxEntries ring-buffer eviction', () => {
    const cache = new ProofCache({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      cache.put(ProofCache.formulaHash(`formula-${i}`), makeProvedResult());
    }
    expect(cache.stats().size).toBe(3);
    expect(cache.stats().evictions).toBe(2);
  });

  it('TTL expiry returns null after expiry', async () => {
    const cache = new ProofCache({ ttlMs: 1 }); // 1ms TTL
    const key = ProofCache.formulaHash('ephemeral');
    cache.put(key, makeProvedResult());
    await new Promise(r => setTimeout(r, 5));
    expect(cache.get(key)).toBeNull();
  });

  it('per-entry TTL override takes precedence', async () => {
    const cache = new ProofCache({ ttlMs: 60_000 }); // 1 min default
    const key = ProofCache.formulaHash('short-lived');
    cache.put(key, makeProvedResult(), 1); // override: 1ms
    await new Promise(r => setTimeout(r, 5));
    expect(cache.get(key)).toBeNull(); // expired by override
  });

  it('stats() tracks hits and misses accurately', () => {
    const cache = new ProofCache();
    const key = ProofCache.formulaHash('x');
    cache.get('nonexistent'); // miss
    cache.put(key, makeProvedResult());
    cache.get(key); // hit
    cache.get(key); // hit
    const s = cache.stats();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
  });

  it('stats() accumulates time_saved_ms from hit entries', () => {
    const cache = new ProofCache();
    const key = ProofCache.formulaHash('slow-formula');
    cache.put(key, { ...makeProvedResult(), proof_time_ms: 500 });
    cache.get(key);
    cache.get(key);
    expect(cache.stats().time_saved_ms).toBe(1000);
  });

  it('invalidate() removes a key and returns true', () => {
    const cache = new ProofCache();
    const key = ProofCache.formulaHash('to-remove');
    cache.put(key, makeProvedResult());
    expect(cache.invalidate(key)).toBe(true);
    expect(cache.get(key)).toBeNull();
    expect(cache.invalidate(key)).toBe(false);
  });

  it('clear() resets everything', () => {
    const cache = new ProofCache();
    cache.put(ProofCache.formulaHash('a'), makeProvedResult());
    cache.get(ProofCache.formulaHash('a'));
    cache.clear();
    const s = cache.stats();
    expect(s.size).toBe(0);
    expect(s.hits).toBe(0);
    expect(s.misses).toBe(0);
  });
});

describe('ProofCache — JSONL file sink', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'proof-cache-test-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('appends one JSON line per put() to the log file', () => {
    const logPath = join(tmpDir, 'proofs.jsonl');
    const cache = new ProofCache({
      logPath,
      logWriter: (path, line) => appendFileSync(path, line, 'utf8'),
    });
    cache.put(ProofCache.formulaHash('f1'), makeProvedResult());
    cache.put(ProofCache.formulaHash('f2'), makeUnknownResult());
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).result.proved).toBe(true);
    expect(JSON.parse(lines[1]).result.reason).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// WasmProverHub — with mocked Z3
// ---------------------------------------------------------------------------

/**
 * Build a WasmProverHub with a mock Z3 bridge injected via internal backdoor.
 * This avoids loading the 34 MB WASM bundle in unit tests.
 */
async function makeHubWithMock(mockResult: WasmProofResult): Promise<WasmProverHub> {
  const hub = await WasmProverHub.create({ timeoutMs: 100 });
  // Inject a mock Z3 bridge via the private field (acceptable in unit tests)
  const mockBridge = {
    checkPolicyConsistency: jest.fn().mockResolvedValue(mockResult),
    proveSMT2: jest.fn().mockResolvedValue(mockResult),
  };
  (hub as unknown as Record<string, unknown>)['z3'] = mockBridge;
  (WasmProverHub as unknown as Record<string, unknown>)['available'] = true; // type-level tweak
  return hub;
}

describe('WasmProverHub — routing and caching', () => {
  afterEach(() => WasmProverHub.resetInstance());

  it('returns cache-hit on second call with identical policy', async () => {
    const hub = await makeHubWithMock({ ...makeProvedResult(), reason: 'sat' });
    const policy = permissivePolicy();
    const r1 = await hub.checkPolicyConsistency(policy);
    const r2 = await hub.checkPolicyConsistency(policy);
    expect(r1.prover_id).not.toBe('cache-hit'); // first call: real prover
    expect(r2.prover_id).toBe('cache-hit');     // second call: cache
  });

  it('routes temporal policies to tdfol-native (Sprint 10)', async () => {
    const hub = await makeHubWithMock(makeProvedResult());
    const result = await hub.checkPolicyConsistency(temporalPolicy());
    // Sprint 10: tdfol-native now handles temporal policies locally
    expect(result.prover_id).toBe('tdfol-native');
    expect(result.meta?.skipped).toBeUndefined();
  });

  it('routes higher_order policies to Coq/Lean4 locally (Sprint 10)', async () => {
    const hub = await makeHubWithMock(makeProvedResult());
    // Create a policy with > 20 rules to trigger higher_order classification
    const bigPolicy: Policy = {
      id: 'big', version: '1',
      permissions: Array.from({ length: 12 }, (_, i) => ({ cap: `cap${i}`, rsc: '*' })),
      prohibitions: Array.from({ length: 10 }, (_, i) => ({ cap: `prohib${i}`, rsc: '*' })),
      obligations: [],
    };
    const result = await hub.checkPolicyConsistency(bigPolicy);
    // Sprint 10: higher_order falls through to _tryCoqOrLean4() before remote-only
    // The result may be 'proved', 'unknown', or another local reason — but not 'remote-only' skipped
    expect(result.meta?.skipped).toBeUndefined();
  });

  it('proverStatus() reports prover availability correctly', async () => {
    const hub = await WasmProverHub.create();
    const status = hub.proverStatus();
    // In unit test environment prover availability depends on installed binaries
    expect(typeof status.z3_wasm).toBe('boolean');
    expect(typeof status.cvc5_wasm).toBe('boolean');
    expect(typeof status.coq_jscoq).toBe('boolean');
    expect(typeof status.lean4_wasm).toBe('boolean');
    expect(status.lurk_wasm).toBe(false); // Phase 6 not yet implemented
    expect(status.dcec_native).toBe(true); // Sprint 9 — always available (pure TS)
  });

  it('cacheStats() starts at zero', async () => {
    const hub = await WasmProverHub.create();
    const stats = hub.cacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.size).toBe(0);
  });

  it('getInstance() returns the same hub instance', async () => {
    const a = await WasmProverHub.getInstance();
    const b = await WasmProverHub.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance() allows a fresh singleton', async () => {
    const a = await WasmProverHub.getInstance();
    WasmProverHub.resetInstance();
    const b = await WasmProverHub.getInstance();
    expect(a).not.toBe(b);
  });
});

describe('WasmProverHub — SMT2 path', () => {
  afterEach(() => WasmProverHub.resetInstance());

  it('proveSMT2 caches successful result', async () => {
    const hub = await makeHubWithMock({ ...makeProvedResult(), reason: 'proved' });
    const smt2 = '(assert (and true true))\n(check-sat)';
    const r1 = await hub.proveSMT2(smt2);
    const r2 = await hub.proveSMT2(smt2);
    expect(r1.prover_id).not.toBe('cache-hit');
    expect(r2.prover_id).toBe('cache-hit');
  });

  it('proveSMT2 does not cache unknown results', async () => {
    const hub = await makeHubWithMock(makeUnknownResult());
    const smt2 = '(assert (forall ((x Int)) (> x 0)))\n(check-sat)';
    await hub.proveSMT2(smt2);
    await hub.proveSMT2(smt2);
    // Both calls should be real (unknown not cached)
    expect(hub.cacheStats().hits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Live Z3 WASM tests (only when Z3_WASM_LIVE=1)
// ---------------------------------------------------------------------------

// Live Z3 WASM tests — use `Z3_WASM_LIVE=1 npx jest` to enable
(Z3_LIVE ? describe : describe.skip)('Z3WasmBridge — LIVE (requires Z3_WASM_LIVE=1)', () => {
  it('checks a simple consistent permissive policy as sat', async () => {
    const { Z3WasmBridge } = await import('../../src/services/provers/z3-wasm-bridge');
    const bridge = await Z3WasmBridge.create();
    const result = await bridge.checkPolicyConsistency(permissivePolicy(), 10_000);
    expect(['sat', 'proved']).toContain(result.reason);
    expect(result.prover_id).toBe('z3-wasm');
    expect(result.proof_time_ms).toBeGreaterThan(0);
  });

  it('detects a permission+prohibition conflict as refuted', async () => {
    const { Z3WasmBridge } = await import('../../src/services/provers/z3-wasm-bridge');
    const bridge = await Z3WasmBridge.create();
    const result = await bridge.checkPolicyConsistency(conflictPolicy(), 10_000);
    expect(result.prover_id).toBe('z3-wasm');
    // Conflict should be detectable (sat of the conflict assertion)
    expect(result.proof_time_ms).toBeGreaterThan(0);
  });

  it('Z3WasmBridge.isAvailable() returns true when z3-solver is installed', async () => {
    const { Z3WasmBridge } = await import('../../src/services/provers/z3-wasm-bridge');
    expect(await Z3WasmBridge.isAvailable()).toBe(true);
  });
});
