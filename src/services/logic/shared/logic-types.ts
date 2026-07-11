/**
 * Shared logic type system for the swissknife MCP++ stack.
 *
 * Mirrors ipfs_datasets_py/logic/types/deontic_types.py (296L) +
 *         ipfs_datasets_py/logic/types/fol_types.py (121L) +
 *         ipfs_datasets_py/logic/types/common_types.py (119L) +
 *         ipfs_datasets_py/logic/types/proof_types.py (26L)
 *
 * These types are intentionally lightweight and import-safe.
 * They mirror the public shape of the Python `logic/types/` layer.
 *
 * T-108.
 * Reference: ipfs_datasets_py/logic/types/
 */

import { md5Hex } from '../../shared/shared-browser-crypto.js';

// ---------------------------------------------------------------------------
// Operator enumerations
// ---------------------------------------------------------------------------

/** Deontic operators for representing normative concepts. */
export type DeonticOperator =
  | 'O'    // Obligation
  | 'P'    // Permission
  | 'F'    // Prohibition / Forbidden
  | 'S'    // Supererogation
  | 'R'    // Right
  | 'L'    // Liberty
  | 'POW' // Power
  | 'IMM'; // Immunity

export const DEONTIC_OPERATOR_LABELS: Record<DeonticOperator, string> = {
  O:   'Obligation',
  P:   'Permission',
  F:   'Prohibition',
  S:   'Supererogation',
  R:   'Right',
  L:   'Liberty',
  POW: 'Power',
  IMM: 'Immunity',
};

/** Temporal operators for time-dependent deontic concepts. */
export type TemporalOperator = '□' | '◊' | 'X' | 'U' | 'S';

export const TEMPORAL_OPERATOR_LABELS: Record<TemporalOperator, string> = {
  '□': 'Always',
  '◊': 'Eventually',
  'X':  'Next',
  'U':  'Until',
  'S':  'Since',
};

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** A legal agent (person, organisation, role). */
export interface LegalAgent {
  readonly identifier: string;
  readonly name:       string;
  readonly agentType:  string;
  readonly properties: Record<string, unknown>;
}

/** A temporal condition on a deontic norm. */
export interface TemporalCondition {
  readonly operator:   TemporalOperator;
  readonly condition:  string;
  readonly startTime?: string;
  readonly endTime?:   string;
  readonly duration?:  number;
}

/** Legal context for a deontic norm. */
export interface LegalContext {
  readonly jurisdiction:   string;
  readonly domain:         string;
  readonly temporalWindow?: { start: string; end: string };
  readonly authority?:      string;
}

// ---------------------------------------------------------------------------
// DeonticFormula
// ---------------------------------------------------------------------------

export interface DeonticFormulaData {
  readonly operator:             DeonticOperator;
  readonly proposition:          string;
  readonly agent?:               LegalAgent;
  readonly beneficiary?:         LegalAgent;
  readonly conditions:           string[];
  readonly temporalConditions:   TemporalCondition[];
  readonly legalContext?:        LegalContext;
  readonly confidence:           number;
  readonly sourceText:           string;
  readonly variables:            Record<string, string>;
  readonly quantifiers:          Array<[string, string, string]>;
  readonly formulaId:            string;
  readonly creationTimestamp:    string;
}

/**
 * A deontic first-order logic formula.
 *
 * Python ref: `DeonticFormula` dataclass in `deontic_types.py`.
 */
export class DeonticFormula {
  readonly operator:           DeonticOperator;
  readonly proposition:        string;
  readonly agent?:             LegalAgent;
  readonly beneficiary?:       LegalAgent;
  readonly conditions:         string[];
  readonly temporalConditions: TemporalCondition[];
  readonly legalContext?:      LegalContext;
  readonly confidence:         number;
  readonly sourceText:         string;
  readonly variables:          Record<string, string>;
  readonly quantifiers:        Array<[string, string, string]>;
  readonly formulaId:          string;
  readonly creationTimestamp:  string;

  constructor(opts: Partial<DeonticFormulaData> & { operator: DeonticOperator; proposition: string }) {
    this.operator           = opts.operator;
    this.proposition        = opts.proposition;
    this.agent              = opts.agent;
    this.beneficiary        = opts.beneficiary;
    this.conditions         = opts.conditions         ?? [];
    this.temporalConditions = opts.temporalConditions ?? [];
    this.legalContext       = opts.legalContext;
    this.confidence         = opts.confidence         ?? 1.0;
    this.sourceText         = opts.sourceText         ?? '';
    this.variables          = opts.variables          ?? {};
    this.quantifiers        = opts.quantifiers        ?? [];
    this.formulaId          = this._generateId();
    this.creationTimestamp  = new Date().toISOString();
  }

  /** Build the FOL string representation. */
  toFolString(): string {
    let prop = this.proposition;
    for (const [q, v, d] of this.quantifiers) {
      prop = `${q}${v}:${d} (${prop})`;
    }
    if (this.conditions.length > 0) {
      prop = `(${this.conditions.join(' ∧ ')}) → (${prop})`;
    }
    for (const tc of this.temporalConditions) {
      prop = `${tc.operator}(${prop})`;
    }
    const parts = [this.operator];
    if (this.agent) parts.push(`[${this.agent.identifier}]`);
    parts.push(`(${prop})`);
    return parts.join('');
  }

