/**
 * wasm-prover-sprint67.test.ts
 * Tests for Sprint 67 modules:
 *   - sprint67-groth16-cec.ts   (Groth16BackupBackend, CECDelegateStrategy, ExpansionRules)
 *   - sprint67-nlp-types.ts     (PortugueseParser, DeonticModality, FLogicOntology)
 *   - sprint67-crypto-utils.ts  (canonicalization, feature detection, rate limiting, VKRegistry, Horn axioms)
 */

import {
  Groth16BackupBackend,
  CECDelegateStrategy, createCECDelegate,
  AndExpansionRule, OrExpansionRule, ImpliesExpansionRule, IffExpansionRule, NotExpansionRule,
  getAllExpansionRules, selectExpansionRule,
} from '../../src/services/sprint67-groth16-cec';

import {
  getPortugueseDeonticKeywords, PortugueseParser,
  DeonticModality, ConflictType, detectConflict,
  FLogicStatus, makeFrame, makeOntology,
} from '../../src/services/sprint67-nlp-types';

import {
  normalizeText, canonicalizeTheorem, canonicalizeAxioms, theoremHashHex, axiomsCommitmentHex, tdfolV1AxiomsCommitmentHexV2,
  isModuleAvailable, importOptionalModule, clearFeatureDetectionCache, FeatureDetector,
  RateLimiter, RateLimitExceeded, getRateLimiter, rateLimit,
  VKRegistry, computeVkHash,
  HornAxiom, parseTdfolV1Axiom, parseTdfolV1Theorem, evaluateTdfolV1Holds, deriveTdfolV1Trace, LegalTheoremSyntaxError,
} from '../../src/services/sprint67-crypto-utils';

