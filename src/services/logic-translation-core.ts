/**
 * logic-translation-core.ts
 *
 * Multi-target logic formula translator.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/converters/logic_translation_core.py
 *
 * Provides:
 *   LogicTranslationTarget  — enum: LEAN4 | COQ | SMT_LIB2 | PROLOG | TDFOL
 *   TranslationResult       — translation outcome with toDict()
 *   AbstractLogicFormula    — platform-independent formula AST
 *   LogicTranslator         — abstract base
 *   LeanTranslator          — translate to Lean 4
 *   CoqTranslator           — translate to Coq
 *   SMTTranslator           — translate to SMT-LIB2
 *   translateFormula()      — convenience wrapper
 */

// ---------------------------------------------------------------------------
// LogicTranslationTarget
// ---------------------------------------------------------------------------

export enum LogicTranslationTarget {
  LEAN4   = 'lean4',
  COQ     = 'coq',
  SMT_LIB2 = 'smt_lib2',
  PROLOG  = 'prolog',
  TDFOL   = 'tdfol',
}

// ---------------------------------------------------------------------------
// TranslationResult
// ---------------------------------------------------------------------------

export interface TranslationResult {
  target: LogicTranslationTarget;
  translatedFormula: string;
  success: boolean;
  confidence: number;
  errors: string[];
  warnings: string[];
  metadata: Record<string, unknown>;
  dependencies: string[];
  toDict(): Record<string, unknown>;
}

export function makeTranslationResult(partial: Omit<TranslationResult, 'toDict'>): TranslationResult {
  return {
    ...partial,
    toDict() {
      return {
        confidence: partial.confidence,
        dependencies: partial.dependencies,
        errors: partial.errors,
        metadata: partial.metadata,
        success: partial.success,
        target: partial.target,
        translated_formula: partial.translatedFormula,
        warnings: partial.warnings,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// AbstractLogicFormula
// ---------------------------------------------------------------------------

export interface AbstractLogicFormula {
  formulaType: 'deontic' | 'first_order' | 'modal' | 'temporal' | 'propositional';
  operator?: string;
  operands?: AbstractLogicFormula[];
  quantifier?: string;
  variable?: string;
  body?: AbstractLogicFormula;
  atomicFormula?: string;
  metadata?: Record<string, unknown>;
  toStr(): string;
}

export function makeAtomicFormula(text: string, formulaType: AbstractLogicFormula['formulaType'] = 'propositional'): AbstractLogicFormula {
  return {
    formulaType, atomicFormula: text,
    toStr() { return text; },
  };
}

export function makeCompoundFormula(
  formulaType: AbstractLogicFormula['formulaType'],
  operator: string,
  operands: AbstractLogicFormula[],
): AbstractLogicFormula {
  return {
    formulaType, operator, operands,
    toStr() { return `(${operator} ${operands.map(o => o.toStr()).join(' ')})`; },
  };
}

// ---------------------------------------------------------------------------
// Abstract translator
// ---------------------------------------------------------------------------

export abstract class LogicTranslator {
  abstract readonly targetFormat: LogicTranslationTarget;

  abstract translate(formula: AbstractLogicFormula | string): TranslationResult;

  protected error(formula: string, msg: string): TranslationResult {
    return makeTranslationResult({
      target: this.targetFormat,
      translatedFormula: '',
      success: false,
      confidence: 0,
      errors: [msg],
      warnings: [],
      metadata: { input: formula },
      dependencies: [],
    });
  }

  protected ok(translated: string, formula: string, deps: string[] = [], confidence = 0.9): TranslationResult {
    return makeTranslationResult({
      target: this.targetFormat,
      translatedFormula: translated,
      success: true,
      confidence,
      errors: [],
      warnings: [],
      metadata: { input: formula },
      dependencies: deps,
    });
  }
}

// ---------------------------------------------------------------------------
// LeanTranslator
// ---------------------------------------------------------------------------

export class LeanTranslator extends LogicTranslator {
  readonly targetFormat = LogicTranslationTarget.LEAN4;

  translate(formula: AbstractLogicFormula | string): TranslationResult {
    const text = typeof formula === 'string' ? formula : formula.toStr();
    if (!text?.trim()) return this.error(String(formula), 'Empty formula');

    try {
      const lean = this._translateText(text);
      return this.ok(lean, text, ['Mathlib']);
    } catch (e) {
      return this.error(text, String(e));
    }
  }

  private _translateText(text: string): string {
    // Structural transformation: deontic/logical → Lean 4 syntax
    let s = text
      .replace(/∧/g, ' ∧ ').replace(/∨/g, ' ∨ ').replace(/¬/g, '¬')
      .replace(/→/g, ' → ').replace(/↔/g, ' ↔ ')
      .replace(/∀\s*(\w+)\./g, '∀ ($1 : Prop),')
      .replace(/∃\s*(\w+)\./g, '∃ ($1 : Prop),')
      .replace(/O\(([^)]+)\)/g, 'Obligatory ($1)')
      .replace(/P\(([^)]+)\)/g, 'Permitted ($1)')
      .replace(/F\(([^)]+)\)/g, 'Forbidden ($1)')
      .replace(/□\(([^)]+)\)/g, 'Necessarily ($1)')
      .replace(/◊\(([^)]+)\)/g, 'Possibly ($1)')
      .trim();
    return `theorem lean_stmt : ${s} := by sorry`;
  }
}

