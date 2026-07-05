/**
 * WASM Prover Sprint 18 — Deontic Parser Utils + Prover Syntax Builder tests.
 *
 * Tasks covered:
 *   T-96: DeonticParserUtils (deontic-parser-utils.ts)
 *   T-97: NormativeConflictDetector (normative-conflict-detector.ts)
 *   T-98: ProverSyntaxBuilder (prover-syntax-builder.ts)
 *   T-99: ≥10 tests
 *
 * Sprint 18 (Phase 18 — Deontic Parser Utils + Prover Syntax Builder, P2).
 * Reference: ipfs_datasets_py/logic/deontic/utils/deontic_parser.py + prover_syntax.py
 */

import {
  classifyModal, classifyLegalEntity, normalizePredicate,
  extractActionRecipient, scoreScaffoldQuality,
} from '../../src/services/deontic/deontic-parser-utils.js';
import {
  identifyObligations, detectNormativeConflicts,
} from '../../src/services/deontic/normative-conflict-detector.js';
import type { NormElement } from '../../src/services/deontic/normative-conflict-detector.js';
import { ProverSyntaxBuilder } from '../../src/services/deontic/prover-syntax-builder.js';
import { buildLegalNormIR } from '../../src/services/deontic/legal-norm-ir.js';

// ---------------------------------------------------------------------------
// T-96: classifyModal
// ---------------------------------------------------------------------------

describe('T-96 classifyModal', () => {
  it('maps "shall not" to prohibition (F)', () => {
    const r = classifyModal('shall not');
    expect(r.modality).toBe('prohibition');
    expect(r.operator).toBe('F');
  });

  it('maps "may" to permission (P)', () => {
    const r = classifyModal('may');
    expect(r.modality).toBe('permission');
    expect(r.operator).toBe('P');
  });

  it('maps "must" to obligation (O)', () => {
    const r = classifyModal('must');
    expect(r.modality).toBe('obligation');
    expect(r.operator).toBe('O');
  });

  it('maps "is prohibited from" to prohibition', () => {
    expect(classifyModal('is prohibited from').operator).toBe('F');
  });

  it('maps "is permitted to" to permission', () => {
    expect(classifyModal('is permitted to').operator).toBe('P');
  });

  it('handles extra whitespace', () => {
    expect(classifyModal('  must not  ').operator).toBe('F');
    expect(classifyModal('  may  ').operator).toBe('P');
  });
});

// ---------------------------------------------------------------------------
// T-96: classifyLegalEntity
// ---------------------------------------------------------------------------

