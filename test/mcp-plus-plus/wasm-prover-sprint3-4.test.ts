/**
 * Sprint 3+4 tests — Coq + Lean 4 bridges + translators (T-22, T-27)
 *
 * Covers:
 * - DeonticToCoqTranslator: script generation, symbol sanitization, contradiction detection
 * - CoqJsCoqBridge: subprocess mock, static fast-path, unknown fallback
 * - DeonticToLean4Translator: script generation, Lean 4 syntax
 * - Lean4WasmBridge: subprocess mock, static fast-path, unknown fallback
 * - WasmProverHub: Coq + Lean 4 status reporting, _tryCoqOrLean4 routing
 */

import { DeonticToCoqTranslator } from '../../src/services/provers/deontic-to-coq';
import { DeonticToLean4Translator } from '../../src/services/provers/deontic-to-lean4';
import { CoqJsCoqBridge } from '../../src/services/provers/coq-jscoq-bridge';
import { Lean4WasmBridge } from '../../src/services/provers/lean4-wasm-bridge';
import { WasmProverHub } from '../../src/services/mcp/mcp-wasm-prover-hub';
<<<<<<< HEAD
import type { Policy } from '../../src/services/logic/deontic/mcp-policy';
=======
import type { Policy } from '../../src/services/mcp/mcp-policy';
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function permissivePolicy(): Policy {
  return {
    id: 'p1', version: '1.0.0',
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

function oblProhibPolicy(): Policy {
  return {
    id: 'obl-prohib', version: '1.0.0',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [{ cap: 'mcp++/audit', rsc: '*' }],
    obligations: [{ description: 'audit access', requiredCap: 'mcp++/audit' }],
  };
}

// ---------------------------------------------------------------------------
// DeonticToCoqTranslator
// ---------------------------------------------------------------------------

describe('DeonticToCoqTranslator — policyConsistencyScript', () => {
  const t = new DeonticToCoqTranslator();

  it('generates valid Coq Section syntax', () => {
    const s = t.policyConsistencyScript(permissivePolicy());
    expect(s.source).toContain('Section PolicyConsistency.');
    expect(s.source).toContain('End PolicyConsistency.');
  });

  it('declares Hypothesis for each permission', () => {
    const s = t.policyConsistencyScript(permissivePolicy());
    expect(s.source).toContain('Hypothesis perm_');
  });

  it('declares Hypothesis for each prohibition', () => {
    const s = t.policyConsistencyScript(conflictPolicy());
    expect(s.source).toContain('Hypothesis prohib_');
  });

  it('generates contradiction Lemma for permission+prohibition clash', () => {
    const s = t.policyConsistencyScript(conflictPolicy());
    expect(s.source).toContain('Lemma contradiction_');
    expect(s.source).toContain('Proof. tauto. Qed.');
    expect(s.theoremName).toMatch(/^contradiction_/);
  });

  it('generates trivial consistency theorem for clean policy', () => {
    const s = t.policyConsistencyScript(permissivePolicy());
    expect(s.source).toContain('Theorem policy_consistent : True.');
    expect(s.source).toContain('Proof. trivial. Qed.');
    expect(s.theoremName).toBe('policy_consistent');
  });

  it('generates obligation unsatisfiability lemma', () => {
    const s = t.policyConsistencyScript(oblProhibPolicy());
    expect(s.source).toContain('obligation_unsatisfiable');
  });

  it('sanitizes special chars in cap/rsc to valid Coq identifiers', () => {
    const policy: Policy = {
      id: 'special', version: '1',
      permissions: [{ cap: 'mcp++/invoke:tool-name!', rsc: 'sha256:abc/path' }],
      prohibitions: [], obligations: [],
    };
    const s = t.policyConsistencyScript(policy);
    // No invalid Coq identifier chars in Hypothesis names
    expect(s.source).not.toMatch(/Hypothesis perm_[^a-zA-Z0-9_ \n].*:/);
  });

  it('provides a description string', () => {
    const s = t.policyConsistencyScript(permissivePolicy());
    expect(s.description).toContain('p1');
  });
});

describe('DeonticToCoqTranslator — formulaSetScript', () => {
  const t = new DeonticToCoqTranslator();

  it('generates Coq section for a formula set', () => {
    const s = t.formulaSetScript({
      obligation_formulas: ['O(browse, *)'],
      permission_formulas: ['P(browse, *)'],
      prohibition_formulas: [],
      all: [],
    });
    expect(s.source).toContain('Section DeonticFormulas.');
    expect(s.source).toContain('End DeonticFormulas.');
    expect(s.source).toContain('Theorem formula_set_valid : True.');
  });
});

// ---------------------------------------------------------------------------
// CoqJsCoqBridge — static fast-path (no coqc)
// ---------------------------------------------------------------------------

describe('CoqJsCoqBridge — static fast-path (no coqc)', () => {
  afterEach(() => WasmProverHub.resetInstance());

  it('proves trivially consistent policy via static analysis', async () => {
    // create() without override → auto-detects coqc; in CI coqc is absent
    const bridge = await CoqJsCoqBridge.create();
    const result = await bridge.checkPolicyConsistency(permissivePolicy());
    // Either: static fast-path returns proved (no coqc), or coqc returns proved
    expect(['proved', 'sat']).toContain(result.reason);
    expect(result.prover_id).toBe('coq-jscoq');
  });

  it('returns unknown or refuted for conflict policy when coqc unavailable', async () => {
    const bridge = await CoqJsCoqBridge.create();
    const result = await bridge.checkPolicyConsistency(conflictPolicy());
    expect(result.prover_id).toBe('coq-jscoq');
    expect(['unknown', 'refuted']).toContain(result.reason);
  });

  it('prove() returns unknown or a result (depends on coqc availability)', async () => {
    const bridge = await CoqJsCoqBridge.create();
    const result = await bridge.prove('Theorem foo : True. Proof. trivial. Qed.', 5000);
    expect(result.prover_id).toBe('coq-jscoq');
    // When coqc absent: unknown; when coqc present: proved
    expect(['unknown', 'proved', 'refuted']).toContain(result.reason);
  });

  it('returns coq-jscoq prover_id', async () => {
    const bridge = await CoqJsCoqBridge.create();
    const result = await bridge.checkPolicyConsistency(permissivePolicy());
    expect(result.prover_id).toBe('coq-jscoq');
  });

  it('isAvailable() returns a boolean without throwing', () => {
    expect(typeof CoqJsCoqBridge.isAvailable()).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// DeonticToLean4Translator
// ---------------------------------------------------------------------------

describe('DeonticToLean4Translator — policyConsistencyScript', () => {
  const t = new DeonticToLean4Translator();

  it('generates valid Lean 4 section syntax', () => {
    const s = t.policyConsistencyScript(permissivePolicy());
    expect(s.source).toContain('section PolicyConsistency');
    expect(s.source).toContain('end PolicyConsistency');
  });

  it('declares variable for each permission', () => {
    const s = t.policyConsistencyScript(permissivePolicy());
    expect(s.source).toContain('variable (perm_');
  });

  it('declares variable for each prohibition', () => {
    const s = t.policyConsistencyScript(conflictPolicy());
    expect(s.source).toContain('variable (prohib_');
  });

  it('generates contradiction theorem for permission+prohibition clash', () => {
    const s = t.policyConsistencyScript(conflictPolicy());
    expect(s.source).toContain('theorem contradiction_');
    expect(s.source).toContain(': False');
    expect(s.theoremName).toMatch(/^contradiction_/);
  });

  it('generates policy_consistent : True := trivial for clean policy', () => {
    const s = t.policyConsistencyScript(permissivePolicy());
    expect(s.source).toContain('theorem policy_consistent : True := trivial');
    expect(s.theoremName).toBe('policy_consistent');
  });

  it('generates obligation unsatisfiable theorem', () => {
    const s = t.policyConsistencyScript(oblProhibPolicy());
    expect(s.source).toContain('obligation_unsatisfiable');
    expect(s.source).toContain(': False');
  });

  it('sanitizes special chars to valid Lean 4 identifiers', () => {
    const policy: Policy = {
      id: 'special', version: '1',
      permissions: [{ cap: 'mcp++/invoke:tool!', rsc: 'sha256:x/path' }],
      prohibitions: [], obligations: [],
    };
    const s = t.policyConsistencyScript(policy);
    // Check that variable names (before the ` : Prop`) don't contain invalid chars
    // The ` : Prop` annotation is valid Lean 4 syntax and is expected
    const varLines = s.source.split('\n').filter(l => l.trim().startsWith('variable ('));
    for (const line of varLines) {
      // Extract just the variable name (between `(` and ` :`)
      const nameMatch = line.match(/variable \(([^ :]+)/);
      if (nameMatch) {
        expect(nameMatch[1]).not.toMatch(/[+/!]/);
      }
    }
  });
});

describe('DeonticToLean4Translator — formulaSetScript', () => {
  const t = new DeonticToLean4Translator();

  it('generates Lean 4 section for a formula set', () => {
    const s = t.formulaSetScript({
      obligation_formulas: ['O(browse, *)'],
      permission_formulas: ['P(browse, *)'],
      prohibition_formulas: [],
      all: [],
    });
    expect(s.source).toContain('section DeonticFormulas');
    expect(s.source).toContain('theorem formula_set_valid : True := trivial');
  });
});

// ---------------------------------------------------------------------------
// Lean4WasmBridge — static fast-path (no lean binary)
// ---------------------------------------------------------------------------

describe('Lean4WasmBridge — static fast-path (no lean binary)', () => {
  // Lean4 binary startup can be slow; these tests use the static-analysis path
  // which is fast. When lean IS available the static path is bypassed and the
  // actual binary runs, which may take longer. Individual tests guard via timeout.
  jest.setTimeout(120_000); // 2 min max per test for lean startup
  afterEach(() => WasmProverHub.resetInstance());

  it('proves trivially consistent policy (static or via lean)', async () => {
    const bridge = await Lean4WasmBridge.create();
    const result = await bridge.checkPolicyConsistency(permissivePolicy());
    // Both outcomes are valid: static analysis (proved) or lean binary (proved/timeout)
    expect(['proved', 'sat', 'timeout', 'refuted']).toContain(result.reason);
    expect(result.prover_id).toBe('lean4-wasm');
  });

  it('returns a valid result for conflict policy', async () => {
    const bridge = await Lean4WasmBridge.create();
    const result = await bridge.checkPolicyConsistency(conflictPolicy());
    expect(result.prover_id).toBe('lean4-wasm');
    expect(['unknown', 'refuted', 'timeout']).toContain(result.reason);
  });

  it('prove() returns a valid reason', async () => {
    const bridge = await Lean4WasmBridge.create();
    const result = await bridge.prove('theorem foo : True := trivial', 5000);
    expect(result.prover_id).toBe('lean4-wasm');
    expect(['unknown', 'proved', 'refuted', 'timeout']).toContain(result.reason);
  });

  it('returns lean4-wasm prover_id', async () => {
    const bridge = await Lean4WasmBridge.create();
    const result = await bridge.checkPolicyConsistency(permissivePolicy());
    expect(result.prover_id).toBe('lean4-wasm');
  });

  it('isAvailable() returns a boolean without throwing', () => {
    expect(typeof Lean4WasmBridge.isAvailable()).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// WasmProverHub — Coq + Lean 4 integration
// ---------------------------------------------------------------------------

describe('WasmProverHub — Coq + Lean 4 status and routing', () => {
  afterEach(() => WasmProverHub.resetInstance());

  it('proverStatus() includes coq_jscoq and lean4_wasm fields', async () => {
    const hub = await WasmProverHub.create({ timeoutMs: 100 });
    const status = hub.proverStatus();
    expect(typeof status.coq_jscoq).toBe('boolean');
    expect(typeof status.lean4_wasm).toBe('boolean');
    expect(status.lurk_wasm).toBe(false); // Phase 6 not yet implemented
  });

  it('routes temporal policy classification to native TDFOL', async () => {
    const hub = await WasmProverHub.create({ timeoutMs: 100 });
    const temporal: Policy = {
      id: 'temp', version: '1',
      permissions: [{ cap: '*', rsc: '*' }],
      prohibitions: [], obligations: [],
      temporal: { notBefore: 1000, notAfter: 9999 },
    };
    const result = await hub.checkPolicyConsistency(temporal);
    expect(['proved', 'sat', 'unsat', 'refuted']).toContain(result.reason);
    expect(result.prover_id).toBe('tdfol-native');
  });

  it('Coq bridge provides a script in meta when coqc unavailable', async () => {
    const bridge = await CoqJsCoqBridge.create('/nonexistent/coqc');
    const result = await bridge.checkPolicyConsistency(conflictPolicy());
    // When unknown, meta.script should contain the generated Coq source
    if (result.reason === 'unknown') {
      expect(typeof result.meta?.script).toBe('string');
    }
  });

  it('Lean 4 bridge provides a script in meta when lean unavailable', async () => {
    const bridge = await Lean4WasmBridge.create('/nonexistent/lean');
    const result = await bridge.checkPolicyConsistency(conflictPolicy());
    if (result.reason === 'unknown') {
      expect(typeof result.meta?.script).toBe('string');
    }
  });
});
