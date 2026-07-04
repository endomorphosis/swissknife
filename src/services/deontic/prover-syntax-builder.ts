/**
 * ProverSyntaxBuilder — generates prover-ready syntax strings from LegalNormIR.
 *
 * Mirrors ipfs_datasets_py/logic/deontic/prover_syntax.py (1652 lines):
 *   class ProverTargetSyntaxRecord
 *   class ProverSyntaxReport
 *   build_prover_syntax_records_from_irs(irs)
 *   validate_ir_with_provers(irs)
 *
 * Connects `LegalNormIR` (Sprint 17) to the local prover stack:
 *   Z3-SMT2 syntax for `Z3WasmBridge`
 *   DCEC syntax for `DcecProverBridge`
 *   TDFOL syntax for `TdfolProverBridge`
 *   Lean 4 syntax for `Lean4WasmBridge`
 *
 * Sprint 18, T-98.
 * Reference: ipfs_datasets_py/logic/deontic/prover_syntax.py
 */

import type { LegalNormIR } from './legal-norm-ir.js';
import { normalizePredicate } from './deontic-parser-utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProverTarget = 'z3-smt2' | 'smt-lib2' | 'dcec' | 'tdfol' | 'lean4' | 'coq' | 'tptp' | 'prolog' | 'json-ir';

export const DEFAULT_PROVER_TARGETS: ProverTarget[] = ['z3-smt2', 'dcec', 'tdfol', 'lean4', 'prolog'];
export const ALL_PROVER_TARGETS: ProverTarget[] = ['z3-smt2', 'smt-lib2', 'dcec', 'tdfol', 'lean4', 'coq', 'tptp', 'prolog', 'json-ir'];

/**
 * Syntax validation result for one prover target.
 *
 * Python ref: ProverTargetSyntaxRecord dataclass.
 */
export interface ProverTargetSyntaxRecord {
  /** The prover target identifier. */
  readonly target_id:     ProverTarget;
  /** Generated formula / syntax string. */
  readonly formula:       string;
  /** Human-readable description of the syntax. */
  readonly syntax_type:   string;
  /** True if the syntax is structurally valid. */
  readonly valid:         boolean;
  /** Non-fatal warnings. */
  readonly warnings:      string[];
}

/**
 * Aggregated prover syntax report for a single `LegalNormIR`.
 *
 * Python ref: ProverSyntaxReport dataclass.
 */
export interface ProverSyntaxReport {
  /** The source IR. */
  readonly norm_id:    string;
  readonly modality:   string;
  readonly actor:      string;
  readonly proposition: string;
  readonly action:     string;
  /** One record per prover target. */
  readonly records:    ProverTargetSyntaxRecord[];
  /** True if all records are valid. */
  readonly all_valid:  boolean;
}

export interface ProverSyntaxValidationIssue {
  readonly target_id: ProverTarget;
  readonly severity: 'warning' | 'error';
  readonly code: string;
  readonly message: string;
}

export interface ProverSyntaxValidationReport {
  readonly norm_id: string;
  readonly expectedTargets: ProverTarget[];
  readonly presentTargets: ProverTarget[];
  readonly missingTargets: ProverTarget[];
  readonly proofReadyTargets: ProverTarget[];
  readonly coverageRate: number;
  readonly allValid: boolean;
  readonly issues: ProverSyntaxValidationIssue[];
}

// ---------------------------------------------------------------------------
// Syntax generators per target
// ---------------------------------------------------------------------------

/** Z3 SMT-LIB2 syntax: (assert (O actor action)). */
function _z3Syntax(norm: LegalNormIR): ProverTargetSyntaxRecord {
  const actor  = normalizePredicate(norm.actor);
  const action = normalizePredicate(norm.action);
  const op = norm.modality.toUpperCase();

  let formula: string;
  if (op === 'O') {
    formula = `(assert (forall ((x Sort)) (=> (${actor} x) (${action} x))))`;
  } else if (op === 'P') {
    formula = `(assert (exists ((x Sort)) (and (${actor} x) (${action} x))))`;
  } else if (op === 'F') {
    formula = `(assert (forall ((x Sort)) (=> (${actor} x) (not (${action} x)))))`;
  } else {
    formula = `; unsupported modality ${op}`;
  }

  const warnings: string[] = [];
  if (!norm.actor) warnings.push('actor slot is empty');
  if (!norm.action) warnings.push('action slot is empty');

  return {
    target_id:   'z3-smt2',
    formula,
    syntax_type: 'smt-lib2',
    valid:       warnings.length === 0,
    warnings,
  };
}

