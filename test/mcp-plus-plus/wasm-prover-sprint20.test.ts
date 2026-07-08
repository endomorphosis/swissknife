/**
 * WASM Prover Sprint 20 — I18N Conflict + E2E Validator + Logic Public API tests.
 *
 * Tasks:
 *   T-104: I18NConflictReport (i18n-conflict-report.ts)
 *   T-105: E2EValidator (e2e-validator.ts)
 *   T-106: LogicPublicApi (logic-public-api.ts)
 *   T-107: ≥10 tests
 *
 * Sprint 20 (Phase 20 — Integration layer, P2).
 */

import {
  I18NConflictReport,
  detectMultilingualConflicts,
} from '../../src/services/logic/deontic/i18n-conflict-report.js';
import { E2EValidator } from '../../src/services/logic/api/e2e-validator.js';
import { LogicPublicApi } from '../../src/services/logic/api/logic-public-api.js';
import { LogicMonitor } from '../../src/services/logic/shared/logic-monitor.js';

// ---------------------------------------------------------------------------
// T-104: I18NConflictReport
// ---------------------------------------------------------------------------

describe('T-104 I18NConflictReport', () => {
  it('starts with zero conflicts', () => {
    const report = new I18NConflictReport();
    expect(report.totalConflicts).toBe(0);
    expect(report.languagesWithConflicts).toHaveLength(0);
    expect(report.mostConflictedLanguage()).toBeNull();
    expect(report.leastConflictedLanguage()).toBeNull();
    expect(report.conflictDensity()).toBe(0);
    expect(report.hasConflicts()).toBe(false);
  });

  it('addConflicts accumulates correctly', () => {
    const report = new I18NConflictReport();
    const fakeConflict: any = { id: 'c1', type: 'direct', severity: 'high', entities: [], statement1: {} as any, statement2: {} as any, description: '', resolution: '' };
    report.addConflicts('en', [fakeConflict]);
    report.addConflicts('fr', [fakeConflict, fakeConflict]);
    expect(report.totalConflicts).toBe(3);
    expect(report.languagesWithConflicts).toEqual(['en', 'fr']);
    expect(report.mostConflictedLanguage()).toBe('fr');
    expect(report.leastConflictedLanguage()).toBe('en');
    expect(report.hasConflicts()).toBe(true);
  });

  it('conflictDensity returns average conflicts per language', () => {
    const report = new I18NConflictReport();
    const c: any = { id: 'c', type: 'direct', severity: 'high', entities: [], statement1: {} as any, statement2: {} as any, description: '', resolution: '' };
    report.addConflicts('en', [c, c]);  // 2
    report.addConflicts('fr', [c]);     // 1
    report.addConflicts('de', []);      // 0
    expect(report.conflictDensity()).toBeCloseTo(1.0, 5); // 3 / 3
  });

  it('toDict serialises to plain object', () => {
    const report = new I18NConflictReport({ 'en': [], 'fr': [] });
    const d = report.toDict();
    expect(typeof d).toBe('object');
    expect('en' in d).toBe(true);
    expect('fr' in d).toBe(true);
  });

  it('detectMultilingualConflicts returns I18NConflictReport', () => {
    const texts = new Map([
      ['en', 'Users must log access.'],
      ['fr', 'Les utilisateurs doivent consigner les accès.'],
    ]);
    const report = detectMultilingualConflicts(texts);
    expect(report).toBeInstanceOf(I18NConflictReport);
    expect(report.byLanguage.size).toBe(2);
    expect(report.byLanguage.has('en')).toBe(true);
    expect(report.byLanguage.has('fr')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-105: E2EValidator
// ---------------------------------------------------------------------------

describe('T-105 E2EValidator.run()', () => {
  it('runs all tests and returns a summary', async () => {
    const validator = new E2EValidator();
    const summary = await validator.run();
    expect(typeof summary.all_passed).toBe('boolean');
    expect(typeof summary.passed).toBe('number');
    expect(typeof summary.failed).toBe('number');
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.passed + summary.failed).toBe(summary.total);
    expect(Array.isArray(summary.results)).toBe(true);
    expect(summary.duration_ms).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('all test results have expected fields', async () => {
    const validator = new E2EValidator();
    const summary = await validator.run();
    for (const r of summary.results) {
      expect(typeof r.test_name).toBe('string');
      expect(typeof r.passed).toBe('boolean');
      expect(typeof r.duration_ms).toBe('number');
      expect(typeof r.message).toBe('string');
    }
  }, 30_000);

  it('key pipeline tests pass: fol_pipeline, deontic_pipeline', async () => {
    const validator = new E2EValidator();
    const summary   = await validator.run();
    const folTest     = summary.results.find(r => r.test_name === 'fol_pipeline');
    const deonticTest = summary.results.find(r => r.test_name === 'deontic_pipeline');
    expect(folTest?.passed).toBe(true);
    expect(deonticTest?.passed).toBe(true);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// T-106: LogicPublicApi
// ---------------------------------------------------------------------------

describe('T-106 LogicPublicApi', () => {
  let api: LogicPublicApi;
  beforeEach(() => {
    LogicMonitor.resetInstance();
    api = new LogicPublicApi();
  });
  afterEach(() => LogicMonitor.resetInstance());

  it('compileNlToPolicy returns LegalNormIR array', async () => {
    const norms = await api.compileNlToPolicy('Users must log access.');
    expect(Array.isArray(norms)).toBe(true);
    for (const norm of norms) {
      expect(typeof norm.source_id).toBe('string');
      expect(typeof norm.modality).toBe('string');
    }
  });

  it('evaluateNlPolicy returns ProverSyntaxReport array', async () => {
    const reports = await api.evaluateNlPolicy('Admins may delete records.');
    expect(Array.isArray(reports)).toBe(true);
  });

  it('analyzeText returns full pipeline result', async () => {
    const result = await api.analyzeText('Users must log all access events.');
    expect(result.text).toBe('Users must log all access events.');
    expect(typeof result.fol.formula).toBe('string');
    expect(Array.isArray(result.statements)).toBe(true);
    expect(Array.isArray(result.conflicts)).toBe(true);
    expect(Array.isArray(result.norms)).toBe(true);
    expect(Array.isArray(result.decoded)).toBe(true);
    expect(Array.isArray(result.syntax)).toBe(true);
    expect(result.graph).toBeDefined();
  });

  it('detectMultilingualConflicts returns I18NConflictReport', async () => {
    const texts = new Map([
      ['en', 'Users must log access.'],
      ['de', 'Benutzer dürfen auf Daten zugreifen.'],
    ]);
    const report = await api.detectMultilingualConflicts(texts);
    expect(report).toBeInstanceOf(I18NConflictReport);
    expect(report.byLanguage.has('en')).toBe(true);
    expect(report.byLanguage.has('de')).toBe(true);
  });

  it('getSubmoduleSpecs returns ≥15 specs', () => {
    expect(api.getSubmoduleSpecs().length).toBeGreaterThanOrEqual(15);
  });

  it('getIntegrationManifest has total ≥ 15', () => {
    const manifest = api.getIntegrationManifest();
    expect((manifest['total'] as number)).toBeGreaterThanOrEqual(15);
  });

  it('monitor tracks operations', async () => {
    await api.analyzeText('test text');
    const metrics = api.monitor.getMetrics();
    expect(metrics.operations['analyze_text']).toBeDefined();
    expect(metrics.operations['analyze_text']!.total_count).toBeGreaterThan(0);
  });

  it('analyzeTexts batch returns BatchResult', async () => {
    const texts = ['Users must log access.', 'Admins may view records.'];
    const result = await api.analyzeTexts(texts, { concurrency: 2 });
    expect(result.total_items).toBe(2);
    expect(result.successful).toBe(2);
    expect(result.failed).toBe(0);
  });
});
