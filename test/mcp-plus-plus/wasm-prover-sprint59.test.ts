/**
 * Sprint 59 tests — FLogic Cache, NL UCAN Compiler, Domain Vocab,
 *                   CEC NL Converter, Shadow Prover Wrapper, ZKP UCAN Bridge
 */

import { FLogicProofCache, getGlobalCachedWrapper } from '../../src/services/integrations/flogic-proof-cache';
import { NLUCANPolicyCompiler, compileNlToUcanPolicy } from '../../src/services/logic/nl/nl-ucan-policy-compiler';
import { LegalVocabulary, MedicalVocabulary, TechnicalVocabulary, DomainVocabularyManager } from '../../src/services/logic/shared/domain-vocabulary';
import { NaturalLanguageConverter, createEnhancedNlConverter } from '../../src/services/logic/cec/cec-nl-converter';
import { ShadowProverWrapper, ProverStatus } from '../../src/services/integrations/shadow-prover-wrapper';
import { ZKPToUCANBridge, getZkpUcanBridge } from '../../src/services/zkp/zkp-to-ucan-bridge';
import { Groth16BackendFallback } from '../../src/services/zkp/zkp-backends';

// ---------------------------------------------------------------------------
// FLogicProofCache tests
// ---------------------------------------------------------------------------
describe('FLogicProofCache', () => {
  test('set and get round-trip', () => {
    const c = new FLogicProofCache();
    c.set('q', 42);
    const r = c.get('q');
    expect(r).not.toBeNull();
    expect(r!.result).toBe(42);
  });
  test('miss returns null', () => { expect(new FLogicProofCache().get('missing')).toBeNull(); });
  test('LRU evicts oldest', () => {
    const c = new FLogicProofCache(2);
    c.set('a', 1); c.set('b', 2); c.set('c', 3);
    expect(c.get('a')).toBeNull();
    expect(c.get('c')).not.toBeNull();
  });
  test('clear empties cache', () => {
    const c = new FLogicProofCache();
    c.set('x', 1); c.clear();
    expect(c.size).toBe(0);
  });
  test('stats track hits/misses', () => {
    const c = new FLogicProofCache();
    c.set('q', 1);
    c.get('q'); c.get('missing');
    expect(c.getStats().hits).toBe(1);
    expect(c.getStats().misses).toBe(1);
  });
  test('getGlobalCachedWrapper returns same instance', () => {
    expect(getGlobalCachedWrapper()).toBe(getGlobalCachedWrapper());
  });
});

// ---------------------------------------------------------------------------
// NLUCANPolicyCompiler tests
// ---------------------------------------------------------------------------
describe('NLUCANPolicyCompiler', () => {
  const c = new NLUCANPolicyCompiler();
  test('compiles obligation to require capability', () => {
    const r = c.compile('Contractors must pay taxes.');
    expect(r.ucans).toHaveLength(1);
    expect(r.ucans[0].capabilities.length).toBeGreaterThanOrEqual(0);
  });
  test('result has text field', () => {
    expect(c.compile('Bob may leave.').text).toBe('Bob may leave.');
  });
  test('compileBatch processes multiple', () => {
    const results = c.compileBatch(['A must B.', 'C may D.']);
    expect(results).toHaveLength(2);
  });
  test('stats increment', () => {
    const c2 = new NLUCANPolicyCompiler();
    c2.compile('P');
    expect(c2.getStats().totalCompiled).toBe(1);
  });
  test('compileNlToUcanPolicy convenience fn', () => {
    const r = compileNlToUcanPolicy('Alice must pay.');
    expect(r).toHaveProperty('ucans');
    expect(r).toHaveProperty('confidence');
  });
});

// ---------------------------------------------------------------------------
// Domain Vocabulary tests
// ---------------------------------------------------------------------------
describe('LegalVocabulary', () => {
  const v = new LegalVocabulary();
  test('lookupTerm obligation', () => {
    const t = v.lookupTerm('obligation');
    expect(t).not.toBeNull();
    expect(t!.domain).toBe('legal');
  });
  test('lookupTerm synonym "duty"', () => { expect(v.lookupTerm('duty')).not.toBeNull(); });
  test('expand returns synonyms', () => {
    const e = v.expand('obligation');
    expect(e).toContain('obligation');
    expect(e.length).toBeGreaterThan(1);
  });
  test('unknown term returns null', () => { expect(v.lookupTerm('frobnicator')).toBeNull(); });
});

describe('MedicalVocabulary', () => {
  const v = new MedicalVocabulary();
  test('lookupTerm patient', () => { expect(v.lookupTerm('patient')).not.toBeNull(); });
  test('domain is medical', () => { expect(v.domain).toBe('medical'); });
});

