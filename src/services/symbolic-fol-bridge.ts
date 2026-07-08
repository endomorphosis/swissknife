/**
 * symbolic-fol-bridge.ts
 *
 * Bridge between symbolic AI and FOL — extract logical components and convert.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/bridges/symbolic_fol_bridge.py
 *
 * Provides:
 *   LogicalComponents   — extracted components from text (dict-like access)
 *   FOLConversionResult — formula + components + confidence + errors
 *   SymbolicFOLBridge   — convert/extractComponents/validate
 */

// ---------------------------------------------------------------------------
// LogicalComponents
// ---------------------------------------------------------------------------

export class LogicalComponents {
  readonly quantifiers: string[];
  readonly predicates: string[];
  readonly entities: string[];
  readonly logicalConnectives: string[];
  readonly confidence: number;
  readonly rawText: string;

  constructor(opts: {
    quantifiers?: string[];
    predicates?: string[];
    entities?: string[];
    logicalConnectives?: string[];
    confidence?: number;
    rawText?: string;
  }) {
    this.quantifiers = opts.quantifiers ?? [];
    this.predicates = opts.predicates ?? [];
    this.entities = opts.entities ?? [];
    this.logicalConnectives = opts.logicalConnectives ?? [];
    this.confidence = opts.confidence ?? 0;
    this.rawText = opts.rawText ?? '';
  }

  // Dict-like access for backward compatibility
  get(key: string, defaultValue: unknown = undefined): unknown {
    return (this as unknown as Record<string, unknown>)[key] ?? defaultValue;
  }

  keys(): string[] {
    return ['quantifiers', 'predicates', 'entities', 'connectives', 'confidence'];
  }

  items(): Array<[string, unknown]> {
    return this.keys().map(k => [k, this.get(k)]);
  }

  toDict(): Record<string, unknown> {
    return {
      quantifiers: this.quantifiers,
      predicates: this.predicates,
      entities: this.entities,
      connectives: this.logicalConnectives,
      confidence: this.confidence,
    };
  }
}

// ---------------------------------------------------------------------------
// FOLConversionResult
// ---------------------------------------------------------------------------

export interface FOLConversionResult {
  formula: string;
  components: LogicalComponents;
  confidence: number;
  errors: string[];
  formulaType: 'deontic' | 'fol' | 'modal' | 'propositional' | 'unknown';
  toDict(): Record<string, unknown>;
}

function makeConversionResult(opts: {
  formula: string;
  components: LogicalComponents;
  confidence: number;
  errors?: string[];
  formulaType?: FOLConversionResult['formulaType'];
}): FOLConversionResult {
  return {
    formula: opts.formula,
    components: opts.components,
    confidence: opts.confidence,
    errors: opts.errors ?? [],
    formulaType: opts.formulaType ?? 'unknown',
    toDict() {
      return {
        formula: opts.formula,
        components: opts.components.toDict(),
        confidence: opts.confidence,
        errors: opts.errors ?? [],
        formula_type: opts.formulaType ?? 'unknown',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Pattern helpers
// ---------------------------------------------------------------------------

const QUANTIFIER_RE   = /\b(forall|all|every|there exists|∀|∃|some)\b/gi;
const PREDICATE_RE    = /\b([A-Z][a-zA-Z]+)\s*\(/g;
const ENTITY_RE       = /\b(the\s+)?([A-Z][a-zA-Z]{2,25})\b/g;
const CONNECTIVE_RE   = /\b(and|or|not|implies|if|then|iff|∧|∨|¬|→|↔)\b/gi;
const DEONTIC_RE      = /^[OPF]\(/;
const MODAL_RE        = /^[□◊]/;
const FOL_RE          = /[∀∃]/;

function detectType(text: string): FOLConversionResult['formulaType'] {
  if (DEONTIC_RE.test(text)) return 'deontic';
  if (MODAL_RE.test(text)) return 'modal';
  if (FOL_RE.test(text)) return 'fol';
  if (/[∧∨¬→↔]|implies|and|or/.test(text)) return 'propositional';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// SymbolicFOLBridge
// ---------------------------------------------------------------------------

export class SymbolicFOLBridge {
  /**
   * Extract logical components from natural language or formula text.
   */
  extractComponents(text: string): LogicalComponents {
    const quantifiers = [...new Set([...text.matchAll(QUANTIFIER_RE)].map(m => m[0].toLowerCase()))];
    const predicates  = [...new Set([...text.matchAll(PREDICATE_RE)].map(m => m[1]))];
    const entities    = [...new Set([...text.matchAll(ENTITY_RE)].map(m => m[2]))].filter(e => !predicates.includes(e)).slice(0, 8);
    const connectives = [...new Set([...text.matchAll(CONNECTIVE_RE)].map(m => m[0].toLowerCase()))];

    const confidence = Math.min(1.0,
      (quantifiers.length * 0.2 + predicates.length * 0.15 + connectives.length * 0.1 + 0.2)
    );

    return new LogicalComponents({
      quantifiers, predicates, entities,
      logicalConnectives: connectives,
      confidence,
      rawText: text,
    });
  }

  /**
   * Convert text to a FOL formula.
   */
  convert(text: string): FOLConversionResult {
    const components = this.extractComponents(text);
    const errors: string[] = [];

    // Build a simple formula
    let formula = text.trim().slice(0, 80);
    const formulaType = detectType(text);

    if (formulaType === 'unknown') {
      // Try to construct a basic predicate formula
      if (components.predicates.length > 0) {
        const args = components.entities.slice(0, 2).join(', ') || 'x';
        formula = `${components.predicates[0]}(${args})`;
      } else {
        errors.push('Could not extract predicates from text');
      }
    }

    const confidence = errors.length === 0 ? components.confidence : Math.max(0.1, components.confidence * 0.5);

    return makeConversionResult({ formula, components, confidence, errors, formulaType });
  }

  /**
   * Validate that a formula string has valid syntax (balanced parentheses + non-empty).
   */
  validate(formula: string): { isValid: boolean; errors: string[]; depth: number } {
    const errors: string[] = [];
    if (!formula?.trim()) { errors.push('Empty formula'); return { isValid: false, errors, depth: 0 }; }

    let depth = 0, maxDepth = 0;
    for (const ch of formula) {
      if (ch === '(') { depth++; maxDepth = Math.max(maxDepth, depth); }
      else if (ch === ')') { depth--; if (depth < 0) { errors.push('Unbalanced ): too many closing parens'); break; } }
    }
    if (depth !== 0) errors.push(`Unbalanced parentheses: ${depth} unclosed`);

    return { isValid: errors.length === 0, errors, depth: maxDepth };
  }
}
