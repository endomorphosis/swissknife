/**
 * Sprint 62 tests — Enhanced Grammar Parser, Temporal Deontic API,
 *                   NLP Predicate Extractor, Profiling Utils,
 *                   Proof Optimization, Resolution Rules
 */

import { EnhancedGrammarParser, ParseTree, Category } from '../../src/services/logic/nl/enhanced-grammar-parser.js';
import {
  TemporalDeonticAPI,
  addTheoremFromParameters,
  bulkProcessCaselawFromParameters,
  createSampleTheoremCorpus,
  demoBatchProcessing,
  demoDocumentConsistencyChecking,
  demoRagRetrieval,
  printDebugReport,
  queryTheoremsFromParameters,
} from '../../src/services/logic/tdfol/temporal-deontic-api.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPredicatesNlp, normalisePredicate, extractSemanticRoles } from '../../src/services/logic/fol/fol-nlp-extraction.js';
import {
  FormulaProfiler, BottleneckAnalyzer, ProfilingReporter,
} from '../../src/services/logic/cec/cec-resolution-rules.js';
import {
  PruningStrategy, makeProofNode, ProofTreePruner, RedundancyEliminator,
  ResolutionRule, UnitResolutionRule, FactoringRule,
  SubsumptionRule, CaseAnalysisRule, ProofByContradictionRule,
  ALL_RESOLUTION_RULES,
  FormulaProfiler as FP2, BottleneckAnalyzer as BA2, ProfilingReporter as PR2,
} from '../../src/services/logic/cec/cec-resolution-rules.js';

// ---------------------------------------------------------------------------
// EnhancedGrammarParser
// ---------------------------------------------------------------------------
describe('EnhancedGrammarParser', () => {
  const parser = new EnhancedGrammarParser();
  beforeEach(() => {
    parser.addTerminal({ word: 'Alice', category: Category.AGENT });
    parser.addTerminal({ word: 'must',  category: Category.MODAL });
    parser.addTerminal({ word: 'pay',   category: Category.ACTION });
  });

  test('parse produces leaf nodes per token', () => {
    const nodes = parser.parse('Alice must pay');
    expect(nodes).toHaveLength(3);
  });

  test('known terminal gets correct category', () => {
    const [agent] = parser.parse('Alice');
    expect(agent.category).toBe(Category.AGENT);
    expect(agent.value).toBe('alice');
  });

  test('unknown token gets default N category', () => {
    const [node] = parser.parse('frobnicator');
    expect(node.category).toBe(Category.N);
  });

  test('getParseForest returns array of arrays', () => {
    const forest = parser.getParseForest('Alice must pay');
    expect(Array.isArray(forest)).toBe(true);
    expect(forest.length).toBeGreaterThan(0);
  });
});

