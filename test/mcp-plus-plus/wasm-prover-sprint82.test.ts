/**
 * wasm-prover-sprint82.test.ts
 * Tests for §12.20 residual gap closure.
 */

import {
  PortugueseParser,
  PortuguesePatternMatcher,
  PT_DEONTIC_OP,
  PT_COGNITIVE_OP,
  PT_TEMPORAL_OP,
  getPortugueseArticles,
  getPortugueseDeonticKeywords,
  getPortugueseLegalTerms,
  getPortugueseNegationPatterns,
  getPortugueseVerbConjugations,
} from '../../src/services/logic/nl/portuguese-parser.js';
import {
  formatFormula,
  format_formula,
  normalizeFormula,
  normalize_formula,
  toAscii,
  toJsonRecord,
  toLatex,
  to_latex,
  toProlog,
  toTptp,
  toUnicode,
  to_unicode,
} from '../../src/services/fol/fol-logic-formatter.js';
import {
  FeatureDetector,
  clearFeatureDetectionCache,
  detectEnvironmentFeatures,
  detectModule,
  detectRuntimeFeature,
  importOptionalModule,
  isModuleAvailable,
} from '../../src/services/platform/feature-detection.js';
import {
  UtilityMonitor,
  clearGlobalCache,
  getGlobalRecords,
  getGlobalStats,
  resetGlobalStats,
  trackPerformance,
  withCaching,
} from '../../src/services/platform/utility-monitor.js';

// ---------------------------------------------------------------------------
// PORT-179 — dedicated Portuguese CEC/NL parser
// ---------------------------------------------------------------------------

describe('PORT-179 PortuguesePatternMatcher', () => {
  const matcher = new PortuguesePatternMatcher();

  it('detects obligation from deve', () => {
    const matches = matcher.matchByType('O contratante deve entregar o relatório', 'deontic');
    expect(matches.some(m => m.operator === PT_DEONTIC_OP.OBLIGATION)).toBe(true);
  });

  it('detects prohibition without also reporting overlapping obligation', () => {
    const matches = matcher.matchByType('O empregado não deve divulgar dados', 'deontic');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.operator).toBe(PT_DEONTIC_OP.PROHIBITION);
    expect(matches[0]!.groups[1]).toBe('divulgar dados');
  });

  it('detects permission from pode', () => {
    const matches = matcher.matchByType('O titular pode solicitar acesso', 'deontic');
    expect(matches.some(m => m.operator === PT_DEONTIC_OP.PERMISSION)).toBe(true);
  });

  it('detects cognitive belief and knowledge patterns', () => {
    const belief = matcher.matchByType('A autoridade acredita que o contrato é válido', 'cognitive');
    const knowledge = matcher.matchByType('O agente sabe que a regra se aplica', 'cognitive');
    expect(belief.some(m => m.operator === PT_COGNITIVE_OP.BELIEF)).toBe(true);
    expect(knowledge.some(m => m.operator === PT_COGNITIVE_OP.KNOWLEDGE)).toBe(true);
  });

  it('detects temporal always and until patterns', () => {
    const always = matcher.matchByType('Sempre cumprir as normas', 'temporal');
    const until = matcher.matchByType('reter dados até que expire o prazo', 'temporal');
    expect(always.some(m => m.operator === PT_TEMPORAL_OP.ALWAYS)).toBe(true);
    expect(until.some(m => m.operator === PT_TEMPORAL_OP.UNTIL)).toBe(true);
  });
});

describe('PORT-179 PortugueseParser', () => {
  const parser = new PortugueseParser();

  it('returns text, matches, and normalized clauses', () => {
    const result = parser.parse('O contratante deve entregar o relatório');
    expect(result.text).toBe('O contratante deve entregar o relatório');
    expect(result.matches).toHaveLength(1);
    expect(result.clauses[0]).toMatchObject({
      operator: PT_DEONTIC_OP.OBLIGATION,
      type: 'deontic',
      subject: 'contratante',
      predicate: 'entregar o relatório',
    });
  });

  it('keeps confidence scores bounded', () => {
    const { clauses } = parser.parse('A empresa pode processar dados');
    expect(clauses[0]!.confidence).toBeGreaterThanOrEqual(0);
    expect(clauses[0]!.confidence).toBeLessThanOrEqual(1);
  });
});

describe('PORT-179 Portuguese lexicon functions', () => {
  it('exposes verb conjugations, articles, negation patterns, and legal terms', () => {
    expect(getPortugueseVerbConjugations().dever.ele).toBe('deve');
    expect(getPortugueseArticles().definite_masc_sg).toContain('o');
    expect(getPortugueseNegationPatterns()).toContain('não deve');
    expect(getPortugueseLegalTerms().contrato).toBe('contract');
  });

  it('groups deontic keywords by modality', () => {
    const keywords = getPortugueseDeonticKeywords();
    expect(keywords.obligation).toContain('deve');
    expect(keywords.permission).toContain('é permitido');
    expect(keywords.prohibition).toContain('é proibido');
    expect(keywords.negation).toContain('não');
  });
});

// ---------------------------------------------------------------------------
// PORT-188 — standalone FOL logic formatter
// ---------------------------------------------------------------------------