/** SMT-LIB2 alias for callers that use the target syntax name directly. */
function _smtLib2Syntax(norm: LegalNormIR): ProverTargetSyntaxRecord {
  const record = _z3Syntax(norm);
  return {
    ...record,
    target_id: 'smt-lib2',
  };
}

/** DCEC syntax: O(actor_action) or P(actor_action) or F(actor_action). */
function _dcecSyntax(norm: LegalNormIR): ProverTargetSyntaxRecord {
  const actor  = normalizePredicate(norm.actor);
  const action = normalizePredicate(norm.action);
  const op = norm.modality.toUpperCase();
  const inner = action ? `${actor}_${action}` : actor;

  const formula = `${op}(${inner})`;
  const warnings: string[] = [];
  if (!norm.actor) warnings.push('actor slot is empty');
  if (!norm.action) warnings.push('action slot is empty');

  return {
    target_id:   'dcec',
    formula,
    syntax_type: 'dcec-atom',
    valid:       warnings.length === 0,
    warnings,
  };
}

/** TDFOL syntax with □ wrapper when temporal constraints present. */
function _tdfolSyntax(norm: LegalNormIR): ProverTargetSyntaxRecord {
  const actor  = normalizePredicate(norm.actor);
  const action = normalizePredicate(norm.action);
  const op = norm.modality.toUpperCase();
  const inner = `${op}(${actor}_${action})`;
  const hasTemporal = Array.isArray(norm.temporal_constraints) && norm.temporal_constraints.length > 0;
  const formula = hasTemporal ? `□(${inner})` : inner;

  const warnings: string[] = [];
  if (!norm.actor) warnings.push('actor slot is empty');
  if (!norm.action) warnings.push('action slot is empty');

  return {
    target_id:   'tdfol',
    formula,
    syntax_type: 'tdfol-modal',
    valid:       warnings.length === 0,
    warnings,
  };
}

/** Lean 4 syntax: theorem + by exact. */
function _lean4Syntax(norm: LegalNormIR): ProverTargetSyntaxRecord {
  const actor  = normalizePredicate(norm.actor);
  const action = normalizePredicate(norm.action);
  const op = norm.modality.toUpperCase();
  const opWord = op === 'O' ? 'Obligation' : op === 'P' ? 'Permission' : 'Prohibition';
  const formula = `theorem ${actor}_${action}_${opWord.toLowerCase()} : ${opWord} (${actor}Prop ∧ ${action}Prop) := by\n  exact ⟨h_actor, h_action⟩`;

  const warnings: string[] = [];
  if (!norm.actor) warnings.push('actor slot is empty');
  if (!norm.action) warnings.push('action slot is empty');

  return {
    target_id:   'lean4',
    formula,
    syntax_type: 'lean4-theorem',
    valid:       warnings.length === 0,
    warnings,
  };
}

/** Coq proposition skeleton. */
function _coqSyntax(norm: LegalNormIR): ProverTargetSyntaxRecord {
  const actor = normalizePredicate(norm.actor);
  const action = normalizePredicate(norm.action);
  const op = norm.modality.toUpperCase();
  const predicate = op === 'O' ? 'Obligation' : op === 'P' ? 'Permission' : 'Prohibition';
  const theoremName = `${actor}_${action}_${predicate}`.toLowerCase();
  const formula = [
    `Theorem ${theoremName} : ${predicate} ${actor}Prop ${action}Prop.`,
    'Proof.',
    '  exact I.',
    'Qed.',
  ].join('\n');
  const warnings = slotWarnings(norm);

  return {
    target_id: 'coq',
    formula,
    syntax_type: 'coq-theorem',
    valid: warnings.length === 0,
    warnings,
  };
}

/** TPTP FOF syntax. */
function _tptpSyntax(norm: LegalNormIR): ProverTargetSyntaxRecord {
  const actor = normalizePredicate(norm.actor).toLowerCase();
  const action = normalizePredicate(norm.action).toLowerCase();
  const op = norm.modality.toUpperCase();
  const name = normalizePredicate(norm.source_id || `${actor}_${action}`).toLowerCase();

  let body: string;
  if (op === 'O') {
    body = `! [X] : (${actor}(X) => obligatory(${action}(X)))`;
  } else if (op === 'P') {
    body = `? [X] : (${actor}(X) & permitted(${action}(X)))`;
  } else if (op === 'F') {
    body = `! [X] : (${actor}(X) => ~${action}(X))`;
  } else {
    body = `${actor}_${action}`;
  }

  const warnings = slotWarnings(norm);
  if (!['O', 'P', 'F'].includes(op)) warnings.push(`unsupported modality ${op}`);

  return {
    target_id: 'tptp',
    formula: `fof(${name}_${op.toLowerCase()}, axiom, ${body}).`,
    syntax_type: 'tptp-fof',
    valid: warnings.length === 0,
    warnings,
  };
}

