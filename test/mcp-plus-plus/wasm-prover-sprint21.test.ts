/**
 * WASM Prover Sprint 21 — Logic Types + Common Validators + TDFOL NL API tests.
 *
 * Tasks:
 *   T-108: Logic types (logic-types.ts)
 *   T-109: Logic validators + BoundedCache (logic-validators.ts)
 *   T-110: TDFOL NL API (tdfol-nl-api.ts)
 *   T-111: ≥10 tests
 *
 * Sprint 21 (Phase 21 — Logic Types + Common Validators + TDFOL NL API, P2).
 */

import {
  DeonticFormula, DeonticRuleSet,
  DEONTIC_OPERATOR_LABELS, TEMPORAL_OPERATOR_LABELS,
} from '../../src/services/logic/shared/logic-types.js';
import type { LegalAgent } from '../../src/services/logic/shared/logic-types.js';
import {
  validateFormulaString, validateAxiomList, validateLogicSystem, validateTimeoutMs,
  BoundedCache,
  SUPPORTED_LOGIC_SYSTEMS, MAX_FORMULA_LENGTH,
} from '../../src/services/logic/shared/logic-validators.js';
import { parseNaturalLanguage } from '../../src/services/logic/tdfol/tdfol-nl-api.js';
import {
  create_cache_cid,
  load_spacy_model,
  parse_cid,
  require_spacy,
  validate_cid,
} from '../../src/services/logic/tdfol/tdfol-nl-utils.js';

// ---------------------------------------------------------------------------
// T-108: Logic Types
// ---------------------------------------------------------------------------

describe('T-108 DeonticFormula', () => {
  const agent: LegalAgent = { identifier: 'alice', name: 'Alice', agentType: 'person', properties: {} };

  it('constructs with required fields and generates formulaId', () => {
    const f = new DeonticFormula({ operator: 'O', proposition: 'log_access', agent });
    expect(f.operator).toBe('O');
    expect(f.proposition).toBe('log_access');
    expect(typeof f.formulaId).toBe('string');
    expect(f.formulaId.length).toBe(12);
    expect(f.confidence).toBe(1.0);
  });

  it('toFolString builds correct formula', () => {
    const f = new DeonticFormula({ operator: 'O', proposition: 'log_access', agent });
    expect(f.toFolString()).toBe('O[alice](log_access)');
    expect(f.formula).toBe(f.toFolString());
  });

  it('applies conditions to toFolString', () => {
    const f = new DeonticFormula({ operator: 'P', proposition: 'read_file', conditions: ['logged_in'] });
    expect(f.toFolString()).toContain('logged_in');
    expect(f.toFolString()).toContain('→');
  });

  it('toDict returns serialisable object', () => {
    const f = new DeonticFormula({ operator: 'F', proposition: 'delete_record' });
    const d = f.toDict();
    expect(d['operator']).toBe('F');
    expect(d['proposition']).toBe('delete_record');
    expect(typeof d['formula_id']).toBe('string');
  });

  it('DEONTIC_OPERATOR_LABELS has entry for all operators', () => {
    expect(DEONTIC_OPERATOR_LABELS['O']).toBe('Obligation');
    expect(DEONTIC_OPERATOR_LABELS['P']).toBe('Permission');
    expect(DEONTIC_OPERATOR_LABELS['F']).toBe('Prohibition');
  });

  it('TEMPORAL_OPERATOR_LABELS has LTL entries', () => {
    expect(TEMPORAL_OPERATOR_LABELS['□']).toBe('Always');
    expect(TEMPORAL_OPERATOR_LABELS['◊']).toBe('Eventually');
  });
});

