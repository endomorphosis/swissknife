/**
 * wasm-prover-sprint84.test.ts
 * Tests for §12.20 parser/modal/observability residual closure.
 */

import {
  BaseParser,
  KeywordBaseParser,
  getParser,
  makeParserAdapter,
  normalizeParseResult,
} from '../../src/services/base-parser';
import { PortugueseParser } from '../../src/services/portuguese-parser';
import {
  BModalAxiomRule,
  DModalAxiomRule,
  FiveModalAxiomRule,
  FourModalAxiomRule,
  KModalAxiomRule,
  TModalAxiomRule,
  applyModalAxiomRules,
  getModalAxiomRules,
} from '../../src/services/modal-axiom-rules';
import { ModalLogic } from '../../src/services/shadow-prover';
import {
  PrometheusExporter,
  exportPrometheusMetrics,
  getPrometheusExporter,
  metricKey,
} from '../../src/services/prometheus-exporter';

// ---------------------------------------------------------------------------
// PORT-181 — shared parser base contract
// ---------------------------------------------------------------------------

describe('PORT-181 BaseParser contract', () => {
  it('provides parseAll and getLanguage through BaseParser', () => {
    const parser = new KeywordBaseParser('en');
    expect(parser).toBeInstanceOf(BaseParser);
    expect(parser.getLanguage()).toBe('en');
    const results = parser.parseAll(['Alice must pay.', 'Bob may read.']);
    expect(results).toHaveLength(2);
    expect(results[0]!.language).toBe('en');
  });

  it('normalizes language-specific parser results to the common contract', () => {
    const adapted = makeParserAdapter('pt', new PortugueseParser());
    const result = adapted.parse('O contratante deve entregar o relatório');
    expect(result.language).toBe('pt');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.clauses[0]).toMatchObject({ operator: 'obligation', type: 'deontic' });
  });

  it('normalizes malformed partial results with errors', () => {
    const result = normalizeParseResult({ text: 'nothing', clauses: [], matches: [] }, 'xx');
    expect(result.language).toBe('xx');
    expect(result.errors).toContain('No clauses extracted');
  });

  it('returns a default parser through getParser', () => {
    const parser = getParser('en');
    expect(parser.parse('Alice must pay').clauses[0]!.operator).toBe('obligation');
  });
});

// ---------------------------------------------------------------------------
// PORT-178 — named modal axiom rules
// ---------------------------------------------------------------------------

describe('PORT-178 modal axiom rules', () => {
  it('K rule derives boxed consequent from boxed implication and boxed antecedent', () => {
    const apps = new KModalAxiomRule().apply(['□(P→Q)', '□P']);
    expect(apps[0]).toMatchObject({ ruleName: 'K', conclusion: '□Q' });
  });

  it('T/4/D rules derive expected consequences from boxed formulas', () => {
    expect(new TModalAxiomRule().apply(['□P'])[0]!.conclusion).toBe('P');
    expect(new FourModalAxiomRule().apply(['□P'])[0]!.conclusion).toBe('□□P');
    expect(new DModalAxiomRule().apply(['□P'])[0]!.conclusion).toBe('◊P');
  });

  it('5 and B rules expose S5 frame consequences', () => {
    expect(new FiveModalAxiomRule().apply(['◊P'])[0]!.conclusion).toBe('□◊P');
    expect(new BModalAxiomRule().apply(['P'])[0]!.conclusion).toBe('□◊P');
  });

  it('filters rules by modal logic and applies them without duplicate conclusions', () => {
    expect(getModalAxiomRules(ModalLogic.K).map(r => r.name)).toEqual(['K']);
    expect(getModalAxiomRules(ModalLogic.S5).map(r => r.name)).toEqual(['K', 'T', '4', '5', 'B', 'D']);
    const apps = applyModalAxiomRules(['□P', 'P'], ModalLogic.S5);
    expect(apps.map(a => a.conclusion)).toEqual(expect.arrayContaining(['□□P', '◊P', '□◊P']));
  });
});

// ---------------------------------------------------------------------------
// PORT-202 — Prometheus metrics exporter
// ---------------------------------------------------------------------------

describe('PORT-202 PrometheusExporter', () => {
  it('exports counters and gauges in Prometheus text format', () => {
    const exporter = new PrometheusExporter();
    exporter.incrementCounter('proof_requests_total', 2, { prover: 'z3' }, 'Proof requests');
    exporter.setGauge('active_proofs', 3, { queue: 'main' }, 'Active proofs');
    const text = exporter.exportText();
    expect(text).toContain('# TYPE proof_requests_total counter');
    expect(text).toContain('proof_requests_total{prover="z3"} 2');
    expect(text).toContain('active_proofs{queue="main"} 3');
  });

  it('exports histogram buckets, sum, and count', () => {
    const exporter = new PrometheusExporter();
    exporter.observeHistogram('proof_duration_ms', 12, { prover: 'cvc5' }, [10, 20]);
    const text = exporter.exportText();
    expect(text).toContain('proof_duration_ms_bucket{le="10",prover="cvc5"} 0');
    expect(text).toContain('proof_duration_ms_bucket{le="20",prover="cvc5"} 1');
    expect(text).toContain('proof_duration_ms_bucket{le="+Inf",prover="cvc5"} 1');
    expect(text).toContain('proof_duration_ms_sum{prover="cvc5"} 12');
    expect(text).toContain('proof_duration_ms_count{prover="cvc5"} 1');
  });

  it('sanitizes metric keys and exposes global exporter helpers', () => {
    expect(metricKey('bad metric', { 'bad-label': 'x' })).toContain('bad_metric');
    const exporter = getPrometheusExporter();
    exporter.reset();
    exporter.incrementCounter('logic_events_total');
    expect(exportPrometheusMetrics(exporter)).toContain('logic_events_total 1');
  });
});
