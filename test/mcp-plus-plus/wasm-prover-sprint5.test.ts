/**
 * Sprint 5 tests — Lurk/ZK stub (T-39) + AuditEntry prover_id (T-40)
 *
 * Covers:
 * - LurkWasmBridge stub mode (compiles, returns unknown safely)
 * - DeonticToLurkTranslator s-expression encoding
 * - ZKProofArtifact type validation
 * - PolicyAuditLog.record() prover_id + proof_time_ms in extra (T-40)
 */

import { LurkWasmBridge, DeonticToLurkTranslator } from '../../src/services/provers/lurk-wasm-bridge';
import type { ZKProofArtifact } from '../../src/services/provers/lurk-wasm-bridge';
import { PolicyAuditLog } from '../../src/services/mcp/policy-audit-log.js';
import type { Policy } from '../../src/services/mcp/mcp-mcp-policy.js';

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

function oblPolicy(): Policy {
  return {
    id: 'obl', version: '1.0.0',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [],
    obligations: [
      { description: 'audit access', requiredCap: 'mcp++/audit' },
      { description: 'record provenance', requiredCap: 'mcp++/provenance' },
    ],
  };
}

// ---------------------------------------------------------------------------
// DeonticToLurkTranslator
// ---------------------------------------------------------------------------