describe('TechnicalVocabulary', () => {
  const v = new TechnicalVocabulary();
  test('lookupTerm access', () => { expect(v.lookupTerm('access')).not.toBeNull(); });
});

describe('DomainVocabularyManager', () => {
  const m = new DomainVocabularyManager();
  test('getDomains includes legal/medical/technical', () => {
    const domains = m.getDomains();
    expect(domains).toContain('legal');
    expect(domains).toContain('medical');
    expect(domains).toContain('technical');
  });
  test('lookup finds term across domains', () => {
    const t = m.lookup('obligation');
    expect(t).not.toBeNull();
  });
  test('lookup with domain restriction', () => {
    expect(m.lookup('obligation', 'legal')).not.toBeNull();
    expect(m.lookup('patient', 'legal')).toBeNull();
  });
  test('expand works cross-domain', () => {
    expect(m.expand('obligation').length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// CEC NL Converter tests
// ---------------------------------------------------------------------------
describe('NaturalLanguageConverter', () => {
  const conv = new NaturalLanguageConverter();
  test('converts obligation text', () => {
    const r = conv.convert('Contractors must pay taxes.');
    expect(r.formula.length).toBeGreaterThan(0);
    expect(r.confidence).toBeGreaterThan(0);
  });
  test('empty text yields errors', () => {
    const r = conv.convert('');
    expect(r.errors.length).toBeGreaterThan(0);
  });
  test('convertBatch processes multiple', () => {
    const results = conv.convertBatch(['Alice must pay.', 'Bob may leave.']);
    expect(results).toHaveLength(2);
  });
  test('stats increment', () => {
    const c2 = new NaturalLanguageConverter();
    c2.convert('P');
    expect(c2.getStats().totalConverted).toBe(1);
  });
  test('createEnhancedNlConverter factory', () => {
    const c = createEnhancedNlConverter();
    expect(c).toBeInstanceOf(NaturalLanguageConverter);
  });
});

// ---------------------------------------------------------------------------
// ShadowProverWrapper tests
// ---------------------------------------------------------------------------
describe('ShadowProverWrapper', () => {
  test('submit returns a ProofTask', () => {
    const w = new ShadowProverWrapper();
    const task = w.submit('P', ['P']);
    expect(task.taskId).toBeDefined();
    expect(task.formula).toBe('P');
  });
  test('getResult returns ProofTaskResult after delay', async () => {
    const w = new ShadowProverWrapper();
    const task = w.submit('P', ['P']);
    const r = await w.getResult(task.taskId, 50);
    expect(r).not.toBeNull();
    expect(r!.isProved).toBe(true);
    expect(r!.status).toBe(ProverStatus.SUCCEEDED);
  });
  test('underivable formula fails', async () => {
    const w = new ShadowProverWrapper();
    const task = w.submit('R', ['P']);
    const r = await w.getResult(task.taskId, 50);
    expect(r!.isProved).toBe(false);
    expect(r!.status).toBe(ProverStatus.FAILED);
  });
  test('getStats returns numeric fields', () => {
    const w = new ShadowProverWrapper();
    w.submit('P', ['P']);
    expect(w.getStats().submitted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ZKPToUCANBridge tests
// ---------------------------------------------------------------------------
describe('ZKPToUCANBridge', () => {
  const bridge = new ZKPToUCANBridge(new Groth16BackendFallback());

  test('uses the browser Schnorr backend by default', async () => {
    const strictBridge = new ZKPToUCANBridge();
    const r = await strictBridge.bridge('O(pay)', ['pay', 'transfer'], 'did:key:alice');
    expect(r.success).toBe(true);
    expect(r.evidence?.proof.metadata).toMatchObject({ backend: 'browser-schnorr-wasm' });
  });

  test('bridge returns success result', async () => {
    const r = await bridge.bridge('O(pay)', ['pay', 'transfer'], 'did:key:alice');
    expect(r.success).toBe(true);
    expect(r.ucans.length).toBeGreaterThan(0);
    expect(r.evidence).not.toBeNull();
  });

  test('evidence has proofHash', async () => {
    const r = await bridge.bridge('P', ['read']);
    expect(r.evidence!.proofHash.length).toBeGreaterThan(0);
  });

  test('verify returns true for valid evidence', async () => {
    const r = await bridge.bridge('P', ['read']);
    const ok = await bridge.verify(r.evidence!);
    expect(ok).toBe(true);
  });

  test('stats increment after bridge', async () => {
    const b2 = new ZKPToUCANBridge(new Groth16BackendFallback());
    await b2.bridge('Q', ['write']);
    expect(b2.getStats().totalBridged).toBe(1);
    expect(b2.getStats().succeeded).toBe(1);
  });

  test('getZkpUcanBridge returns same instance', () => {
    const a = getZkpUcanBridge();
    const b = getZkpUcanBridge();
    expect(a).toBe(b);
  });
});
