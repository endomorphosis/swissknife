/**
 * ModalFrameBridge — simplified TypeScript port of ModalFrameLogicBridgeAdapter.
 *
 * Mirrors ipfs_datasets_py/logic/bridge/modal_frame_logic.py (691 lines)
 * at a practical scope:
 *   - Encodes text into a modal IR envelope using `DeonticTextAnalyzer` and `FolTextConverter`
 *   - Routes extracted formulas through `ProverRouterBridgeAdapter`
 *   - Returns a `ModalBridgeResult` analogous to `BridgeEvaluationReport`
 *
 * The full Python adapter relies on a `modal/compiler.py` codec (complex NLP pipeline).
 * This TypeScript port replaces that with the already-implemented regex extractors,
 * giving practical text→modal-logic→proof results without an NLP dependency.
 *
 * Sprint 14, T-81.
 * Reference: ipfs_datasets_py/logic/bridge/modal_frame_logic.py §ModalFrameLogicBridgeAdapter
 */

import { DeonticTextAnalyzer } from '../deontic/deontic-deontic-text-analyzer.js';
import type { DeonticStatement, DeonticConflict } from '../deontic/deontic-deontic-text-analyzer.js';
import { FolTextConverter } from '../fol/fol-fol-text-converter.js';
import type { FolConversionResult } from '../fol/fol-fol-text-converter.js';
import { ProverRouterBridgeAdapter } from './bridge-prover-router-bridge.js';
import type { ProofGateResult } from './bridge-prover-router-bridge.js';
import {
  Atom, Obligation, Permission, Prohibition,
} from '../provers/provers-dcec-types.js';
import type { DCECFormula } from '../provers/provers-dcec-types.js';
import type { TdfolFormula } from '../provers/provers-tdfol-types.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Modal IR envelope — the logical representation of the text. */
export interface ModalIrView {
  /** FOL formula derived from the text. */
  readonly fol_formula: string;
  /** Prolog form of the FOL formula. */
  readonly prolog: string;
  /** TPTP form of the FOL formula. */
  readonly tptp: string;
  /** Extracted deontic statements. */
  readonly deontic_statements: DeonticStatement[];
  /** Detected deontic conflicts. */
  readonly deontic_conflicts: DeonticConflict[];
  /** Confidence score for the FOL conversion (0–1). */
  readonly confidence: number;
}

/**
 * Result of a ModalFrameBridge evaluation.
 *
 * Analogous to `BridgeEvaluationReport` in Python bridge types.
 */
export interface ModalBridgeResult {
  readonly status: 'ok' | 'partial' | 'failed';
  readonly source_text: string;
  readonly modal_ir: ModalIrView;
  readonly proof_gate: ProofGateResult;
  /** 'modal_frame_logic' — name of this adapter. */
  readonly adapter_name: string;
  readonly metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ModalFrameBridge
// ---------------------------------------------------------------------------

export interface ModalFrameBridgeOptions {
  /** Whether to route extracted formulas through the prover (default true). */
  evaluateProvers?: boolean;
  /** Timeout per formula in ms. Default: 5000. */
  timeoutMs?: number;
}

/**
 * ModalFrameBridge — text → modal logic → proof gate.
 *
 * Usage:
 * ```ts
 * const bridge = new ModalFrameBridge();
 * const result = await bridge.evaluate('Users must log access. Users may not delete records.');
 * console.log(result.status);           // 'ok' | 'partial' | 'failed'
 * console.log(result.modal_ir.fol_formula); // ∀x User(x) → LogAccess(x)
 * console.log(result.proof_gate.compiles);  // true/false
 * ```
 */
export class ModalFrameBridge {
  private readonly deonticAnalyzer = new DeonticTextAnalyzer();
  private readonly folConverter    = new FolTextConverter();
  private readonly proverRouter: ProverRouterBridgeAdapter;
  private readonly evaluateProvers: boolean;

  constructor(opts: ModalFrameBridgeOptions = {}) {
    this.evaluateProvers = opts.evaluateProvers ?? true;
    this.proverRouter    = new ProverRouterBridgeAdapter({ timeoutMs: opts.timeoutMs });
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Encode, graph-project (stub), and proof-gate a legal text string.
   *
   * @param text Natural language input (policy, legal norm, etc.)
   * @param opts Optional source/citation metadata.
   * @returns `ModalBridgeResult` with modal IR, proof gate, and status.
   */
  async evaluate(
    text: string,
    opts: { source?: string; citation?: string } = {},
  ): Promise<ModalBridgeResult> {
    // 1. Extract deontic statements
    const statements = this.deonticAnalyzer.extractStatements(text, undefined, opts.source);
    const conflicts  = this.deonticAnalyzer.detectConflicts(statements);

    // 2. Convert text to FOL formula
    const folResult: FolConversionResult = this.folConverter.convert(text);

    const modal_ir: ModalIrView = {
      fol_formula:         folResult.formula,
      prolog:              folResult.prolog,
      tptp:                folResult.tptp,
      deontic_statements:  statements,
      deontic_conflicts:   conflicts,
      confidence:          folResult.confidence,
    };

    // 3. Route through prover (optional)
    let proof_gate: ProofGateResult;
    if (this.evaluateProvers && statements.length > 0) {
      const formulas: TdfolFormula[] = this._statementsToFormulas(statements);
      proof_gate = await this.proverRouter.checkConsistency(formulas);
    } else {
      proof_gate = {
        compiles: true, valid_count: 0, attempted_count: 0,
        failure_ratio: 0, details: [], status: 'ok', available_provers: [],
      };
    }

    // 4. Determine overall status
    const hasConflicts = conflicts.length > 0;
    const proofFailed  = !proof_gate.compiles;
    const status: ModalBridgeResult['status'] =
      proofFailed || hasConflicts ? 'failed'
      : statements.length === 0  ? 'partial'
      : 'ok';

    return {
      status,
      source_text: text,
      modal_ir,
      proof_gate,
      adapter_name: 'modal_frame_logic',
      metadata: {
        source:             opts.source ?? 'unknown',
        citation:           opts.citation,
        statement_count:    statements.length,
        conflict_count:     conflicts.length,
        fol_confidence:     folResult.confidence,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private _statementsToFormulas(statements: DeonticStatement[]): TdfolFormula[] {
    const formulas: TdfolFormula[] = [];
    for (const stmt of statements) {
      const atom: DCECFormula = Atom(stmt.action.replace(/\s+/g, '_').toLowerCase());
      switch (stmt.modality) {
        case 'obligation':   formulas.push(Obligation(atom)); break;
        case 'permission':   formulas.push(Permission(atom)); break;
        case 'prohibition':  formulas.push(Prohibition(atom)); break;
      }
    }
    return formulas;
  }
}
