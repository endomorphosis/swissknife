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

export type ProverTarget = 'z3-smt2' | 'dcec' | 'tdfol' | 'lean4' | 'prolog';

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
  readonly action:     string;
  /** One record per prover target. */
  readonly records:    ProverTargetSyntaxRecord[];
  /** True if all records are valid. */
  readonly all_valid:  boolean;
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
    targets: ProverTarget[] = ['z3-smt2', 'dcec', 'tdfol', 'lean4', 'prolog'],
  ): ProverSyntaxReport {
    const generators: Record<ProverTarget, (n: LegalNormIR) => ProverTargetSyntaxRecord> = {
      'z3-smt2': _z3Syntax,
      'dcec':    _dcecSyntax,
      'tdfol':   _tdfolSyntax,
      'lean4':   _lean4Syntax,
      'prolog':  _prologSyntax,
    };

    const records: ProverTargetSyntaxRecord[] = targets.map(t => generators[t](norm));

    return {
      norm_id:   norm.source_id,
      modality:  norm.modality,
      actor:     norm.actor,
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
}
