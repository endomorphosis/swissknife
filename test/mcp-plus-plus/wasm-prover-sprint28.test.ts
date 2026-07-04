/**
 * wasm-prover-sprint28.test.ts
 *
 * Sprint 28: Multiview Aggregator + Deontic Formula Builder
 */

import {
  MultiViewLegalIRReport, LegalIRTrainingTarget,
  evaluateLegalIRMultiview, toTrainingTarget, BridgeAdapter,
} from '../../src/services/bridge-multiview.js';
import {
  normalizePredicateName, canonicalModalityOperator,
  buildDeonticFormulaFromIR, buildDeonticFormulasFromIRList,
  buildDeonticFormulaRecordFromIR, buildDeonticFormulaRecordsFromIRs,
  buildProverSyntaxRecordsFromIR, parserElementToFormulaRecord,
} from '../../src/services/deontic-formula-builder.js';
import { FolTdfolBridgeAdapter } from '../../src/services/fol-tdfol-bridge.js';
import { DeonticNormsBridgeAdapter } from '../../src/services/deontic-norms-bridge.js';
import { LegalIRDocument } from '../../src/services/bridge-types.js';
import { buildLegalNormIR } from '../../src/services/deontic/legal-norm-ir.js';

const LEGAL_TEXT =
  'No person shall be deprived of liberty without due process. ' +
  'The authority may grant a permit. ' +
  'All contracts must be executed in writing.';

// ---------------------------------------------------------------------------
// normalizePredicateName
// ---------------------------------------------------------------------------

describe('normalizePredicateName', () => {
  test('PascalCases multi-word phrase', () => {
    expect(normalizePredicateName('right to privacy')).toBe('RightPrivacy');
  });

  test('removes stop words', () => {
    expect(normalizePredicateName('the right of the people')).toBe('RightPeople');
  });

  test('handles empty string', () => {
    expect(normalizePredicateName('')).toBe('P');
  });

  test('preserves "for" after apply', () => {
    const result = normalizePredicateName('applies for benefits');
    expect(result).toContain('For');
  });

  test('handles underscored phrases', () => {
    expect(normalizePredicateName('due_process')).toBe('DueProcess');
  });

  test('handles single word', () => {
    expect(normalizePredicateName('person')).toBe('Person');
  });
});

// ---------------------------------------------------------------------------
// canonicalModalityOperator
// ---------------------------------------------------------------------------

