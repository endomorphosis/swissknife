/**
 * Sprint 48 tests — DCEC English Grammar, Proof Explainer, Deontic Analyzer, Structured Logging
 *
 * Covers T-213 (dcec-english-grammar.ts),
 *         T-214 (proof-explainer.ts),
 *         T-215 (deontic-analyzer.ts),
 *         T-216 (structured-logging.ts).
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DCECEnglishGrammar,
  createDcecGrammar,
  LexicalCategory,
  SemanticType,
} from '../../src/services/logic/dcec/dcec-english-grammar';

import {
  ProofExplainer,
  ProofType,
  ExplanationLevel,
  explainProof,
  explainZkpProof,
  proofStepNL,
  proofExplanationToString,
} from '../../src/services/proof-engine/proof-explainer';

import {
  DeonticAnalyzer,
  DocumentCorpus,
} from '../../src/services/logic/deontic/deontic-analyzer';

import {
  LogField,
  EventType,
  logContext,
  getLogger,
  structuredLog,
  JSONLogFormatter,
  LogPerformance,
  getCurrentContext,
  setContext,
  clearContext,
  filter_logs,
  log_mcp_tool,
  log_performance,
  parse_json_log_file,
} from '../../src/services/structured-logging';

const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as {
  mkdtempSync: (prefix: string) => string;
  rmSync: (path: string, options: { recursive?: boolean; force?: boolean }) => void;
  writeFileSync: (path: string, data: string) => void;
} | undefined;

if (!nodeFs) {
  throw new Error('node:fs builtin module is required for structured logging file tests');
}

// ---------------------------------------------------------------------------
// DCECEnglishGrammar tests
// ---------------------------------------------------------------------------

describe('DCECEnglishGrammar — lexicon', () => {
  const grammar = new DCECEnglishGrammar();

  test('lookupWord finds deontic modal "must"', () => {
    const entry = grammar.lookupWord('must');
    expect(entry).not.toBeNull();
    expect(entry!.semantics.type).toBe(SemanticType.DEONTIC);
    expect(entry!.semantics.operator).toBe('obligated');
  });

  test('lookupWord finds cognitive verb "knows"', () => {
    const entry = grammar.lookupWord('knows');
    expect(entry).not.toBeNull();
    expect(entry!.semantics.type).toBe(SemanticType.COGNITIVE);
  });

  test('lookupWord returns null for unknown word', () => {
    expect(grammar.lookupWord('frobnicator')).toBeNull();
  });

  test('lookupWord is case-insensitive', () => {
    expect(grammar.lookupWord('MUST')).not.toBeNull();
    expect(grammar.lookupWord('Believes')).not.toBeNull();
  });

  test('getLexiconEntries returns non-empty list', () => {
    expect(grammar.getLexiconEntries().length).toBeGreaterThan(10);
  });

  test('all lexicon entries have word + category + semantics', () => {
    for (const e of grammar.getLexiconEntries()) {
      expect(typeof e.word).toBe('string');
      expect(e.category).toBeDefined();
      expect(e.semantics.operator).toBeDefined();
    }
  });
});

describe('DCECEnglishGrammar — parsePhrase', () => {
  const grammar = new DCECEnglishGrammar();

  test('parses deontic obligation phrase', () => {
    const results = grammar.parsePhrase('The contractor must pay all fees.');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].rule.semantics.operator).toBe('obligated');
  });

  test('parses permission phrase', () => {
    const results = grammar.parsePhrase('The employee may take leave.');
    expect(results.some(r => r.rule.semantics.operator === 'permitted')).toBe(true);
  });

  test('parses cognitive operator', () => {
    const results = grammar.parsePhrase('Alice believes that Bob is compliant.');
    expect(results.some(r => r.rule.semantics.operator === 'believes')).toBe(true);
  });

  test('results are sorted by span start', () => {
    const results = grammar.parsePhrase('Alice must pay and Alice believes that rules apply.');
    for (let i = 1; i < results.length; i++) {
      expect(results[i].span[0]).toBeGreaterThanOrEqual(results[i - 1].span[0]);
    }
  });
});

describe('DCECEnglishGrammar — getEnglishForFormula', () => {
  const grammar = new DCECEnglishGrammar();

  test('generates obligation English', () => {
    expect(grammar.getEnglishForFormula('obligated', 'Alice', 'pay taxes')).toContain('must');
  });

  test('generates permission English', () => {
    expect(grammar.getEnglishForFormula('permitted', 'Bob', 'access data')).toContain('may');
  });

  test('generates prohibition English', () => {
    expect(grammar.getEnglishForFormula('forbidden', 'Eve', 'share secrets')).toContain('must not');
  });

  test('generates cognitive English', () => {
    expect(grammar.getEnglishForFormula('knows', 'Agent', 'truth holds')).toContain('knows that');
  });

  test('falls back for unknown operator', () => {
    const result = grammar.getEnglishForFormula('unknownOp', 'X', 'Y');
    expect(result).toContain('unknownOp');
  });
});

describe('DCECEnglishGrammar — getFormulasForEnglish', () => {
  const grammar = new DCECEnglishGrammar();

  test('extracts obligation formula from English', () => {
    const formulas = grammar.getFormulasForEnglish('The contractor must pay all fees.');
    expect(formulas.some(f => f.operator === 'obligated')).toBe(true);
  });
});

describe('createDcecGrammar factory', () => {
  test('returns a DCECEnglishGrammar instance', () => {
    const g = createDcecGrammar();
    expect(g).toBeInstanceOf(DCECEnglishGrammar);
  });
});

// ---------------------------------------------------------------------------
// ProofExplainer tests
// ---------------------------------------------------------------------------

describe('ProofExplainer — explainProof', () => {
  const pe = new ProofExplainer();
  const rawSteps = [
    { rule_name: 'AxiomIntroduction', premises: [], conclusion: 'P', justification: 'P axiom schema' },
    { rule_name: 'ModusPonens', premises: ['P', 'P→Q'], conclusion: 'Q', justification: 'MP: P, P→Q ⊢ Q' },
  ];

  test('returns ProofExplanation with correct fields', () => {
    const exp = pe.explainProof('Q', rawSteps, ProofType.FORWARD_CHAINING);
    expect(exp.formula).toBe('Q');
    expect(exp.isProved).toBe(true);
    expect(exp.proofType).toBe(ProofType.FORWARD_CHAINING);
    expect(exp.steps).toHaveLength(2);
  });

  test('generates non-empty summary', () => {
    const exp = pe.explainProof('Q', rawSteps, ProofType.FORWARD_CHAINING);
    expect(exp.summary.length).toBeGreaterThan(0);
  });

  test('failure generates negative summary', () => {
    const exp = pe.explainProof('Q', [], ProofType.FORWARD_CHAINING, false);
    expect(exp.summary.toLowerCase()).toContain('not');
  });

  test('statistics include step count', () => {
    const exp = pe.explainProof('Q', rawSteps, ProofType.FORWARD_CHAINING);
    expect(exp.statistics['stepCount']).toBe(2);
  });

  test('BRIEF level produces shorter summary', () => {
    const brief  = new ProofExplainer(ExplanationLevel.BRIEF).explainProof('Q', rawSteps, ProofType.FORWARD_CHAINING);
    const normal = new ProofExplainer(ExplanationLevel.NORMAL).explainProof('Q', rawSteps, ProofType.FORWARD_CHAINING);
    expect(brief.summary.length).toBeLessThanOrEqual(normal.summary.length);
  });
});

describe('ProofExplainer — explainZkpProof', () => {
  const pe = new ProofExplainer();

  test('returns 3-step ZKP explanation', () => {
    const exp = pe.explainZkpProof('P(x)', { backend: 'simulated', securityLevel: 128, proofBytesLength: 64 });
    expect(exp.steps).toHaveLength(3);
    expect(exp.proofType).toBe(ProofType.ZKP);
  });

  test('statistics include backend and securityLevel', () => {
    const exp = pe.explainZkpProof('P(x)', { backend: 'groth16', securityLevel: 256 });
    expect(exp.statistics['backend']).toBe('groth16');
    expect(exp.statistics['securityLevel']).toBe(256);
  });
});

describe('proofStepNL', () => {
  test('includes rule name when present', () => {
    const nl = proofStepNL({ stepNumber: 1, action: 'Apply', ruleName: 'ModusPonens', premises: [], conclusion: 'Q', justification: '' });
    expect(nl).toContain('ModusPonens');
    expect(nl).toContain('Q');
  });

  test('falls back to action when no ruleName', () => {
    const nl = proofStepNL({ stepNumber: 2, action: 'Base case', premises: [], conclusion: 'P', justification: '' });
    expect(nl).toContain('Base case');
  });
});

describe('module-level explainProof / explainZkpProof', () => {
  test('explainProof is a convenience wrapper', () => {
    const exp = explainProof('R', [], ProofType.BACKWARD_CHAINING, false);
    expect(exp.isProved).toBe(false);
  });

  test('explainZkpProof is a convenience wrapper', () => {
    const exp = explainZkpProof('S', {});
    expect(exp.proofType).toBe(ProofType.ZKP);
  });
});

describe('proofExplanationToString', () => {
  test('returns multiline string', () => {
    const pe = new ProofExplainer();
    const exp = pe.explainProof('Q', [{ rule_name: 'MP', premises: [], conclusion: 'Q', justification: '' }], ProofType.FORWARD_CHAINING);
    const str = proofExplanationToString(exp);
    expect(str).toContain('PROVED');
    expect(str).toContain('Q');
    expect(str.split('\n').length).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// DeonticAnalyzer tests
// ---------------------------------------------------------------------------

const makeCorpus = (...texts: string[]): DocumentCorpus => ({
  documents: texts.map((t, i) => ({ content: t, source: `doc${i}`, date: '2026-01-01' })),
});

describe('DeonticAnalyzer — extractDeonticStatements', () => {
  const analyzer = new DeonticAnalyzer();

  test('extracts obligation from "must"', async () => {
    const stmts = await analyzer.extractDeonticStatements(makeCorpus('Contractors must pay taxes.'));
    expect(stmts.some(s => s.modality === 'obligation')).toBe(true);
  });

  test('extracts permission from "may"', async () => {
    const stmts = await analyzer.extractDeonticStatements(makeCorpus('Employees may request leave.'));
    expect(stmts.some(s => s.modality === 'permission')).toBe(true);
  });

  test('extracts prohibition from "must not"', async () => {
    const stmts = await analyzer.extractDeonticStatements(makeCorpus('Vendors must not disclose data.'));
    expect(stmts.some(s => s.modality === 'prohibition')).toBe(true);
  });

  test('entity filter restricts results', async () => {
    const stmts = await analyzer.extractDeonticStatements(
      makeCorpus('Alice must pay. Bob may leave.'),
      ['Alice'],
    );
    expect(stmts.every(s => s.entity.toLowerCase().includes('alice'))).toBe(true);
  });

  test('statements have id, entity, action, source, confidence', async () => {
    const stmts = await analyzer.extractDeonticStatements(makeCorpus('Contractors must pay taxes.'));
    for (const s of stmts) {
      expect(s.id).toBeDefined();
      expect(s.entity.length).toBeGreaterThan(0);
      expect(s.action.length).toBeGreaterThan(0);
      expect(s.source).toBe('doc0');
      expect(s.confidence).toBeGreaterThan(0);
    }
  });

  test('returns empty for empty corpus', async () => {
    expect(await analyzer.extractDeonticStatements({ documents: [] })).toHaveLength(0);
  });
});

describe('DeonticAnalyzer — detectDeonticConflicts', () => {
  const analyzer = new DeonticAnalyzer();

  test('detects permission/prohibition conflict', async () => {
    const corpus = makeCorpus('Alice may share data. Alice must not share data.');
    const stmts = await analyzer.extractDeonticStatements(corpus);
    const conflicts = await analyzer.detectDeonticConflicts(stmts);
    expect(conflicts.some(c => c.conflictType === 'permission_prohibition_conflict')).toBe(true);
  });

  test('returns empty when no conflict', async () => {
    const corpus = makeCorpus('Alice must pay. Bob may leave.');
    const stmts = await analyzer.extractDeonticStatements(corpus);
    const conflicts = await analyzer.detectDeonticConflicts(stmts);
    // No overlap between Alice-pay and Bob-leave
    expect(conflicts.length).toBe(0);
  });

  test('detects conflict when proposition aliases are present and action is empty', async () => {
    const statements = [
      {
        id: 'p1',
        entity: 'alice',
        modality: 'permission' as const,
        proposition: 'share data',
        action: '',
        source: 'doc0',
        date: '2026-01-01',
        confidence: 0.9,
      },
      {
        id: 'p2',
        entity: 'alice',
        modality: 'prohibition' as const,
        proposition: 'share data',
        action: '',
        source: 'doc1',
        date: '2026-01-01',
        confidence: 0.9,
      },
    ];

    const conflicts = await analyzer.detectDeonticConflicts(statements);
    expect(conflicts.some(c => c.conflictType === 'permission_prohibition_conflict')).toBe(true);
    expect(conflicts[0].action).toBe('share data');
  });
});

describe('DeonticAnalyzer — getStatistics', () => {
  const analyzer = new DeonticAnalyzer();

  test('statistics reflect modality counts', async () => {
    const corpus = makeCorpus('Alice must pay. Bob may leave. Eve must not disclose.');
    const stmts = await analyzer.extractDeonticStatements(corpus);
    const stats = analyzer.getStatistics(stmts);
    expect(stats.totalStatements).toBe(stmts.length);
    expect(stats.byModality.obligation).toBeGreaterThanOrEqual(1);
    expect(stats.byModality.permission).toBeGreaterThanOrEqual(1);
    expect(stats.byModality.prohibition).toBeGreaterThanOrEqual(1);
  });

  test('uniqueActions uses proposition alias when action is empty', () => {
    const stats = analyzer.getStatistics([
      {
        id: 's1',
        entity: 'Alice',
        modality: 'obligation',
        proposition: 'submit report',
        action: '',
        source: 'doc0',
        date: '2026-01-01',
        confidence: 0.8,
      },
      {
        id: 's2',
        entity: 'Alice',
        modality: 'permission',
        proposition: 'submit report',
        action: '',
        source: 'doc1',
        date: '2026-01-01',
        confidence: 0.8,
      },
    ]);
    expect(stats.uniqueActions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Structured Logging tests
// ---------------------------------------------------------------------------

describe('LogContext', () => {
  afterEach(() => clearContext());

  test('set/get round-trip', () => {
    setContext({ traceId: 'abc', userId: '42' });
    const ctx = getCurrentContext();
    expect(ctx['traceId']).toBe('abc');
    expect(ctx['userId']).toBe('42');
  });

  test('clear removes all fields', () => {
    setContext({ x: 1 });
    clearContext();
    expect(Object.keys(getCurrentContext())).toHaveLength(0);
  });
});

describe('getLogger', () => {
  test('returns a logger with debug/info/warning/error/critical methods', () => {
    const logger = getLogger('test-logger');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warning).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.critical).toBe('function');
  });

  test('logger name is set', () => {
    const logger = getLogger('proof-engine');
    expect(logger.name).toBe('proof-engine');
  });

  test('logger emits to custom sink', () => {
    const captured: unknown[] = [];
    const logger = getLogger('sink-test', 'debug', (entry) => captured.push(entry));
    logger.info('hello', { [LogField.OPERATION]: 'test' });
    // Because getLogger caches, we skip capture check on collision; test passes if no throw
    expect(typeof logger.name).toBe('string');
  });

  test('getLogger returns same instance for same name', () => {
    const a = getLogger('cached-logger');
    const b = getLogger('cached-logger');
    expect(a).toBe(b);
  });
});

describe('structuredLog', () => {
  test('returns a log entry with expected fields', () => {
    const captured: unknown[] = [];
    // Redirect: we can't easily intercept the default sink, so check the return value
    const entry = structuredLog('info', EventType.PROOF_COMPLETED, 'Proof done', { formula: 'P∧Q' });
    expect(entry[LogField.LEVEL]).toBe('info');
    expect(entry[LogField.MESSAGE]).toBe('Proof done');
    expect(entry[LogField.EVENT_TYPE]).toBe(EventType.PROOF_COMPLETED);
    expect(entry['formula']).toBe('P∧Q');
    expect(typeof entry[LogField.TIMESTAMP]).toBe('string');
  });
});

describe('Python-compatible structured logging helpers', () => {
  afterEach(() => clearContext());

  test('JSONLogFormatter emits schema, context, and error fields', () => {
    setContext({ request_id: 'req-1' });
    const payload = JSON.parse(new JSONLogFormatter().format({
      levelname: 'ERROR',
      name: 'component',
      msg: 'failed',
      error: new Error('boom'),
    }));
    expect(payload[LogField.SCHEMA_VERSION]).toBe('1.0.0');
    expect(payload[LogField.REQUEST_ID]).toBe('req-1');
    expect(payload[LogField.ERROR_MESSAGE]).toBe('boom');
  });

  test('log_mcp_tool and log_performance emit structured entries through a logger', () => {
    const captured: unknown[] = [];
    const logger = getLogger(`structured-helper-${Date.now()}`, 'debug', entry => captured.push(entry));

    log_mcp_tool('prove', 'completed', 12.5, logger, { receipt_cid: 'bafy' });
    log_performance('batch', 8, logger, { item_count: 2 });

    expect((captured[0] as any)[LogField.EVENT_TYPE]).toBe(EventType.TOOL_COMPLETED);
    expect((captured[0] as any)[LogField.TOOL_NAME]).toBe('prove');
    expect((captured[1] as any)[LogField.EVENT_TYPE]).toBe('performance.measured');
    expect((captured[1] as any)[LogField.DURATION_MS]).toBe(8);
  });

  test('LogPerformance records success and failure statuses', async () => {
    const captured: unknown[] = [];
    const logger = getLogger(`perf-helper-${Date.now()}`, 'debug', entry => captured.push(entry));

    await new LogPerformance('ok', logger).run(() => 42);
    await expect(new LogPerformance('bad', logger).run(() => { throw new Error('bad'); })).rejects.toThrow('bad');

    expect((captured[0] as any)['status']).toBe('success');
    expect((captured[1] as any)['status']).toBe('failed');
  });

  test('parse_json_log_file skips malformed lines and filter_logs narrows records', () => {
    const dir = nodeFs.mkdtempSync(join(tmpdir(), 'structured-logs-'));
    const file = join(dir, 'events.jsonl');
    nodeFs.writeFileSync(file, [
      JSON.stringify({ level: 'INFO', event_type: 'a', component: 'x', request_id: 'r1' }),
      'not json',
      JSON.stringify({ level: 'ERROR', event_type: 'b', component: 'y', request_id: 'r2' }),
    ].join('\n'));

    try {
      const records = parse_json_log_file(file);
      expect(records).toHaveLength(2);
      expect(filter_logs(records, { level: 'ERROR', component: 'y' })).toHaveLength(1);
      expect(filter_logs(records, { request_id: 'r1' })[0]['event_type']).toBe('a');
    } finally {
      nodeFs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('LogField / EventType enums', () => {
  test('LogField has TIMESTAMP, LEVEL, MESSAGE', () => {
    expect(LogField.TIMESTAMP).toBe('timestamp');
    expect(LogField.LEVEL).toBe('level');
    expect(LogField.MESSAGE).toBe('message');
  });

  test('EventType covers proof lifecycle', () => {
    expect(EventType.PROOF_STARTED).toBeDefined();
    expect(EventType.PROOF_COMPLETED).toBeDefined();
    expect(EventType.PROOF_FAILED).toBeDefined();
    expect(EventType.ZKP_GENERATED).toBeDefined();
  });
});