// ---------------------------------------------------------------------------
// Groth16BackupBackend
// ---------------------------------------------------------------------------
describe('Groth16BackupBackend', () => {
  const backend = new Groth16BackupBackend();

  it('generateProof returns a JSON proof string', async () => {
    const pk = { circuitId: 'test', provingKeyHex: 'aa' };
    const proof = await backend.generateProof('{"a":1}', pk);
    expect(typeof proof).toBe('string');
    const parsed = JSON.parse(proof) as { type: string; verified: boolean };
    expect(parsed.type).toBe('groth16-backup');
    expect(parsed.verified).toBe(true);
  });

  it('verifyProof returns true for a generated proof', async () => {
    const pk = { circuitId: 'circ1', provingKeyHex: 'bb' };
    const vk = { circuitId: 'circ1', verifyingKeyHex: 'cc' };
    const proof = await backend.generateProof('witness', pk);
    expect(await backend.verifyProof(proof, vk)).toBe(true);
  });

  it('generateCircuit returns an R1CSCircuit', () => {
    const circuit = backend.generateCircuit('myCircuit', 4, 2);
    expect(circuit.circuitId).toBe('myCircuit');
    expect(circuit.numConstraints).toBe(2);
    expect(circuit.constraints).toHaveLength(2);
  });

  it('generateProvingKey returns ProvingKey', () => {
    const c = backend.generateCircuit('c1');
    const pk = backend.generateProvingKey(c);
    expect(pk.circuitId).toBe('c1');
    expect(typeof pk.provingKeyHex).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// CECDelegateStrategy
// ---------------------------------------------------------------------------
describe('CECDelegateStrategy', () => {
  it('isAvailable returns false when no path given', () => {
    const s = new CECDelegateStrategy();
    expect(s.isAvailable()).toBe(false);
  });

  it('prove returns error when not available', async () => {
    const s = new CECDelegateStrategy();
    const result = await s.prove('P → Q', []);
    expect(result.proved).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('createCECDelegate returns a strategy instance', () => {
    const delegate = createCECDelegate();
    expect(delegate).toBeInstanceOf(CECDelegateStrategy);
  });
});

// ---------------------------------------------------------------------------
// Expansion Rules
// ---------------------------------------------------------------------------
describe('AndExpansionRule', () => {
  const rule = new AndExpansionRule();
  it('matches AND formula', () => expect(rule.matches('P ∧ Q', false)).toBe(true));
  it('expands into two branches', () => {
    const branches = rule.expand('P ∧ Q', false);
    expect(branches.length).toBe(2);
  });
});

describe('OrExpansionRule', () => {
  const rule = new OrExpansionRule();
  it('matches OR formula', () => expect(rule.matches('P ∨ Q', false)).toBe(true));
  it('expands into one branch with both disjuncts', () => {
    const branches = rule.expand('P ∨ Q', false);
    expect(branches[0]!.formulas.length).toBe(2);
  });
});

describe('ImpliesExpansionRule', () => {
  const rule = new ImpliesExpansionRule();
  it('matches implication', () => expect(rule.matches('P → Q', false)).toBe(true));
  it('expands correctly', () => {
    const b = rule.expand('P → Q', false);
    expect(b).toHaveLength(2);
    expect(b[0]!.formulas[0]).toBe('¬P');
    expect(b[1]!.formulas[0]).toBe('Q');
  });
});

describe('IffExpansionRule', () => {
  const rule = new IffExpansionRule();
  it('matches biconditional', () => expect(rule.matches('P ↔ Q', false)).toBe(true));
});

describe('NotExpansionRule', () => {
  const rule = new NotExpansionRule();
  it('matches negation', () => expect(rule.matches('¬P', false)).toBe(true));
  it('expands negation to inner formula', () => {
    const b = rule.expand('¬P', false);
    expect(b[0]!.formulas[0]).toBe('P');
  });
});

describe('getAllExpansionRules', () => {
  it('returns all 5 rules', () => expect(getAllExpansionRules().length).toBe(5));
});

describe('selectExpansionRule', () => {
  it('selects AND rule for ∧ formula', () => {
    const r = selectExpansionRule('A ∧ B', false);
    expect(r?.name).toBe('and-expansion');
  });
  it('returns null for atomic formula', () => {
    expect(selectExpansionRule('P', false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PortugueseParser
// ---------------------------------------------------------------------------
describe('getPortugueseDeonticKeywords', () => {
  it('returns keywords for all categories', () => {
    const kws = getPortugueseDeonticKeywords();
    expect(kws.obligation.length).toBeGreaterThan(0);
    expect(kws.prohibition.length).toBeGreaterThan(0);
  });
});

describe('PortugueseParser', () => {
  it('parses a sentence and returns clauses', () => {
    const parser = new PortugueseParser();
    const clauses = parser.parse('O contratante deve entregar o relatório.');
    expect(clauses.length).toBeGreaterThan(0);
    expect(clauses[0]!.modalType).toBe('obligation');
  });

  it('handles empty text', () => {
    const parser = new PortugueseParser();
    expect(parser.parse('')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Deontological Reasoning Types
// ---------------------------------------------------------------------------
describe('DeonticModality', () => {
  it('OBLIGATION is O', () => expect(DeonticModality.OBLIGATION).toBe('O'));
  it('PROHIBITION is F', () => expect(DeonticModality.PROHIBITION).toBe('F'));
});

describe('ConflictType', () => {
  it('DIRECT is defined', () => expect(ConflictType.DIRECT).toBe('direct'));
});

describe('detectConflict', () => {
  it('detects direct conflict between O and F for same agent+action', () => {
    const s1 = { id: 's1', modality: DeonticModality.OBLIGATION, agent: 'Alice', action: 'share', context: undefined, priority: 1 };
    const s2 = { id: 's2', modality: DeonticModality.PROHIBITION, agent: 'Alice', action: 'share', context: undefined, priority: 1 };
    const conflict = detectConflict(s1, s2);
    expect(conflict).not.toBeNull();
    expect(conflict!.type).toBe(ConflictType.DIRECT);
  });

  it('returns null for compatible statements', () => {
    const s1 = { id: 's1', modality: DeonticModality.OBLIGATION, agent: 'Alice', action: 'share', priority: 1 };
    const s2 = { id: 's2', modality: DeonticModality.OBLIGATION, agent: 'Bob',   action: 'read',  priority: 1 };
    expect(detectConflict(s1, s2)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FLogic Types
// ---------------------------------------------------------------------------
describe('FLogicStatus', () => {
  it('PROVABLE is defined', () => expect(FLogicStatus.PROVABLE).toBe('provable'));
});

describe('makeFrame', () => {
  it('creates a frame with frameId and className', () => {
    const f = makeFrame('f1', 'Person', { name: 'Alice' });
    expect(f.frameId).toBe('f1');
    expect(f.attributes.name).toBe('Alice');
  });
});

describe('makeOntology', () => {
  it('creates ontology with name and empty classes', () => {
    const o = makeOntology('legal');
    expect(o.name).toBe('legal');
    expect(o.classes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------
describe('normalizeText', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeText('HELLO  WORLD')).toBe('hello world');
  });
});

describe('canonicalizeTheorem', () => {
  it('sorts words', () => {
    const c1 = canonicalizeTheorem('B A');
    const c2 = canonicalizeTheorem('A B');
    expect(c1).toBe(c2);
  });
});

describe('theoremHashHex', () => {
  it('returns a 64-char hex string', () => {
    expect(theoremHashHex('P → Q')).toHaveLength(64);
  });
  it('is deterministic', () => {
    expect(theoremHashHex('foo')).toBe(theoremHashHex('foo'));
  });
});

describe('axiomsCommitmentHex', () => {
  it('returns different hashes for different axiom sets', () => {
    const h1 = axiomsCommitmentHex(['A', 'B']);
    const h2 = axiomsCommitmentHex(['C', 'D']);
    expect(h1).not.toBe(h2);
  });
});

describe('tdfolV1AxiomsCommitmentHexV2', () => {
  it('is order-independent', () => {
    const h1 = tdfolV1AxiomsCommitmentHexV2(['A', 'B', 'C']);
    const h2 = tdfolV1AxiomsCommitmentHexV2(['C', 'A', 'B']);
    expect(h1).toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// Feature Detection
// ---------------------------------------------------------------------------
describe('isModuleAvailable', () => {
  beforeEach(() => clearFeatureDetectionCache());
  it('returns true for built-in "path"', () => expect(isModuleAvailable('path')).toBe(true));
  it('returns false for nonexistent module', () => expect(isModuleAvailable('this-module-does-not-exist-xyz')).toBe(false));
});

describe('importOptionalModule', () => {
  it('returns null for nonexistent module', () => {
    expect(importOptionalModule('totally-fake-module-abc')).toBeNull();
  });
});

describe('FeatureDetector', () => {
  it('check returns true for "path"', () => {
    const fd = new FeatureDetector();
    expect(fd.check('path')).toBe(true);
  });
  it('getReport returns record', () => {
    const fd = new FeatureDetector();
    fd.check('path');
    const report = fd.getReport();
    expect(report['path']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------
describe('RateLimiter', () => {
  it('allows calls within limit', () => {
    const rl = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });
    expect(rl.check()).toBe(true);
    expect(rl.check()).toBe(true);
    expect(rl.check()).toBe(true);
  });

  it('denies after exceeding limit', () => {
    const rl = new RateLimiter({ maxRequests: 2, windowMs: 60_000 });
    rl.check(); rl.check();
    expect(rl.check()).toBe(false);
  });

  it('enforce throws RateLimitExceeded', () => {
    const rl = new RateLimiter({ maxRequests: 0, windowMs: 60_000 });
    expect(() => rl.enforce()).toThrow(RateLimitExceeded);
  });
});

// ---------------------------------------------------------------------------
// VKRegistry
// ---------------------------------------------------------------------------
describe('computeVkHash', () => {
  it('returns a 64-char hex string', () => {
    expect(computeVkHash({ a: 1 })).toHaveLength(64);
  });
});

describe('VKRegistry', () => {
  it('register and verify returns true', () => {
    const reg = new VKRegistry();
    const vk = { key: 'mykey' };
    reg.register('circuit1', vk);
    expect(reg.verify('circuit1', vk)).toBe(true);
  });

  it('verify returns false for wrong VK', () => {
    const reg = new VKRegistry();
    reg.register('c2', { key: 'a' });
    expect(reg.verify('c2', { key: 'b' })).toBe(false);
  });

  it('listAll returns all registered entries', () => {
    const reg = new VKRegistry();
    reg.register('ca', {});
    reg.register('cb', {});
    expect(reg.listAll().length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Legal Theorem Semantics (Horn Axioms)
// ---------------------------------------------------------------------------
describe('parseTdfolV1Axiom', () => {
  it('parses a fact (no body)', () => {
    const ax = parseTdfolV1Axiom('happy(john).');
    expect(ax.head).toBe('happy(john)');
    expect(ax.body).toHaveLength(0);
  });

  it('parses a rule with body', () => {
    const ax = parseTdfolV1Axiom('mortal(X) :- human(X).');
    expect(ax.head).toBe('mortal(X)');
    expect(ax.body).toContain('human(X)');
  });

  it('throws LegalTheoremSyntaxError for empty input', () => {
    expect(() => parseTdfolV1Axiom('')).toThrow(LegalTheoremSyntaxError);
  });
});

describe('evaluateTdfolV1Holds', () => {
  it('proves theorem from facts', () => {
    const axioms = ['happy(john).'];
    expect(evaluateTdfolV1Holds(axioms, 'happy(john)')).toBe(true);
  });

  it('proves through a rule', () => {
    const axioms = ['human(john).', 'mortal(john) :- human(john).'];
    expect(evaluateTdfolV1Holds(axioms, 'mortal(john)')).toBe(true);
  });

  it('returns false when theorem is not derivable', () => {
    expect(evaluateTdfolV1Holds([], 'unknown(x)')).toBe(false);
  });
});

describe('deriveTdfolV1Trace', () => {
  it('returns trace when provable', () => {
    const axioms = ['happy(john).'];
    const trace = deriveTdfolV1Trace(axioms, 'happy(john)');
    expect(trace).not.toBeNull();
    expect(trace!.length).toBeGreaterThan(0);
  });

  it('returns null when not provable', () => {
    expect(deriveTdfolV1Trace([], 'unprovable(x)')).toBeNull();
  });
});