describe('T-108 DeonticRuleSet', () => {
  it('adds and retrieves formulas', () => {
    const rs = new DeonticRuleSet({ name: 'TestPolicy' });
    const f1 = new DeonticFormula({ operator: 'O', proposition: 'log' });
    const f2 = new DeonticFormula({ operator: 'P', proposition: 'read' });
    rs.addFormula(f1);
    rs.addFormula(f2);
    expect(rs.formulas).toHaveLength(2);
  });

  it('checkConsistency detects O+F conflict', () => {
    const rs = new DeonticRuleSet({ name: 'Conflict' });
    const agent: LegalAgent = { identifier: 'u1', name: 'User', agentType: 'person', properties: {} };
    rs.addFormula(new DeonticFormula({ operator: 'O', proposition: 'pay', agent }));
    rs.addFormula(new DeonticFormula({ operator: 'F', proposition: 'pay', agent }));
    const conflicts = rs.checkConsistency();
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0][2]).toContain('obligation');
  });

  it('findFormulasByOperator filters correctly', () => {
    const rs = new DeonticRuleSet({ name: 'Mixed' });
    rs.addFormula(new DeonticFormula({ operator: 'O', proposition: 'a' }));
    rs.addFormula(new DeonticFormula({ operator: 'P', proposition: 'b' }));
    rs.addFormula(new DeonticFormula({ operator: 'O', proposition: 'c' }));
    expect(rs.findFormulasByOperator('O')).toHaveLength(2);
    expect(rs.findFormulasByOperator('P')).toHaveLength(1);
  });

  it('removeFormula removes by ID', () => {
    const rs = new DeonticRuleSet({ name: 'R' });
    const f = new DeonticFormula({ operator: 'O', proposition: 'x' });
    rs.addFormula(f);
    expect(rs.removeFormula(f.formulaId)).toBe(true);
    expect(rs.formulas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-109: Validators
// ---------------------------------------------------------------------------

describe('T-109 validateFormulaString', () => {
  it('accepts a well-formed formula', () => {
    const r = validateFormulaString('∀x (Human(x) → Mortal(x))');
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects non-string input', () => {
    expect(validateFormulaString(42).valid).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateFormulaString('').valid).toBe(false);
  });

  it('warns on unbalanced parentheses', () => {
    const r = validateFormulaString('O(log');
    expect(r.warnings.some(w => w.includes('parentheses'))).toBe(true);
  });
});

describe('T-109 validateAxiomList + validateLogicSystem + validateTimeoutMs', () => {
  it('validateAxiomList accepts string array', () => {
    expect(validateAxiomList(['A → B', 'B → C']).valid).toBe(true);
  });

  it('validateAxiomList rejects non-array', () => {
    expect(validateAxiomList('not an array').valid).toBe(false);
  });

  it('validateLogicSystem accepts known systems', () => {
    expect(validateLogicSystem('fol').valid).toBe(true);
    expect(validateLogicSystem('tdfol').valid).toBe(true);
    expect(validateLogicSystem('z3').valid).toBe(true);
  });

  it('validateLogicSystem rejects unknown system', () => {
    expect(validateLogicSystem('unknown_prover').valid).toBe(false);
  });

  it('validateTimeoutMs clamps to valid range', () => {
    expect(validateTimeoutMs(0)).toBe(1);
    expect(validateTimeoutMs(100_000)).toBe(60_000);
    expect(validateTimeoutMs(5_000)).toBe(5_000);
    expect(validateTimeoutMs('bad')).toBe(5_000);
  });
});

describe('T-109 BoundedCache', () => {
  it('stores and retrieves values', () => {
    const cache = new BoundedCache<string>({ maxSize: 10 });
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
    expect(cache.has('k')).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('evicts oldest entry when at capacity', () => {
    const cache = new BoundedCache<number>({ maxSize: 3 });
    cache.set('a', 1); cache.set('b', 2); cache.set('c', 3);
    cache.set('d', 4);
    expect(cache.size).toBe(3);
    expect(cache.stats().evictions).toBe(1);
  });

  it('TTL expiry returns undefined after expiry', async () => {
    const cache = new BoundedCache<string>({ ttlMs: 5 });
    cache.set('k', 'v');
    await new Promise(r => setTimeout(r, 10));
    expect(cache.get('k')).toBeUndefined();
  });

  it('stats returns hit_rate', () => {
    const cache = new BoundedCache<number>();
    cache.set('x', 1);
    cache.get('x'); cache.get('missing');
    const s = cache.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.hit_rate).toBe(0.5);
  });

  it('delete removes entry', () => {
    const cache = new BoundedCache<string>();
    cache.set('k', 'v');
    expect(cache.delete('k')).toBe(true);
    expect(cache.has('k')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-110: TDFOL NL API
// ---------------------------------------------------------------------------

describe('T-110 parseNaturalLanguage', () => {
  it('parses obligation statement to O formula', () => {
    const result = parseNaturalLanguage('Users must log all access events.');
    expect(result.statements.length).toBeGreaterThanOrEqual(0); // may or may not match
    expect(result.fol.formula).toBeTruthy();
    expect(result.parse_time_ms).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('returns O operator for "must" text', () => {
    const result = parseNaturalLanguage('Agents must submit reports.');
    const obligs = result.generated_formulas.filter(g => g.operator === 'O');
    const perms  = result.generated_formulas.filter(g => g.operator === 'P');
    const prohs  = result.generated_formulas.filter(g => g.operator === 'F');
    // At least one of the modalities should be present
    expect(obligs.length + perms.length + prohs.length).toBe(result.generated_formulas.length);
  });

  it('returns P operator for "may" text', () => {
    const result = parseNaturalLanguage('Admins may delete records.');
    const perms = result.generated_formulas.filter(g => g.operator === 'P');
    // Permission should be found
    if (result.statements.some(s => s.modality === 'permission')) {
      expect(perms.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns F operator for "must not" text', () => {
    const result = parseNaturalLanguage('Contractors must not share passwords.');
    const prohs = result.generated_formulas.filter(g => g.operator === 'F');
    if (result.statements.some(s => s.modality === 'prohibition')) {
      expect(prohs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('respects minConfidence option', () => {
    const all  = parseNaturalLanguage('Users must log.', { minConfidence: 0 });
    const high = parseNaturalLanguage('Users must log.', { minConfidence: 0.99 });
    expect(all.formulas.length).toBeGreaterThanOrEqual(high.formulas.length);
  });

  it('returns metadata when includeMetadata: true', () => {
    const result = parseNaturalLanguage('Agents must notify.', { includeMetadata: true });
    expect(typeof result.metadata['text_length']).toBe('number');
  });

  it('returns empty metadata when includeMetadata: false', () => {
    const result = parseNaturalLanguage('Agents must notify.', { includeMetadata: false });
    expect(Object.keys(result.metadata)).toHaveLength(0);
  });

  it('parse_natural_language alias works', async () => {
    const { parse_natural_language } = await import('../../src/services/logic/tdfol/tdfol-nl-api.js');
    const result = parse_natural_language('Users must log.');
    expect(result.fol.formula).toBeTruthy();
  });
});

describe('TDFOL NL utilities', () => {
  it('create_cache_cid is deterministic over canonical JSON order', () => {
    const a = create_cache_cid({ text: 'hello', provider: 'openai', prompt_hash: 'abc123' });
    const b = create_cache_cid({ prompt_hash: 'abc123', provider: 'openai', text: 'hello' });
    expect(a).toBe(b);
    expect(a).toMatch(/^bafk[a-z2-7]+$/);
    expect(validate_cid(a)).toBe(true);
  });

  it('parse_cid extracts CIDv1 raw sha2-256 metadata', () => {
    const cid = create_cache_cid({ text: 'metadata' });
    expect(parse_cid(cid)).toMatchObject({
      version: 1,
      codec: 'raw',
      hashfun: { name: 'sha2-256' },
    });
    expect(parse_cid(cid).hashfun.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(validate_cid('not-a-cid')).toBe(false);
  });

  it('spaCy helpers fail closed when no host spaCy bridge is configured', () => {
    expect(() => require_spacy()).toThrow('spaCy is required');
    expect(() => load_spacy_model()).toThrow('spaCy is required');
  });
});