/** Prolog clause form. */
function _prologSyntax(norm: LegalNormIR): ProverTargetSyntaxRecord {
  const actor  = normalizePredicate(norm.actor).toLowerCase();
  const action = normalizePredicate(norm.action).toLowerCase();
  const op = norm.modality.toUpperCase();

  let formula: string;
  if (op === 'O') {
    formula = `obligatory(${actor}, ${action}).`;
  } else if (op === 'P') {
    formula = `permitted(${actor}, ${action}).`;
  } else {
    formula = `forbidden(${actor}, ${action}).`;
  }

  return {
    target_id:   'prolog',
    formula,
    syntax_type: 'prolog-fact',
    valid:       Boolean(norm.actor && norm.action),
    warnings:    norm.actor && norm.action ? [] : ['actor or action is empty'],
  };
}

/** JSON representation for audit/conformance tooling. */
function _jsonIrSyntax(norm: LegalNormIR): ProverTargetSyntaxRecord {
  const warnings = slotWarnings(norm);
  return {
    target_id: 'json-ir',
    formula: JSON.stringify({
      source_id: norm.source_id,
      modality: norm.modality,
      norm_type: norm.norm_type,
      actor: norm.actor,
      proposition: norm.action,
      action: norm.action,
      conditions: norm.conditions,
      exceptions: norm.exceptions,
      temporal_constraints: norm.temporal_constraints,
    }),
    syntax_type: 'json-ir',
    valid: warnings.length === 0,
    warnings,
  };
}

function slotWarnings(norm: LegalNormIR): string[] {
  const warnings: string[] = [];
  if (!norm.actor) warnings.push('actor slot is empty');
  if (!norm.action) warnings.push('action slot is empty');
  return warnings;
}

// ---------------------------------------------------------------------------
// ProverSyntaxBuilder
// ---------------------------------------------------------------------------

/**
 * ProverSyntaxBuilder — generates multi-target prover syntax from `LegalNormIR`.
 *
 * Usage:
 * ```ts
 * const report = ProverSyntaxBuilder.buildSyntaxReport(norm);
 * console.log(report.records.find(r => r.target_id === 'z3-smt2')?.formula);
 * ```
 */
export class ProverSyntaxBuilder {
  /**
   * Build prover syntax records for a single `LegalNormIR`.
   *
   * Returns one `ProverTargetSyntaxRecord` per supported prover target.
   * Python ref: `build_prover_syntax_records_from_irs(irs)`.
   */
  static buildSyntaxReport(
    norm: LegalNormIR,
    targets: ProverTarget[] = DEFAULT_PROVER_TARGETS,
  ): ProverSyntaxReport {
    const generators: Record<ProverTarget, (n: LegalNormIR) => ProverTargetSyntaxRecord> = {
      'z3-smt2': _z3Syntax,
      'smt-lib2': _smtLib2Syntax,
      'dcec':    _dcecSyntax,
      'tdfol':   _tdfolSyntax,
      'lean4':   _lean4Syntax,
      'coq':     _coqSyntax,
      'tptp':    _tptpSyntax,
      'prolog':  _prologSyntax,
      'json-ir': _jsonIrSyntax,
    };

    const records: ProverTargetSyntaxRecord[] = targets.map(t => generators[t](norm));

    return {
      norm_id:   norm.source_id,
      modality:  norm.modality,
      actor:     norm.actor,
      proposition: norm.action,
      action:    norm.action,
      records,
      all_valid: records.every(r => r.valid),
    };
  }

  /**
   * Build syntax reports for a batch of `LegalNormIR` instances.
   */
  static buildBatch(norms: LegalNormIR[], targets?: ProverTarget[]): ProverSyntaxReport[] {
    return norms.map(n => ProverSyntaxBuilder.buildSyntaxReport(n, targets));
  }

  static getSupportedTargets(): ProverTarget[] {
    return [...ALL_PROVER_TARGETS];
  }