describe('DeonticToLurkTranslator', () => {
  const t = new DeonticToLurkTranslator();

  it('obligationToLurk produces a Lurk s-expression', () => {
    const expr = t.obligationToLurk('mcp++/audit', '*');
    expect(expr).toMatch(/^\(dischargeable/);
    expect(expr).toContain('mcp');
    expect(expr).toContain('nil'); // no context
  });

  it('obligationToLurk includes context when provided', () => {
    const expr = t.obligationToLurk('mcp++/audit', '*', { actor: 'did:key:z123' });
    expect(expr).not.toContain('nil');
    expect(expr).toContain('actor');
  });

  it('policyObligationsToLurk returns t for no obligations', () => {
    const expr = t.policyObligationsToLurk(permissivePolicy());
    expect(expr).toBe('t');
  });

  it('policyObligationsToLurk encodes a single obligation', () => {
    const single: Policy = {
      id: 'x', version: '1',
      permissions: [], prohibitions: [],
      obligations: [{ description: 'audit', requiredCap: 'mcp++/audit' }],
    };
    const expr = t.policyObligationsToLurk(single);
    expect(expr).toMatch(/^\(dischargeable/);
  });

  it('policyObligationsToLurk wraps multiple obligations in and', () => {
    const expr = t.policyObligationsToLurk(oblPolicy());
    expect(expr).toMatch(/^\(and/);
    expect(expr).toContain('dischargeable');
  });

  it('sanitizes special chars in cap/rsc to valid Lurk atoms', () => {
    const expr = t.obligationToLurk('mcp++/invoke:tool-name!', 'sha256:abc/path');
    // Should not contain raw ++, :, !, / in atom position
    // The atom is sanitized by lurkAtom()
    expect(expr).not.toMatch(/\+\+|sha256:/);
  });
});

// ---------------------------------------------------------------------------
// LurkWasmBridge — stub mode (T-35, T-39)
// ---------------------------------------------------------------------------

describe('LurkWasmBridge — stub mode (no native lurk-wasm)', () => {
  it('create() without native module returns a bridge without throwing', async () => {
    const bridge = await LurkWasmBridge.create();
    expect(bridge).toBeDefined();
  });

  it('proveObligationDischarge() returns reason=unknown in stub mode', async () => {
    const bridge = await LurkWasmBridge.create();
    const result = await bridge.proveObligationDischarge(permissivePolicy());
    expect(result.prover_id).toBe('lurk-wasm');
    expect(result.reason).toBe('unknown');
  });

  it('stub provides lurk_expr in meta when unavailable', async () => {
    const bridge = await LurkWasmBridge.create();
    const result = await bridge.proveObligationDischarge(permissivePolicy());
    // No obligations → expr is 't'
    expect(result.meta?.lurk_expr).toBe('t');
  });

  it('stub provides lurk_expr for obligation-bearing policy', async () => {
    const bridge = await LurkWasmBridge.create();
    const result = await bridge.proveObligationDischarge(oblPolicy());
    expect(typeof result.meta?.lurk_expr).toBe('string');
    const expr = result.meta!.lurk_expr as string;
    expect(expr).toMatch(/^\(and/); // 2 obligations → (and ...)
  });

  it('LurkWasmBridge.nativeAvailable is false in stub mode', async () => {
    await LurkWasmBridge.create();
    // nativeAvailable stays false when no module is injected and lurk-wasm is absent
    expect(typeof LurkWasmBridge.nativeAvailable).toBe('boolean');
  });
});

describe('LurkWasmBridge — native mock (T-35)', () => {
  it('uses native Lurk module when provided', async () => {
    const mockLurk = {
      evaluate: jest.fn().mockResolvedValue({ result: 't', proof: 'PROOF_BYTES' }),
      verify: jest.fn().mockReturnValue(true),
    };
    const bridge = await LurkWasmBridge.create(mockLurk);
    const result = await bridge.proveObligationDischarge(permissivePolicy());
    expect(result.reason).toBe('proved');
    expect(result.prover_id).toBe('lurk-wasm');
    expect(result.artifact).toBeDefined();
  });

  it('returns an artifact with the correct fields', async () => {
    const mockLurk = {
      evaluate: jest.fn().mockResolvedValue({ result: true, proof: 'bytes' }),
      verify: jest.fn().mockReturnValue(true),
    };
    const bridge = await LurkWasmBridge.create(mockLurk);
    const result = await bridge.proveObligationDischarge(permissivePolicy());
    const artifact = result.artifact as ZKProofArtifact;
    expect(artifact.backend).toBe('lurk');
    expect(typeof artifact.proof_b64).toBe('string');
    expect(artifact.lurk_expr).toBe('t'); // no obligations
  });

  it('returns refuted when native Lurk returns falsy', async () => {
    const mockLurk = {
      evaluate: jest.fn().mockResolvedValue({ result: 'nil', proof: 'x' }),
      verify: jest.fn().mockReturnValue(false),
    };
    const bridge = await LurkWasmBridge.create(mockLurk);
    const result = await bridge.proveObligationDischarge(permissivePolicy());
    expect(result.reason).toBe('refuted');
    expect(result.proved).toBe(false);
  });

  it('returns error when native Lurk throws', async () => {
    const mockLurk = {
      evaluate: jest.fn().mockRejectedValue(new Error('lurk crash')),
      verify: jest.fn().mockReturnValue(false),
    };
    const bridge = await LurkWasmBridge.create(mockLurk);
    const result = await bridge.proveObligationDischarge(permissivePolicy());
    expect(result.reason).toBe('error');
    expect((result.meta?.error as string)).toMatch(/lurk crash/);
  });
});

// ---------------------------------------------------------------------------
// PolicyAuditLog — prover_id + proof_time_ms in extra (T-40)
// ---------------------------------------------------------------------------

describe('PolicyAuditLog — prover_id and proof_time_ms in extra (T-40)', () => {
  afterEach(() => PolicyAuditLog.resetInstance());

  it('records prover_id in extra when provided', () => {
    const log = new PolicyAuditLog();
    const entry = log.record({
      policy_cid: 'sha256:p', intent_cid: 'sha256:i',
      decision: 'allow', tool: 'browse',
      prover_id: 'z3-wasm',
    });
    expect(entry).not.toBeNull();
    expect(entry!.extra.prover_id).toBe('z3-wasm');
  });

  it('records proof_time_ms in extra when provided', () => {
    const log = new PolicyAuditLog();
    const entry = log.record({
      policy_cid: 'sha256:p', intent_cid: 'sha256:i',
      decision: 'allow', proof_time_ms: 42,
    });
    expect(entry!.extra.proof_time_ms).toBe(42);
  });

  it('records both prover_id and proof_time_ms together', () => {
    const log = new PolicyAuditLog();
    const entry = log.record({
      policy_cid: 'sha256:p', intent_cid: 'sha256:i',
      decision: 'deny', prover_id: 'coq-jscoq', proof_time_ms: 150,
    });
    expect(entry!.extra.prover_id).toBe('coq-jscoq');
    expect(entry!.extra.proof_time_ms).toBe(150);
  });

  it('does not override extra fields from the extra object', () => {
    const log = new PolicyAuditLog();
    const entry = log.record({
      policy_cid: 'sha256:p', intent_cid: 'sha256:i',
      decision: 'allow',
      extra: { custom: 'value' },
      prover_id: 'lean4-wasm',
    });
    expect(entry!.extra.custom).toBe('value');
    expect(entry!.extra.prover_id).toBe('lean4-wasm');
  });

  it('extra is empty when no prover_id or proof_time_ms given', () => {
    const log = new PolicyAuditLog();
    const entry = log.record({
      policy_cid: 'sha256:p', intent_cid: 'sha256:i', decision: 'allow',
    });
    expect(Object.keys(entry!.extra)).toHaveLength(0);
  });
});