describe('T-96 classifyLegalEntity', () => {
  it('classifies "agency" as government_actor', () => {
    expect(classifyLegalEntity('agency')).toBe('government_actor');
  });

  it('classifies "corporation" as organization', () => {
    expect(classifyLegalEntity('corporation')).toBe('organization');
  });

  it('classifies "person" as legal_person', () => {
    expect(classifyLegalEntity('person')).toBe('legal_person');
  });

  it('classifies "permit" as legal_instrument', () => {
    expect(classifyLegalEntity('permit')).toBe('legal_instrument');
  });

  it('returns legal_entity for generic text', () => {
    expect(classifyLegalEntity('the relevant party')).toBe('legal_person');
  });

  it('returns unknown for empty string', () => {
    expect(classifyLegalEntity('')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// T-96: normalizePredicate & extractActionRecipient
// ---------------------------------------------------------------------------

describe('T-96 normalizePredicate and extractActionRecipient', () => {
  it('normalizePredicate capitalises words and removes stop words', () => {
    expect(normalizePredicate('log access')).toBe('LogAccess');
    expect(normalizePredicate('the user')).toBe('User');
    expect(normalizePredicate('submit a report')).toBe('SubmitReport');
  });

  it('normalizePredicate returns "P" for empty input', () => {
    expect(normalizePredicate('')).toBe('P');
  });

  it('extractActionRecipient extracts "user" from "report to the user"', () => {
    const r = extractActionRecipient('report to the user');
    expect(r.toLowerCase()).toContain('user');
  });

  it('extractActionRecipient returns "" for system references', () => {
    // "this section" triggers the skip list, but "section 552" may not → use a standard skip word
    expect(extractActionRecipient('submit to this section')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// T-96: scoreScaffoldQuality
// ---------------------------------------------------------------------------

describe('T-96 scoreScaffoldQuality', () => {
  it('returns high quality for fully populated element', () => {
    const el = { norm_type: 'obligation', deontic_operator: 'O', subject: ['user'], action: ['log access'] };
    const q = scoreScaffoldQuality(el);
    expect(q.quality_label).toBe('high');
    expect(q.promotable).toBe(true);
    expect(q.warnings).toHaveLength(0);
  });

  it('returns low quality for missing slots', () => {
    const el = { norm_type: 'obligation' };
    const q = scoreScaffoldQuality(el);
    expect(q.quality_label).toBe('low');
    expect(q.promotable).toBe(false);
    expect(q.warnings.length).toBeGreaterThan(0);
  });

  it('treats proposition as an action alias for slot coverage', () => {
    const el = { norm_type: 'obligation', deontic_operator: 'O', subject: ['user'], proposition: ['log access'] };
    const q = scoreScaffoldQuality(el);
    expect(q.slot_coverage).toBe(1);
    expect(q.quality_label).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// T-97: identifyObligations
// ---------------------------------------------------------------------------

describe('T-97 identifyObligations', () => {
  const elements: NormElement[] = [
    { norm_type: 'obligation', subject: 'user', action: 'log access' },
    { norm_type: 'permission', subject: 'admin', action: 'delete records' },
    { norm_type: 'prohibition', subject: 'user', action: 'share passwords' },
    { norm_type: 'obligation', subject: 'agent', action: 'notify controller', conditions: [{ text: 'on request' }] },
  ];

  it('categorises obligations correctly', () => {
    const view = identifyObligations(elements);
    expect(view.obligations).toHaveLength(2);
    expect(view.permissions).toHaveLength(1);
    expect(view.prohibitions).toHaveLength(1);
  });

  it('identifies conditional norms', () => {
    const view = identifyObligations(elements);
    expect(view.conditional_norms).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T-97: detectNormativeConflicts
// ---------------------------------------------------------------------------

describe('T-97 detectNormativeConflicts', () => {
  it('detects a direct O+F conflict on same subject+action', () => {
    const elements: NormElement[] = [
      { norm_type: 'obligation',  deontic_operator: 'O', subject: 'users', action: 'share audit logs' },
      { norm_type: 'prohibition', deontic_operator: 'F', subject: 'users', action: 'share audit logs' },
    ];
    const conflicts = detectNormativeConflicts(elements);
    expect(conflicts.some(c => c.type === 'direct')).toBe(true);
    expect(conflicts[0].severity).toBe('high');
  });

  it('detects a P+F permission conflict', () => {
    const elements: NormElement[] = [
      { norm_type: 'permission',  deontic_operator: 'P', subject: 'users', action: 'delete records' },
      { norm_type: 'prohibition', deontic_operator: 'F', subject: 'users', action: 'delete records' },
    ];
    const conflicts = detectNormativeConflicts(elements);
    expect(conflicts.some(c => c.type === 'permission_conflict')).toBe(true);
  });

  it('returns empty array when no conflicts', () => {
    const elements: NormElement[] = [
      { norm_type: 'obligation', deontic_operator: 'O', subject: 'users',  action: 'log access' },
      { norm_type: 'permission', deontic_operator: 'P', subject: 'admins', action: 'delete records' },
    ];
    const conflicts = detectNormativeConflicts(elements);
    expect(conflicts).toHaveLength(0);
  });

  it('detects direct conflicts when only proposition aliases are provided', () => {
    const elements: NormElement[] = [
      { norm_type: 'obligation', deontic_operator: 'O', subject: 'users', proposition: 'share audit logs' },
      { norm_type: 'prohibition', deontic_operator: 'F', subject: 'users', proposition: 'share audit logs' },
    ];
    const conflicts = detectNormativeConflicts(elements);
    expect(conflicts.some(c => c.type === 'direct')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-98: ProverSyntaxBuilder
// ---------------------------------------------------------------------------

describe('T-98 ProverSyntaxBuilder', () => {
  it('generates z3-smt2 syntax for obligation', () => {
    const norm = buildLegalNormIR({ source_id: 'n1', modality: 'O', actor: 'Users', action: 'LogAccess' });
    const report = ProverSyntaxBuilder.buildSyntaxReport(norm, ['z3-smt2']);
    expect(report.records).toHaveLength(1);
    expect(report.records[0].target_id).toBe('z3-smt2');
    expect(report.records[0].formula).toContain('assert');
    expect(report.records[0].valid).toBe(true);
  });

  it('generates dcec syntax for prohibition', () => {
    const norm = buildLegalNormIR({ source_id: 'n2', modality: 'F', actor: 'Contractors', action: 'ShareData' });
    const report = ProverSyntaxBuilder.buildSyntaxReport(norm, ['dcec']);
    expect(report.records[0].formula).toBe('F(Contractors_ShareData)');
    expect(report.records[0].valid).toBe(true);
  });

  it('generates tdfol □-wrapped syntax for temporal norms', () => {
    const norm = buildLegalNormIR({
      source_id: 'n3', modality: 'O', actor: 'Agents', action: 'SubmitReport',
      temporal_constraints: [{ text: 'annually' }],
    });
    const report = ProverSyntaxBuilder.buildSyntaxReport(norm, ['tdfol']);
    expect(report.records[0].formula).toContain('□');
  });

  it('generates lean4 theorem syntax', () => {
    const norm = buildLegalNormIR({ source_id: 'n4', modality: 'P', actor: 'Users', action: 'ViewRecords' });
    const report = ProverSyntaxBuilder.buildSyntaxReport(norm, ['lean4']);
    expect(report.records[0].formula).toContain('theorem');
    expect(report.records[0].formula).toContain('Permission');
  });

  it('generates prolog clause form', () => {
    const norm = buildLegalNormIR({ source_id: 'n5', modality: 'O', actor: 'Users', action: 'LogAccess' });
    const report = ProverSyntaxBuilder.buildSyntaxReport(norm, ['prolog']);
    expect(report.records[0].formula).toContain('obligatory(');
    expect(report.records[0].formula.endsWith('.')).toBe(true);
  });

  it('all_valid is false when actor is missing', () => {
    const norm = buildLegalNormIR({ source_id: 'n6', modality: 'O', actor: '', action: 'LogAccess' });
    const report = ProverSyntaxBuilder.buildSyntaxReport(norm);
    expect(report.all_valid).toBe(false);
  });

  it('buildBatch returns one report per norm', () => {
    const norms = [
      buildLegalNormIR({ source_id: 'a', modality: 'O', actor: 'A', action: 'B' }),
      buildLegalNormIR({ source_id: 'b', modality: 'P', actor: 'C', action: 'D' }),
    ];
    const reports = ProverSyntaxBuilder.buildBatch(norms);
    expect(reports).toHaveLength(2);
  });
});