  static buildTargetSyntaxMap(
    norm: LegalNormIR,
    targets: ProverTarget[] = ALL_PROVER_TARGETS,
  ): Record<ProverTarget, string> {
    const records = ProverSyntaxBuilder.buildSyntaxReport(norm, targets).records;
    return Object.fromEntries(records.map(record => [record.target_id, record.formula])) as Record<ProverTarget, string>;
  }
}

export class ProverSyntaxValidator {
  constructor(readonly expectedTargets: ProverTarget[] = ALL_PROVER_TARGETS) {}

  validateRecord(record: ProverTargetSyntaxRecord): ProverSyntaxValidationIssue[] {
    const issues: ProverSyntaxValidationIssue[] = [];
    if (!record.formula.trim()) {
      issues.push(makeIssue(record.target_id, 'error', 'empty_formula', 'formula is empty'));
    }
    if (!record.valid) {
      issues.push(makeIssue(record.target_id, 'error', 'record_invalid', 'syntax record is marked invalid'));
    }
    for (const warning of record.warnings) {
      issues.push(makeIssue(record.target_id, 'warning', 'record_warning', warning));
    }
    issues.push(...targetSpecificIssues(record));
    return issues;
  }

  validateReport(report: ProverSyntaxReport): ProverSyntaxValidationReport {
    const presentTargets = report.records.map(record => record.target_id);
    const missingTargets = this.expectedTargets.filter(target => !presentTargets.includes(target));
    const issues = report.records.flatMap(record => this.validateRecord(record));
    for (const target of missingTargets) {
      issues.push(makeIssue(target, 'error', 'missing_target', `missing syntax for target ${target}`));
    }

    const proofReadyTargets = report.records
      .filter(record => record.valid && this.validateRecord(record).every(issue => issue.severity !== 'error'))
      .map(record => record.target_id);

    return {
      norm_id: report.norm_id,
      expectedTargets: [...this.expectedTargets],
      presentTargets,
      missingTargets,
      proofReadyTargets,
      coverageRate: roundRatio(this.expectedTargets.length - missingTargets.length, this.expectedTargets.length),
      allValid: issues.every(issue => issue.severity !== 'error'),
      issues,
    };
  }

  validateNorm(
    norm: LegalNormIR,
    targets: ProverTarget[] = this.expectedTargets,
  ): ProverSyntaxValidationReport {
    return new ProverSyntaxValidator(targets).validateReport(ProverSyntaxBuilder.buildSyntaxReport(norm, targets));
  }

  static validateRecord(record: ProverTargetSyntaxRecord): ProverSyntaxValidationIssue[] {
    return new ProverSyntaxValidator([record.target_id]).validateRecord(record);
  }

  static validateReport(
    report: ProverSyntaxReport,
    expectedTargets: ProverTarget[] = ALL_PROVER_TARGETS,
  ): ProverSyntaxValidationReport {
    return new ProverSyntaxValidator(expectedTargets).validateReport(report);
  }
}

function targetSpecificIssues(record: ProverTargetSyntaxRecord): ProverSyntaxValidationIssue[] {
  const issues: ProverSyntaxValidationIssue[] = [];
  if (['z3-smt2', 'smt-lib2', 'dcec', 'tdfol'].includes(record.target_id) && !balancedParens(record.formula)) {
    issues.push(makeIssue(record.target_id, 'error', 'unbalanced_parentheses', 'formula parentheses are unbalanced'));
  }
  if (record.target_id === 'tptp' && !/^fof\([^,]+,\s*axiom,\s*.+\)\.$/s.test(record.formula.trim())) {
    issues.push(makeIssue(record.target_id, 'error', 'invalid_tptp_fof', 'formula is not a TPTP FOF axiom'));
  }
  if (record.target_id === 'prolog' && !record.formula.trim().endsWith('.')) {
    issues.push(makeIssue(record.target_id, 'error', 'invalid_prolog_clause', 'Prolog clause must end with a period'));
  }
  if (record.target_id === 'json-ir') {
    try {
      JSON.parse(record.formula);
    } catch {
      issues.push(makeIssue(record.target_id, 'error', 'invalid_json_ir', 'JSON IR formula is not parseable JSON'));
    }
  }
  return issues;
}

function makeIssue(
  target_id: ProverTarget,
  severity: 'warning' | 'error',
  code: string,
  message: string,
): ProverSyntaxValidationIssue {
  return { target_id, severity, code, message };
}

function balancedParens(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function roundRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 1;
  return Math.round((numerator / denominator) * 1_000_000) / 1_000_000;
}
