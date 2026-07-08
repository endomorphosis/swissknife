/**
 * wasm-prover-sprint42.test.ts
 *
 * Sprint 42: External Provers + Caselaw Bulk Processor + Proof Execution Engine Types
 */

import {
  ProofStatus, ProofResult, makeProofResult,
} from '../../src/services/proof-execution-engine-types.js';
import {
  ProverStatus, VampireProver, EProver, ProverRegistry,
  getProverRegistry, resetProverRegistry,
} from '../../src/services/external-provers.js';
import {
  makeCaselawDocument, ProcessingStats, makeDefaultConfig,
  CaselawBulkProcessor, createBulkProcessor,
} from '../../src/services/caselaw-bulk-processor.js';

// ---------------------------------------------------------------------------
// ProofStatus + ProofResult
// ---------------------------------------------------------------------------

describe('ProofStatus', () => {
  test('has 5 values', () => {
    expect(Object.values(ProofStatus)).toHaveLength(5);
    expect(Object.values(ProofStatus)).toContain('success');
    expect(Object.values(ProofStatus)).toContain('unsupported');
  });
});

describe('ProofResult', () => {
  test('constructs with defaults', () => {
    const r = new ProofResult({ prover: 'z3', statement: 'O(Pay)', status: ProofStatus.SUCCESS });
    expect(r.isProved).toBe(true);
    expect(r.failed).toBe(false);
    expect(r.timeMs).toBe(0);
  });

  test('failure status sets failed=true', () => {
    const r = new ProofResult({ prover: 'lean4', statement: 'P(x)', status: ProofStatus.FAILURE });
    expect(r.failed).toBe(true);
    expect(r.isProved).toBe(false);
  });

  test('toDict is JSON-safe', () => {
    const r = new ProofResult({ prover: 'z3', statement: 'O(Pay)', status: ProofStatus.SUCCESS, proof: 'cert123' });
    expect(() => JSON.stringify(r.toDict())).not.toThrow();
  });

  test('makeProofResult factory', () => {
    const r = makeProofResult('vampire', 'ForallX.P(x)', { status: ProofStatus.SUCCESS, timeMs: 42 });
    expect(r.prover).toBe('vampire');
    expect(r.timeMs).toBe(42);
    expect(r.isProved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProverStatus + VampireProver
// ---------------------------------------------------------------------------

describe('ProverStatus', () => {
  test('has 6 values', () => {
    expect(Object.values(ProverStatus)).toHaveLength(6);
    expect(Object.values(ProverStatus)).toContain('theorem');
  });
});

describe('VampireProver', () => {
  const vampire = new VampireProver({ allowSimulatedFallback: true });

  test('isAvailable returns false (no binary)', () => {
    expect(vampire.isAvailable()).toBe(false);
  });

  test('prove returns ProverResult', () => {
    const result = vampire.prove('forall x. P(x) = Q(x)');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('prover');
    expect(result.prover).toBe('vampire');
  });

  test('equality+forall problem gets theorem status', () => {
    const result = vampire.prove('forall x. x = x (reflexivity)');
    expect(result.status).toBe(ProverStatus.THEOREM);
  });

  test('generic problem gets unknown status', () => {
    const result = vampire.prove('SomeGenericProblem');
    expect(result.status).toBe(ProverStatus.UNKNOWN);
  });
});

describe('EProver', () => {
  const ep = new EProver({ allowSimulatedFallback: true });

  test('isAvailable returns false', () => {
    expect(ep.isAvailable()).toBe(false);
  });

  test('forall problem proves', () => {
    const result = ep.prove('Forall x. Agent(x) -> Person(x)');
    expect(result.status).toBe(ProverStatus.THEOREM);
    expect(result.prover).toBe('eprover');
  });
});

describe('ProverRegistry', () => {
  test('has 2 default provers', () => {
    const reg = new ProverRegistry();
    expect(reg.size).toBe(2);
  });

  test('list returns sorted names', () => {
    const reg = new ProverRegistry();
    const names = reg.list();
    expect(names).toEqual([...names].sort());
  });

  test('get returns registered prover', () => {
    const reg = new ProverRegistry();
    expect(reg.get('vampire')).toBeDefined();
    expect(reg.get('eprover')).toBeDefined();
    expect(reg.get('unknown')).toBeUndefined();
  });

  test('getBestFor equality returns both', () => {
    const reg = new ProverRegistry();
    const provers = reg.getBestFor('equality');
    expect(provers.length).toBe(2);
  });

  test('prove returns ProverResult', () => {
    const reg = new ProverRegistry();
    const result = reg.prove('forall x. P(x)');
    expect(result).toHaveProperty('status');
  });

  test('getProverRegistry singleton', () => {
    resetProverRegistry();
    expect(getProverRegistry()).toBe(getProverRegistry());
    resetProverRegistry();
  });
});

// ---------------------------------------------------------------------------
// CaselawDocument + CaselawBulkProcessor
// ---------------------------------------------------------------------------

describe('makeCaselawDocument', () => {
  test('creates document with defaults', () => {
    const doc = makeCaselawDocument('doc-001', 'Smith v. Jones', 'The defendant shall pay damages.');
    expect(doc.documentId).toBe('doc-001');
    expect(doc.jurisdiction).toBe('US');
    expect(doc.precedentStrength).toBe(1.0);
  });
});

describe('ProcessingStats', () => {
  test('starts at zero', () => {
    const stats = new ProcessingStats();
    expect(stats.totalDocuments).toBe(0);
    expect(stats.successRate).toBe(0);
  });

  test('toDict is JSON-safe', () => {
    const stats = new ProcessingStats();
    stats.totalDocuments = 5;
    stats.processedDocuments = 5;
    expect(() => JSON.stringify(stats.toDict())).not.toThrow();
  });
});

describe('CaselawBulkProcessor', () => {
  test('process returns ProcessedDocument', () => {
    const proc = createBulkProcessor();
    const doc = makeCaselawDocument('d1', 'Test', 'The contractor must deliver the goods.');
    const result = proc.process(doc);
    expect(result).toHaveProperty('document');
    expect(result).toHaveProperty('theorems');
    expect(result.success).toBe(true);
  });

  test('process extracts obligation from "must"', () => {
    const proc = createBulkProcessor();
    const doc = makeCaselawDocument('d2', 'Test', 'The party must pay fees. The contractor may inspect goods.');
    const result = proc.process(doc);
    const ops = result.theorems.map(t => t.operator);
    expect(ops).toContain('O');
  });

  test('process extracts prohibition from "shall not"', () => {
    const proc = createBulkProcessor();
    const doc = makeCaselawDocument('d3', 'Test', 'The defendant shall not disclose information.');
    const result = proc.process(doc);
    expect(result.theorems.some(t => t.operator === 'F')).toBe(true);
  });

  test('processBatch handles multiple docs', () => {
    const proc = createBulkProcessor();
    const docs = [
      makeCaselawDocument('d4', 'A', 'Must comply.'),
      makeCaselawDocument('d5', 'B', 'May inspect.'),
    ];
    const results = proc.processBatch(docs);
    expect(results).toHaveLength(2);
  });

  test('getStats tracks processed count', () => {
    const proc = createBulkProcessor();
    proc.process(makeCaselawDocument('d6', 'T', 'Must pay.'));
    proc.process(makeCaselawDocument('d7', 'T', 'May inspect.'));
    expect(proc.getStats().processedDocuments).toBe(2);
  });

  test('reset clears stats', () => {
    const proc = createBulkProcessor();
    proc.process(makeCaselawDocument('d8', 'T', 'Must act.'));
    proc.reset();
    expect(proc.getStats().totalDocuments).toBe(0);
  });

  test('maxDocuments config limits batch', () => {
    const proc = createBulkProcessor({ maxDocuments: 1 });
    const docs = [
      makeCaselawDocument('a', 'A', 'Must comply.'),
      makeCaselawDocument('b', 'B', 'May inspect.'),
    ];
    const results = proc.processBatch(docs);
    expect(results).toHaveLength(1);
  });
});