  /** Alias for `toFolString()`. */
  get formula(): string { return this.toFolString(); }

  toDict(): Record<string, unknown> {
    return {
      formula_id:          this.formulaId,
      operator:            this.operator,
      proposition:         this.proposition,
      agent:               this.agent ?? null,
      beneficiary:         this.beneficiary ?? null,
      conditions:          this.conditions,
      temporal_conditions: this.temporalConditions,
      legal_context:       this.legalContext ?? null,
      confidence:          this.confidence,
      source_text:         this.sourceText,
      formula:             this.toFolString(),
    };
  }

  private _generateId(): string {
    const content = `${this.operator}:${this.proposition}:${this.agent?.identifier ?? ''}`;
    return md5Hex(content).slice(0, 12);
  }
}

// ---------------------------------------------------------------------------
// DeonticRuleSet
// ---------------------------------------------------------------------------

/**
 * A collection of related deontic formulas forming a rule set.
 *
 * Python ref: `DeonticRuleSet` dataclass in `deontic_types.py`.
 */
export class DeonticRuleSet {
  readonly name:           string;
  readonly description:    string;
  readonly version:        string;
  readonly sourceDocument?: string;
  readonly legalContext?:   LegalContext;
  readonly ruleSetId:      string;
  readonly creationTimestamp: string;
  private readonly _formulas: DeonticFormula[] = [];

  constructor(opts: { name: string; description?: string; version?: string; sourceDocument?: string; legalContext?: LegalContext; formulas?: DeonticFormula[] }) {
    this.name           = opts.name;
    this.description    = opts.description  ?? '';
    this.version        = opts.version      ?? '1.0';
    this.sourceDocument = opts.sourceDocument;
    this.legalContext   = opts.legalContext;
    this.ruleSetId      = md5Hex(`${opts.name}:${opts.version ?? '1.0'}`).slice(0, 10);
    this.creationTimestamp = new Date().toISOString();
    if (opts.formulas) this._formulas.push(...opts.formulas);
  }

  get formulas(): readonly DeonticFormula[] { return this._formulas; }

  addFormula(formula: DeonticFormula): void {
    this._formulas.push(formula);
  }

  removeFormula(formulaId: string): boolean {
    const idx = this._formulas.findIndex(f => f.formulaId === formulaId);
    if (idx === -1) return false;
    this._formulas.splice(idx, 1);
    return true;
  }

  findFormulasByAgent(agentIdentifier: string): DeonticFormula[] {
    return this._formulas.filter(f => f.agent?.identifier === agentIdentifier);
  }

  findFormulasByOperator(operator: DeonticOperator): DeonticFormula[] {
    return this._formulas.filter(f => f.operator === operator);
  }

  /** Check for direct O+F conflicts on the same proposition and agent. */
  checkConsistency(): Array<[DeonticFormula, DeonticFormula, string]> {
    const conflicts: Array<[DeonticFormula, DeonticFormula, string]> = [];
    for (let i = 0; i < this._formulas.length; i++) {
      for (let j = i + 1; j < this._formulas.length; j++) {
        const f1 = this._formulas[i];
        const f2 = this._formulas[j];
        if (f1.proposition !== f2.proposition) continue;
        if (f1.agent?.identifier !== f2.agent?.identifier) continue;

        if ((f1.operator === 'O' && f2.operator === 'F') ||
            (f1.operator === 'F' && f2.operator === 'O')) {
          conflicts.push([f1, f2, 'Direct conflict: obligation vs prohibition']);
        } else if ((f1.operator === 'P' && f2.operator === 'F') ||
                   (f1.operator === 'F' && f2.operator === 'P')) {
          conflicts.push([f1, f2, 'Direct conflict: permission vs prohibition']);
        }
      }
    }
    return conflicts;
  }
}

// ---------------------------------------------------------------------------
// FOL types (from fol_types.py)
// ---------------------------------------------------------------------------

export interface Predicate {
  readonly name:      string;
  readonly arguments: string[];
}

export interface FOLFormula {
  readonly formulaString: string;
  readonly predicates:    Predicate[];
  readonly quantifiers:   Array<{ type: 'universal' | 'existential'; variable: string }>;
  readonly confidence:    number;
  readonly metadata:      Record<string, unknown>;
}

export interface FOLConversionResult {
  readonly formula:    FOLFormula;
  readonly raw_text:   string;
  readonly status:     'success' | 'partial' | 'failed';
  readonly warnings:   string[];
}

// ---------------------------------------------------------------------------
// Proof types (from proof_types.py)
// ---------------------------------------------------------------------------

export type ProofStatus = 'proved' | 'refuted' | 'unknown' | 'timeout' | 'error';

export interface ProofResult {
  readonly status:      ProofStatus;
  readonly formula:     string;
  readonly prover_id:   string;
  readonly time_ms:     number;
  readonly confidence:  number;
  readonly details:     Record<string, unknown>;
}