describe('PORT-188 logic formatter normalization', () => {
  it('normalizes ASCII quantifiers and operators to Unicode', () => {
    expect(normalizeFormula('forall x. Human(x) -> Mortal(x)')).toBe('∀x. Human(x) → Mortal(x)');
    expect(toUnicode('exists x. Human(x) /\\ Kind(x)')).toBe('∃x. Human(x) ∧ Kind(x)');
  });

  it('exports Python-compatible snake_case aliases', () => {
    expect(normalize_formula('forall x. P(x)')).toBe(normalizeFormula('forall x. P(x)'));
    expect(to_unicode('exists x. P(x)')).toBe(toUnicode('exists x. P(x)'));
    expect(to_latex('∀x. P(x)')).toBe(toLatex('∀x. P(x)'));
    expect(format_formula('∀x. P(x)', 'ascii')).toBe(formatFormula('∀x. P(x)', 'ascii'));
  });
});

describe('PORT-188 logic formatter output formats', () => {
  const formula = '∀x. Human(x) → Mortal(x)';

  it('converts Unicode to portable ASCII', () => {
    expect(toAscii(formula)).toBe('forall x. Human(x) -> Mortal(x)');
  });

  it('renders a LaTeX math fragment', () => {
    const latex = toLatex(formula);
    expect(latex).toContain('\\forall x.');
    expect(latex).toContain('\\rightarrow');
  });

  it('renders simple Horn formulas as Prolog', () => {
    expect(toProlog(formula)).toBe('mortal(X) :- human(X).');
  });

  it('renders a TPTP fof declaration', () => {
    expect(toTptp(formula, 'human_mortal')).toBe('fof(human_mortal, conjecture, (! [X] : human(X) => mortal(X))).');
  });

  it('formats via the dispatcher', () => {
    expect(formatFormula(formula, 'prolog')).toBe('mortal(X) :- human(X).');
    expect(formatFormula(formula, { format: 'tptp', name: 'hm', role: 'axiom' })).toContain('fof(hm, axiom,');
    expect(formatFormula(formula, 'pretty')).toContain('\n  → ');
  });

  it('returns JSON metadata with predicates and variables', () => {
    const record = toJsonRecord(formula);
    expect(record.predicates).toEqual(['Human', 'Mortal']);
    expect(record.variables).toEqual(['x']);
    expect(JSON.parse(formatFormula(formula, 'json'))).toMatchObject({ unicode: formula });
  });
});

// ---------------------------------------------------------------------------
// PORT-204 — dedicated feature detection + utility monitor modules
// ---------------------------------------------------------------------------

describe('PORT-204 feature detection module', () => {
  beforeEach(() => clearFeatureDetectionCache());

  it('checks built-in and missing modules', () => {
    expect(isModuleAvailable('path')).toBe(true);
    expect(isModuleAvailable('this-module-does-not-exist-82')).toBe(false);
    expect(detectModule('path')).toMatchObject({ name: 'path', available: true, kind: 'module' });
  });

  it('imports optional modules safely', () => {
    const pathModule = importOptionalModule<{ join: (...parts: string[]) => string }>('path');
    expect(pathModule?.join('a', 'b')).toContain('a');
    expect(importOptionalModule('this-module-does-not-exist-82')).toBeNull();
  });

  it('checks runtime features and returns detailed reports', () => {
    const detector = new FeatureDetector();
    expect(detector.checkRuntime('node')).toBe(true);
    expect(detector.checkMany(['path'], 'module')).toEqual({ path: true });
    const report = detector.getDetailedReport();
    expect(report.checked.node).toBe(true);
    expect(report.details.node.kind).toBe('runtime');
    expect(detectRuntimeFeature('webassembly').kind).toBe('runtime');
    expect(detectEnvironmentFeatures().checked).toHaveProperty('node');
  });
});

describe('PORT-204 utility monitor module', () => {
  beforeEach(() => {
    resetGlobalStats();
    clearGlobalCache();
  });

  it('tracks synchronous operations and summarizes by name', () => {
    const monitor = new UtilityMonitor();
    expect(monitor.track('compute', () => 42)).toBe(42);
    const stats = monitor.getStats('compute');
    expect(stats).toMatchObject({ name: 'compute', calls: 1, failures: 0 });
    expect(monitor.getSummary().totalCalls).toBe(1);
  });

  it('tracks async operations', async () => {
    const monitor = new UtilityMonitor();
    await expect(monitor.trackAsync('async-compute', async () => 'ok')).resolves.toBe('ok');
    expect(monitor.getRecords()[0]!.success).toBe(true);
  });

  it('records cache hits for monitor cached calls', () => {
    const monitor = new UtilityMonitor();
    let calls = 0;
    expect(monitor.cachedCall('k', () => ++calls)).toBe(1);
    expect(monitor.cachedCall('k', () => ++calls)).toBe(1);
    expect(calls).toBe(1);
    expect(monitor.getSummary().cacheHits).toBe(1);
  });

  it('tracks global performance and cache stats', () => {
    const addOne = trackPerformance((n: number) => n + 1, 'addOne');
    expect(addOne(2)).toBe(3);
    expect(withCaching('answer', () => 42)).toBe(42);
    expect(withCaching('answer', () => 43)).toBe(42);
    expect(getGlobalStats()).toMatchObject({ totalCalls: 3, cacheHits: 1, cacheSize: 1 });
    expect(getGlobalRecords().map(r => r.name)).toEqual(['addOne', 'answer', 'answer']);
  });
});