// ---------------------------------------------------------------------------
// CoqTranslator
// ---------------------------------------------------------------------------

export class CoqTranslator extends LogicTranslator {
  readonly targetFormat = LogicTranslationTarget.COQ;

  translate(formula: AbstractLogicFormula | string): TranslationResult {
    const text = typeof formula === 'string' ? formula : formula.toStr();
    if (!text?.trim()) return this.error(String(formula), 'Empty formula');

    try {
      const coq = this._translateText(text);
      return this.ok(coq, text, ['Coq.Logic.Classical']);
    } catch (e) {
      return this.error(text, String(e));
    }
  }

  private _translateText(text: string): string {
    let s = text
      .replace(/∧/g, '/\\').replace(/∨/g, '\\/').replace(/¬/g, '~')
      .replace(/→/g, '->').replace(/↔/g, '<->')
      .replace(/∀\s*(\w+)\./g, 'forall ($1: Prop),')
      .replace(/∃\s*(\w+)\./g, 'exists ($1: Prop),')
      .replace(/O\(([^)]+)\)/g, 'Obligatory ($1)')
      .replace(/P\(([^)]+)\)/g, 'Permitted ($1)')
      .replace(/F\(([^)]+)\)/g, 'Forbidden ($1)')
      .replace(/□\(([^)]+)\)/g, 'Necessarily ($1)')
      .replace(/◊\(([^)]+)\)/g, 'Possibly ($1)')
      .trim();
    return `Theorem coq_stmt : ${s}.\nProof.\n  admit.\nQed.`;
  }
}

// ---------------------------------------------------------------------------
// SMTTranslator
// ---------------------------------------------------------------------------

export class SMTTranslator extends LogicTranslator {
  readonly targetFormat = LogicTranslationTarget.SMT_LIB2;

  translate(formula: AbstractLogicFormula | string): TranslationResult {
    const text = typeof formula === 'string' ? formula : formula.toStr();
    if (!text?.trim()) return this.error(String(formula), 'Empty formula');

    try {
      const smt = this._translateText(text);
      return this.ok(smt, text, [], 0.85);
    } catch (e) {
      return this.error(text, String(e));
    }
  }

  private _translateText(text: string): string {
    let s = text
      .replace(/∧/g, 'and').replace(/∨/g, 'or').replace(/¬/g, 'not ')
      .replace(/→/g, '=>').replace(/↔/g, '=')
      .replace(/∀\s*(\w+)\./g, 'forall (($1 Bool))')
      .replace(/∃\s*(\w+)\./g, 'exists (($1 Bool))')
      .replace(/O\(([^)]+)\)/g, '(Obligatory $1)')
      .replace(/P\(([^)]+)\)/g, '(Permitted $1)')
      .replace(/F\(([^)]+)\)/g, '(Forbidden $1)')
      .trim();
    return `(set-logic QF_UF)\n(declare-sort Formula 0)\n(assert ${s.startsWith('(') ? s : `(${s})`})\n(check-sat)`;
  }
}

// ---------------------------------------------------------------------------
// Convenience wrapper
// ---------------------------------------------------------------------------

const TRANSLATORS: Record<LogicTranslationTarget, LogicTranslator> = {
  [LogicTranslationTarget.LEAN4]:    new LeanTranslator(),
  [LogicTranslationTarget.COQ]:      new CoqTranslator(),
  [LogicTranslationTarget.SMT_LIB2]: new SMTTranslator(),
  [LogicTranslationTarget.PROLOG]:   new SMTTranslator(), // fallback
  [LogicTranslationTarget.TDFOL]:    new LeanTranslator(), // fallback
};

/**
 * Translate `formula` to `target` format.
 */
export function translateFormula(
  formula: AbstractLogicFormula | string,
  target: LogicTranslationTarget,
): TranslationResult {
  const translator = TRANSLATORS[target];
  return translator.translate(formula);
}