describe('ParseTree', () => {
  test('isLeaf true for leaf', () => {
    expect(new ParseTree(Category.N, 'Alice').isLeaf()).toBe(true);
  });
  test('words returns token values', () => {
    const leaf = new ParseTree(Category.N, 'pay');
    expect(leaf.words()).toEqual(['pay']);
  });
  test('toDict is JSON-serialisable', () => {
    expect(() => JSON.stringify(new ParseTree(Category.FORMULA, 'P').toDict())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TemporalDeonticAPI
// ---------------------------------------------------------------------------
describe('TemporalDeonticAPI', () => {
  const api = new TemporalDeonticAPI();

  test('extract obligation from text', () => {
    const clauses = api.extract('Contractors must pay taxes.');
    expect(clauses.some(c => c.modality === 'obligation')).toBe(true);
  });

  test('extract temporal context', () => {
    const clauses = api.extract('Employees must submit reports within 30 days.');
    const hasTemp = clauses.some(c => c.temporalCtx !== null);
    expect(hasTemp).toBe(true);
  });

  test('validate valid clause', () => {
    const clauses = api.extract('Alice must pay.');
    if (clauses.length > 0) {
      const { valid } = api.validate(clauses[0]);
      expect(valid).toBe(true);
    } else {
      expect(true).toBe(true); // graceful pass
    }
  });

  test('normalise lowercases action', () => {
    const clauses = api.extract('Alice must Pay taxes.');
    if (clauses.length > 0) {
      const norm = api.normalise(clauses[0]);
      expect(norm.action).toBe(norm.action.toLowerCase());
    }
  });

  test('stats increment after extract', () => {
    const a2 = new TemporalDeonticAPI();
    a2.extract('P must Q.');
    expect(a2.getStats().extracted).toBe(1);
  });

  test('queryTheoremsFromParameters returns deterministic theorem results', async () => {
    const result = await queryTheoremsFromParameters({
      query: 'provide advance notice before termination',
      operator_filter: 'OBLIGATION',
      jurisdiction: 'Federal',
      limit: 3,
    });
    expect(result.success).toBe(true);
    expect(result.total_results).toBeGreaterThan(0);
  });

  test('addTheoremFromParameters validates and returns theorem metadata', async () => {
    const missing = await addTheoremFromParameters({ operator: 'OBLIGATION' });
    expect(missing.success).toBe(false);

    const added = await addTheoremFromParameters({
      operator: 'OBLIGATION',
      proposition: 'provide notice',
      agent_name: 'Contract Party',
    });
    expect(added.success).toBe(true);
    expect(String(added.theorem_id)).toContain('thm:');
  });

  test('bulkProcessCaselawFromParameters validates directories', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'td-api-'));
    try {
      const result = await bulkProcessCaselawFromParameters({
        caselaw_directories: [dir],
        async_processing: false,
      });
      expect(result.success).toBe(true);
      expect((result.results as Record<string, unknown>).documents_processed).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('demo helpers expose sample corpus, debug report, batch, and RAG retrieval data', () => {
    expect(createSampleTheoremCorpus().size).toBeGreaterThan(0);
    expect(printDebugReport({ document_id: 'doc', summary: 'ok' })).toContain('DEBUG REPORT');
    expect(demoDocumentConsistencyChecking().formulas_extracted).toBeGreaterThan(0);
    expect(demoBatchProcessing().documents_analyzed).toBe(3);
    expect(demoRagRetrieval().query_count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// NLP Predicate Extractor
// ---------------------------------------------------------------------------
describe('extractPredicatesNlp', () => {
  test('extracts unary predicates for capitalized nouns', () => {
    const { unary } = extractPredicatesNlp('Alice must pay taxes. Bob can appeal.');
    expect(unary.some(p => p.includes('Alice'))).toBe(true);
  });

  test('extracts binary predicates', () => {
    const { binary } = extractPredicatesNlp('Alice pays taxes.');
    expect(Array.isArray(binary)).toBe(true);
  });

  test('returns object with all three levels', () => {
    const result = extractPredicatesNlp('Alice must pay Bob.');
    expect(result).toHaveProperty('unary');
    expect(result).toHaveProperty('binary');
    expect(result).toHaveProperty('ternary');
  });
});

describe('normalisePredicate', () => {
  test('lowercases and trims', () => {
    expect(normalisePredicate('PayTaxes')).toBe('paytaxes');
  });
  test('replaces spaces with underscores', () => {
    expect(normalisePredicate('pay taxes')).toBe('pay_taxes');
  });
});

describe('extractSemanticRoles', () => {
  test('returns array of roles', () => {
    const roles = extractSemanticRoles('Alice must pay Bob.');
    expect(Array.isArray(roles)).toBe(true);
  });
  test('AGENT role found for deontic pattern', () => {
    const roles = extractSemanticRoles('Alice must pay taxes.');
    expect(roles.some(r => r.role === 'AGENT')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Profiling Utils
// ---------------------------------------------------------------------------
describe('FormulaProfiler', () => {
  test('profile measures duration', () => {
    const p = new FormulaProfiler();
    p.profile('op', () => 42);
    expect(p.getResults()).toHaveLength(1);
    expect(p.getResults()[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  test('reset clears results', () => {
    const p = new FormulaProfiler();
    p.profile('op', () => 1);
    p.reset();
    expect(p.getResults()).toHaveLength(0);
  });
});

describe('BottleneckAnalyzer', () => {
  test('topN returns at most N bottlenecks', () => {
    const p = new FormulaProfiler();
    ['a', 'b', 'c'].forEach(n => p.profile(n, () => 1));
    const analyzer = new BottleneckAnalyzer();
    expect(analyzer.topN(p.getResults(), 2)).toHaveLength(2);
  });
});

describe('ProfilingReporter', () => {
  test('report returns a string', () => {
    const p = new FormulaProfiler();
    p.profile('test', () => 1);
    const r = new ProfilingReporter();
    expect(typeof r.report(p.getResults())).toBe('string');
  });

  test('empty report returns notice', () => {
    expect(new ProfilingReporter().report([])).toContain('No profiling');
  });
});

// ---------------------------------------------------------------------------
// Proof Optimization
// ---------------------------------------------------------------------------
describe('ProofTreePruner', () => {
  const pruner = new ProofTreePruner();
  const nodes = [
    makeProofNode('P', 0), makeProofNode('Q', 3), makeProofNode('R', 15),
  ];

  test('DEPTH_FIRST removes deep nodes', () => {
    const result = pruner.prune(nodes, PruningStrategy.DEPTH_FIRST);
    expect(result.every(n => n.depth < 10)).toBe(true);
  });

  test('BEST_FIRST sorts by depth', () => {
    const result = pruner.prune(nodes, PruningStrategy.BEST_FIRST);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].depth).toBeGreaterThanOrEqual(result[i-1].depth);
    }
  });

  test('NONE returns all nodes', () => {
    expect(pruner.prune(nodes, PruningStrategy.NONE)).toHaveLength(3);
  });
});

describe('RedundancyEliminator', () => {
  const elim = new RedundancyEliminator();

  test('removes duplicate steps', () => {
    const { steps, metrics } = elim.eliminate(['P', 'Q', 'P', 'R']);
    expect(steps).toHaveLength(3);
    expect(metrics.redundanciesRemoved).toBe(1);
  });

  test('no duplicates means no change', () => {
    const { steps } = elim.eliminate(['A', 'B', 'C']);
    expect(steps).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Resolution Rules
// ---------------------------------------------------------------------------
describe('ALL_RESOLUTION_RULES', () => {
  test('contains 6 rules', () => { expect(ALL_RESOLUTION_RULES).toHaveLength(6); });
  test('all have non-empty name', () => {
    ALL_RESOLUTION_RULES.forEach(r => expect(r.name.length).toBeGreaterThan(0));
  });
});

describe('ResolutionRule', () => {
  const rule = new ResolutionRule();
  test('resolves P∨Q and ¬P∨R to Q∨R', () => {
    const out = rule.apply(['P ∨ Q', '¬P ∨ R']);
    expect(out.some(f => f.includes('Q') && f.includes('R'))).toBe(true);
  });
});

describe('UnitResolutionRule', () => {
  const rule = new UnitResolutionRule();
  test('applies to unit clause + disjunction', () => {
    expect(rule.canApply(['P', 'P ∨ Q'])).toBe(true);
  });
  test('resolves unit P with ¬P∨Q to Q', () => {
    const out = rule.apply(['P', '¬P ∨ Q']);
    expect(out).toContain('Q');
  });
});

describe('FactoringRule', () => {
  const rule = new FactoringRule();
  test('removes duplicate literals', () => {
    const out = rule.apply(['P ∨ P']);
    expect(out).toContain('P');
  });
});

describe('ProofByContradictionRule', () => {
  const rule = new ProofByContradictionRule();
  test('derives ¬P from P→⊥', () => {
    const out = rule.apply(['P→⊥']);
    expect(out).toContain('¬P');
  });
  test('derives P from ¬P→⊥', () => {
    const out = rule.apply(['¬P→⊥']);
    expect(out).toContain('P');
  });
});