describe('canonicalModalityOperator', () => {
  test('returns O for "O" modality', () => {
    expect(canonicalModalityOperator('O')).toBe('O');
  });

  test('returns P for "permission" modality', () => {
    expect(canonicalModalityOperator('permission')).toBe('P');
  });

  test('returns F for "prohibition" modality', () => {
    expect(canonicalModalityOperator('prohibition')).toBe('F');
  });

  test('returns DEF for "definition" norm_type', () => {
    expect(canonicalModalityOperator('', 'definition')).toBe('DEF');
  });

  test('returns EXEMPT for "exemption" norm_type', () => {
    expect(canonicalModalityOperator('', 'exemption')).toBe('EXEMPT');
  });

  test('returns PURP for "purpose" norm_type', () => {
    expect(canonicalModalityOperator('', 'purpose')).toBe('PURP');
  });

  test('returns O for "obligation" norm_type', () => {
    expect(canonicalModalityOperator('', 'obligation')).toBe('O');
  });

  test('returns empty string for unknown', () => {
    expect(canonicalModalityOperator('', '')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// buildDeonticFormulaFromIR
// ---------------------------------------------------------------------------

describe('buildDeonticFormulaFromIR', () => {
  test('obligation → O(Subject, Action)', () => {
    const norm = buildLegalNormIR({ modality: 'O', actor: 'Person', action: 'Register' });
    expect(buildDeonticFormulaFromIR(norm)).toBe('O(Person, Register)');
  });

  test('permission → P(Subject, Action)', () => {
    const norm = buildLegalNormIR({ modality: 'P', actor: 'Authority', action: 'Grant' });
    expect(buildDeonticFormulaFromIR(norm)).toBe('P(Authority, Grant)');
  });

  test('prohibition → F(Subject, Action)', () => {
    const norm = buildLegalNormIR({ modality: 'F', actor: 'Person', action: 'Disclose' });
    expect(buildDeonticFormulaFromIR(norm)).toBe('F(Person, Disclose)');
  });

  test('definition → Definition(Subject)', () => {
    const norm = buildLegalNormIR({ modality: 'DEF', actor: 'Agency' });
    expect(buildDeonticFormulaFromIR(norm)).toBe('Definition(Agency)');
  });

  test('purpose → Purpose(Subject, Action)', () => {
    const norm = buildLegalNormIR({ modality: 'PURP', actor: 'Entity', action: 'ProtectData' });
    expect(buildDeonticFormulaFromIR(norm)).toBe('Purpose(Entity, Protectdata)');
  });

  test('applicability → AppliesTo(Subject, Target)', () => {
    const norm = buildLegalNormIR({ modality: 'APP', actor: 'Law', action: 'apply to residents' });
    const f = buildDeonticFormulaFromIR(norm);
    expect(f).toMatch(/^AppliesTo\(/);
  });

  test('exemption → ExemptFrom(Subject, Target)', () => {
    const norm = buildLegalNormIR({ modality: 'EXEMPT', actor: 'NonProfit', action: 'exempt from tax' });
    const f = buildDeonticFormulaFromIR(norm);
    expect(f).toMatch(/^ExemptFrom\(/);
  });

  test('lifecycle valid for → ValidFor()', () => {
    const norm = buildLegalNormIR({ modality: 'LIFE', actor: 'License', action: 'valid for two years' });
    expect(buildDeonticFormulaFromIR(norm)).toMatch(/^ValidFor\(/);
  });

  test('textual modality "obligation" → O operator', () => {
    const norm = buildLegalNormIR({ modality: 'obligation', actor: 'Agent', action: 'Act' });
    expect(buildDeonticFormulaFromIR(norm)).toMatch(/^O\(/);
  });
});

describe('buildDeonticFormulasFromIRList', () => {
  test('returns array of formula strings', () => {
    const norms = [
      buildLegalNormIR({ modality: 'O', actor: 'Person', action: 'Register' }),
      buildLegalNormIR({ modality: 'P', actor: 'Court', action: 'Extend' }),
    ];
    const formulas = buildDeonticFormulasFromIRList(norms);
    expect(formulas).toHaveLength(2);
    for (const f of formulas) expect(typeof f).toBe('string');
  });
});

describe('deontic formula record builders', () => {
  test('builds source-grounded formula records from IRs', () => {
    const norm = buildLegalNormIR({ source_id: 'n1', canonical_citation: '§ 1', modality: 'O', actor: 'Person', action: 'Register' });
    const record = buildDeonticFormulaRecordFromIR(norm);

    expect(record).toMatchObject({
      source_id: 'n1',
      canonical_citation: '§ 1',
      target_logic: 'deontic',
      formula: 'O(Person, Register)',
      modality: 'O',
      norm_type: 'obligation',
    });
    expect(String(record.formula_id)).toMatch(/^formula:/);
    expect(record.included_formula_slots).toEqual(expect.arrayContaining(['actor', 'modality', 'action']));
    expect(buildDeonticFormulaRecordsFromIRs([norm])).toHaveLength(1);
  });

  test('builds prover syntax records and parser-element formula records', () => {
    const norm = buildLegalNormIR({ source_id: 'n2', modality: 'P', actor: 'Agency', action: 'Inspect records' });
    const proverRecords = buildProverSyntaxRecordsFromIR(norm, ['fol', 'deontic_fol']);
    const parserRecord = parserElementToFormulaRecord({
      source_id: 'p1',
      canonical_citation: '§ 2',
      deontic_operator: 'F',
      norm_type: 'prohibition',
      subject: ['operator'],
      action: ['disclose records'],
      text: 'The operator shall not disclose records.',
      support_span: [0, 40],
    });

    expect(proverRecords.map(record => record.target_logic)).toEqual(['fol', 'deontic_fol']);
    expect(proverRecords[0]).toMatchObject({ source_id: 'n2', status: expect.any(String) });
    expect(parserRecord).toMatchObject({
      source_id: 'p1',
      canonical_citation: '§ 2',
      formula: 'F(Operator, DiscloseRecords)',
    });
  });
});

// ---------------------------------------------------------------------------
// evaluateLegalIRMultiview + MultiViewLegalIRReport
// ---------------------------------------------------------------------------

describe('evaluateLegalIRMultiview', () => {
  const adapters: BridgeAdapter[] = [
    new FolTdfolBridgeAdapter() as BridgeAdapter,
    new DeonticNormsBridgeAdapter() as BridgeAdapter,
  ];

  test('returns MultiViewLegalIRReport', () => {
    const report = evaluateLegalIRMultiview(LEGAL_TEXT, adapters);
    expect(report).toBeInstanceOf(MultiViewLegalIRReport);
  });

  test('attemptedCount equals adapter count', () => {
    const report = evaluateLegalIRMultiview(LEGAL_TEXT, adapters);
    expect(report.attemptedCount).toBe(adapters.length);
  });

  test('document is a LegalIRDocument', () => {
    const report = evaluateLegalIRMultiview(LEGAL_TEXT, adapters);
    expect(report.document).toBeInstanceOf(LegalIRDocument);
  });

  test('merged document has views from both adapters', () => {
    const report = evaluateLegalIRMultiview(LEGAL_TEXT, adapters);
    const viewNames = Object.keys(report.document.views);
    expect(viewNames.length).toBeGreaterThan(0);
  });

  test('reports are populated for each adapter', () => {
    const report = evaluateLegalIRMultiview(LEGAL_TEXT, adapters);
    for (const name of Object.keys(report.reports)) {
      expect(adapters.map(a => a.name)).toContain(name);
    }
  });

  test('toDict() includes acceptance_rate and bridge_names', () => {
    const report = evaluateLegalIRMultiview(LEGAL_TEXT, adapters);
    const d = report.toDict();
    expect(d).toHaveProperty('acceptance_rate');
    expect(d).toHaveProperty('bridge_names');
  });
});

// ---------------------------------------------------------------------------
// LegalIRTrainingTarget + toTrainingTarget
// ---------------------------------------------------------------------------

describe('toTrainingTarget', () => {
  test('returns LegalIRTrainingTarget', () => {
    const report = evaluateLegalIRMultiview(LEGAL_TEXT, [new FolTdfolBridgeAdapter() as BridgeAdapter]);
    const target = toTrainingTarget(report);
    expect(target).toBeInstanceOf(LegalIRTrainingTarget);
  });

  test('totalLoss is a number', () => {
    const report = evaluateLegalIRMultiview(LEGAL_TEXT, [new FolTdfolBridgeAdapter() as BridgeAdapter]);
    const target = toTrainingTarget(report);
    expect(typeof target.totalLoss).toBe('number');
    expect(target.totalLoss).toBeGreaterThanOrEqual(0);
  });

  test('toDict includes document_id and bridge_names', () => {
    const report = evaluateLegalIRMultiview(LEGAL_TEXT, [new FolTdfolBridgeAdapter() as BridgeAdapter]);
    const d = toTrainingTarget(report).toDict();
    expect(d).toHaveProperty('document_id');
    expect(d).toHaveProperty('bridge_names');
    expect(d).toHaveProperty('total_loss');
  });
});
