/**
 * wasm-prover-sprint65.test.ts
 * Tests for Sprint 65 modules:
 *   - logic-proof-storage-parsers.ts  (IPFSProofStorage, TPTPParser, ProblemParser, GrammarLoader)
 *   - logic-verification-utilities.ts            (verification utils, DCEC cleaning, deontic utils, WitnessManager, EProverAdapter)
 */

import {
  IPFSProofStorage, getDefaultProofStorage,
  TPTPParser, ProblemParser, parseProblemFile,
  GrammarLoader, getGrammarLoader,
} from '../../src/services/logic-proof-storage-parsers';

import {
  getBasicAxioms, getBasicProofRules, validateFormulaSyntax,
  parseProofSteps, areContradictory,
  stripWhitespace, stripComments, consolidateParens, checkParens, getMatchingCloseParen,
  DeonticPatterns, extractKeywords, calculateTextSimilarity, areEntitiesSimilar, areActionsSimilar,
  WitnessManager,
  EProverAdapter, checkEproverInstallation, EProverProofResult, type EProverProcessResult,
} from '../../src/services/logic/api/logic-verification-toolkit.js';
import { Groth16BackendFallback, Groth16Proof } from '../../src/services/zkp/zkp-backends.js';

// ---------------------------------------------------------------------------
// IPFSProofStorage
// ---------------------------------------------------------------------------
describe('IPFSProofStorage', () => {
  let storage: IPFSProofStorage;
  beforeEach(() => { storage = new IPFSProofStorage(); });

  it('stores a proof and returns a CID string', async () => {
    const cid = await storage.store('P → Q', { steps: ['mp'] });
    expect(typeof cid).toBe('string');
    expect(cid.startsWith('bafk-')).toBe(true);
  });

  it('retrieves a stored proof by CID', async () => {
    const cid = await storage.store('∀x P(x)', { rule: 'ui' });
    const result = await storage.retrieve(cid);
    expect(result).not.toBeNull();
    expect(result!.formula).toBe('∀x P(x)');
  });

  it('returns null for unknown CID', async () => {
    const result = await storage.retrieve('bafk-unknown');
    expect(result).toBeNull();
  });

  it('lists all stored proofs', async () => {
    await storage.store('A ∧ B', { r: 1 });
    await storage.store('C ∨ D', { r: 2 });
    const all = await storage.list();
    expect(all.length).toBe(2);
  });

  it('deletes a stored proof', async () => {
    const cid = await storage.store('X → Y', {});
    expect(await storage.delete(cid)).toBe(true);
    expect(await storage.retrieve(cid)).toBeNull();
  });

  it('returns stats object', async () => {
    await storage.store('F', {});
    const stats = storage.getStats();
    expect(stats.totalStored).toBe(1);
  });

  it('getDefaultProofStorage returns singleton', () => {
    const a = getDefaultProofStorage();
    const b = getDefaultProofStorage();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// TPTPParser / ProblemParser
// ---------------------------------------------------------------------------
describe('TPTPParser', () => {
  const parser = new TPTPParser();

  it('parses fof axiom entries', () => {
    const text = 'fof(ax1, axiom, happy(john)).';
    const formulas = parser.parse(text);
    expect(formulas.length).toBeGreaterThan(0);
    const f = formulas[0];
    expect(f.name).toBe('ax1');
    expect(f.role).toBe('axiom');
  });

  it('returns empty for empty text', () => {
    expect(parser.parse('')).toHaveLength(0);
  });
});

describe('ProblemParser', () => {
  it('separates axioms from conjectures', () => {
    const text = [
      'fof(ax1, axiom, happy(john)).',
      'fof(c1, conjecture, happy(mary)).',
    ].join('\n');
    const problem = new ProblemParser().parse(text);
    expect(problem.axioms.length).toBeGreaterThan(0);
    expect(problem.conjectures.length).toBeGreaterThan(0);
  });

  it('parseProblemFile returns empty problem', () => {
    const p = parseProblemFile('/tmp/nonexistent.p');
    expect(p.name).toBe('/tmp/nonexistent.p');
    expect(p.axioms).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GrammarLoader
// ---------------------------------------------------------------------------
describe('GrammarLoader', () => {
  const loader = new GrammarLoader();

  it('loads a grammar for English', () => {
    const g = loader.load('en');
    expect(g.language).toBe('en');
    expect(g.lexicon).toBeDefined();
    expect(g.rules.length).toBeGreaterThan(0);
  });

  it('returns cached grammar on second call', () => {
    const g1 = loader.load('en');
    const g2 = loader.load('en');
    expect(g1).toBe(g2);
  });

  it('get() returns null for unloaded language', () => {
    expect(loader.get('ja')).toBeNull();
  });

  it('getGrammarLoader returns instance', () => {
    const gl = getGrammarLoader();
    expect(gl).toBeInstanceOf(GrammarLoader);
  });
});

// ---------------------------------------------------------------------------
// Logic Verification Utils
// ---------------------------------------------------------------------------
describe('getBasicAxioms', () => {
  it('returns at least 4 standard axioms', () => {
    const axioms = getBasicAxioms();
    expect(axioms.length).toBeGreaterThanOrEqual(4);
    const names = axioms.map(a => a.name);
    expect(names).toContain('modus_ponens');
  });
});

describe('getBasicProofRules', () => {
  it('returns rules with name/premises/conclusion', () => {
    const rules = getBasicProofRules();
    expect(rules.length).toBeGreaterThanOrEqual(4);
    expect((rules[0] as Record<string, unknown>).name).toBe('mp');
  });
});

describe('validateFormulaSyntax', () => {
  it('returns true for balanced formula', () => {
    expect(validateFormulaSyntax('(P ∧ Q) → R')).toBe(true);
  });
  it('returns false for unbalanced parens', () => {
    expect(validateFormulaSyntax('(P ∧ Q')).toBe(false);
  });
  it('returns false for empty string', () => {
    expect(validateFormulaSyntax('')).toBe(false);
  });
});

describe('parseProofSteps', () => {
  it('parses well-formed proof lines', () => {
    const text = 'mp: P, P→Q ⊢ Q\nmt: P→Q, ¬Q ⊢ ¬P';
    const steps = parseProofSteps(text);
    expect(steps.length).toBe(2);
    expect(steps[0].rule).toBe('mp');
    expect(steps[0].conclusion).toBe('Q');
  });
});

describe('areContradictory', () => {
  it('detects P and ¬P as contradictory', () => {
    expect(areContradictory('P', '¬P')).toBe(true);
  });
  it('detects ¬P and P as contradictory', () => {
    expect(areContradictory('¬P', 'P')).toBe(true);
  });
  it('returns false for unrelated formulas', () => {
    expect(areContradictory('P', 'Q')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DCEC Cleaning
// ---------------------------------------------------------------------------
describe('stripWhitespace', () => {
  it('collapses multiple spaces', () => {
    expect(stripWhitespace('a   b   c')).toBe('a b c');
  });
});

describe('stripComments', () => {
  it('removes ; comments', () => {
    expect(stripComments('f(x) ; comment')).toBe('f(x)');
  });
  it('removes line comments', () => {
    expect(stripComments('code // note\n')).toContain('code');
  });
});

describe('consolidateParens', () => {
  it('removes double parens', () => {
    expect(consolidateParens('((abc))')).toBe('(abc)');
  });
});

describe('checkParens', () => {
  it('returns true for balanced string', () => {
    expect(checkParens('(a (b c))')).toBe(true);
  });
  it('returns false for unbalanced', () => {
    expect(checkParens('(a (b c)')).toBe(false);
  });
});

describe('getMatchingCloseParen', () => {
  it('finds matching close paren', () => {
    expect(getMatchingCloseParen('(abc)', 0)).toBe(4);
  });
  it('returns null when no match', () => {
    expect(getMatchingCloseParen('(abc')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Deontological Reasoning Utils
// ---------------------------------------------------------------------------
describe('DeonticPatterns', () => {
  it('exports obligation and prohibition keywords', () => {
    expect(DeonticPatterns.OBLIGATION_KEYWORDS).toContain('must');
    expect(DeonticPatterns.PROHIBITION_KEYWORDS).toContain('forbidden');
  });
});

describe('extractKeywords', () => {
  it('extracts deontic keywords from text', () => {
    const kws = extractKeywords('The contractor must not share data with third parties');
    expect(kws.has('must not')).toBe(true);
  });
});

describe('calculateTextSimilarity', () => {
  it('returns 1 for identical texts', () => {
    expect(calculateTextSimilarity('hello world', 'hello world')).toBe(1);
  });
  it('returns 0 for completely different texts', () => {
    expect(calculateTextSimilarity('alpha beta', 'gamma delta epsilon')).toBe(0);
  });
  it('returns value between 0 and 1 for partial overlap', () => {
    const sim = calculateTextSimilarity('must share data', 'must not share information');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe('areEntitiesSimilar', () => {
  it('returns true for same entity', () => {
    expect(areEntitiesSimilar('contractor', 'contractor')).toBe(true);
  });
});

describe('areActionsSimilar', () => {
  it('returns false for clearly different actions', () => {
    expect(areActionsSimilar('purchase goods', 'terminate employment')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WitnessManager
// ---------------------------------------------------------------------------
describe('WitnessManager', () => {
  it('generates a witness with an id', async () => {
    const wm = new WitnessManager(new Groth16BackendFallback());
    const rec = await wm.generateWitness('P → Q');
    expect(rec.witnessId).toBe('wit-1');
    expect(rec.formula).toBe('P → Q');
  });

  it('verifies a generated witness', async () => {
    const wm = new WitnessManager(new Groth16BackendFallback());
    const rec = await wm.generateWitness('A ∧ B');
    expect(await wm.verifyWitness(rec.witnessId)).toBe(true);
  });

  it('getWitness returns null for unknown id', () => {
    const wm = new WitnessManager();
    expect(wm.getWitness('nonexistent')).toBeNull();
  });

  it('tracks stats', async () => {
    const wm = new WitnessManager(new Groth16BackendFallback());
    await wm.generateWitness('X');
    await wm.verifyWitness('wit-1');
    expect(wm.getStats().generated).toBe(1);
    expect(wm.getStats().verified).toBe(1);
  });

  it('fails verification when backend verifyProof returns false', async () => {
    const wm = new WitnessManager({
      async generateProof() {
        return new Groth16Proof(new Uint8Array([0, 1]), {}, { backend: 'fake' }, Date.now(), 2);
      },
      async verifyProof() { return false; },
    });
    const rec = await wm.generateWitness('X');
    expect(await wm.verifyWitness(rec.witnessId)).toBe(false);
    expect(wm.getStats().failures).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// EProverAdapter
// ---------------------------------------------------------------------------
describe('EProverAdapter', () => {
  it('isAvailable returns a boolean', () => {
    const adapter = new EProverAdapter();
    expect(typeof adapter.isAvailable()).toBe('boolean');
  });

  it('prove returns a result object with required fields', async () => {
    const adapter = new EProverAdapter();
    const result: EProverProofResult = await adapter.prove('P', [], 100);
    expect(typeof result.isProved).toBe('boolean');
    expect(typeof result.status).toBe('string');
    expect(Array.isArray(result.proofSteps)).toBe(true);
    expect(typeof result.cpuTime).toBe('number');
  });

  it('getStats increments on each prove call', async () => {
    const adapter = new EProverAdapter();
    await adapter.prove('Q');
    await adapter.prove('R');
    expect(adapter.getStats().totalProofs).toBe(2);
  });

  it('runs real eprover runner path when available', async () => {
    const runner = (_command: string, _args: string[], _input: string, _timeoutMs: number): EProverProcessResult => ({
      status: 0,
      stdout: '% SZS status Theorem\nfof(step_1, plain, p).',
      stderr: '',
    });
    const adapter = new EProverAdapter({ availabilityCheck: () => true, runner, binary: 'eprover' });
    const result = await adapter.prove('p');
    expect(result.isProved).toBe(true);
    expect(result.status).toBe('SZS_Theorem');
    expect(result.proofSteps.length).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it('checkEproverInstallation returns boolean', () => {
    expect(typeof checkEproverInstallation()).toBe('boolean');
  });
});
