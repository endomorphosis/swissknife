/**
 * symbolic-logic-primitives.ts
 *
 * Symbolic logic primitives for natural language → FOL conversion.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/symbolic/symbolic_logic_primitives.py
 *
 * Provides:
 *   LogicalStructure    — analysed structure of a logical statement
 *   LogicPrimitive      — named primitive operation
 *   AVAILABLE_PRIMITIVES — static set of supported primitives
 *   createLogicSymbol() — create a LogicSymbol from text
 *   getAvailablePrimitives() → string[]
 */

// ---------------------------------------------------------------------------
// LogicalStructure
// ---------------------------------------------------------------------------

export interface LogicalStructure {
  quantifiers: string[];
  variables: string[];
  predicates: string[];
  connectives: string[];
  operators: string[];
  confidence: number;
}

export function analyzeLogicalStructure(text: string): LogicalStructure {
  const lower = text.toLowerCase();

  const quantifiers: string[] = [];
  if (/∀|forall|for all|every|each/.test(lower)) quantifiers.push('∀');
  if (/∃|exists|there exists|some/.test(lower)) quantifiers.push('∃');

  const variables = [...new Set((text.match(/\b[a-z]\b/g) ?? []))];

  const predicates = [...new Set((text.match(/\b[A-Z][a-zA-Z]+\b/g) ?? []))];

  const connectives: string[] = [];
  if (/∧|\band\b|&/.test(lower)) connectives.push('∧');
  if (/∨|\bor\b/.test(lower)) connectives.push('∨');
  if (/¬|~|\bnot\b/.test(lower)) connectives.push('¬');
  if (/→|->|\bimplies\b/.test(lower)) connectives.push('→');
  if (/↔|<->|\biff\b/.test(lower)) connectives.push('↔');

  const operators: string[] = [];
  if (/\bO\b|obligat|shall\b|must\b/.test(text)) operators.push('O');
  if (/\bP\b|permit|may\b|allow/.test(text)) operators.push('P');
  if (/\bF\b|forbid|prohibit|shall not/.test(text)) operators.push('F');
  if (/□|\balways\b|\bnecessarily\b/.test(lower)) operators.push('□');
  if (/◊|\bpossibly\b|\beventually\b/.test(lower)) operators.push('◊');

  const confidence = Math.min(1.0,
    quantifiers.length * 0.2 +
    predicates.length * 0.1 +
    connectives.length * 0.15 +
    operators.length * 0.15
  );

  return { quantifiers, variables, predicates, connectives, operators, confidence };
}

// ---------------------------------------------------------------------------
// LogicPrimitive
// ---------------------------------------------------------------------------

export interface LogicPrimitive {
  name: string;
  symbol: string;
  arity: number;
  description: string;
  apply(operands: string[]): string;
}

function makePrimitive(
  name: string,
  symbol: string,
  arity: number,
  description: string,
  apply: (ops: string[]) => string,
): LogicPrimitive {
  return { name, symbol, arity, description, apply };
}

// ---------------------------------------------------------------------------
// AVAILABLE_PRIMITIVES
// ---------------------------------------------------------------------------

export const AVAILABLE_PRIMITIVES: ReadonlyMap<string, LogicPrimitive> = new Map([
  ['and',     makePrimitive('and',     '∧', 2, 'Conjunction',           ([a, b]) => `(${a} ∧ ${b})`)],
  ['or',      makePrimitive('or',      '∨', 2, 'Disjunction',           ([a, b]) => `(${a} ∨ ${b})`)],
  ['not',     makePrimitive('not',     '¬', 1, 'Negation',              ([a]) => `¬${a}`)],
  ['implies', makePrimitive('implies', '→', 2, 'Implication',           ([a, b]) => `(${a} → ${b})`)],
  ['iff',     makePrimitive('iff',     '↔', 2, 'Biconditional',         ([a, b]) => `(${a} ↔ ${b})`)],
  ['forall',  makePrimitive('forall',  '∀', 2, 'Universal quantifier',  ([x, f]) => `∀${x}.${f}`)],
  ['exists',  makePrimitive('exists',  '∃', 2, 'Existential quantifier', ([x, f]) => `∃${x}.${f}`)],
  ['equals',  makePrimitive('equals',  '=', 2, 'Equality',              ([a, b]) => `${a} = ${b}`)],
  ['obligation',  makePrimitive('obligation',  'O', 1, 'Deontic obligation',  ([a]) => `O(${a})`)],
  ['permission',  makePrimitive('permission',  'P', 1, 'Deontic permission',  ([a]) => `P(${a})`)],
  ['prohibition', makePrimitive('prohibition', 'F', 1, 'Deontic prohibition', ([a]) => `F(${a})`)],
  ['box',     makePrimitive('box',     '□', 1, 'Modal necessity',        ([a]) => `□(${a})`)],
  ['diamond', makePrimitive('diamond', '◊', 1, 'Modal possibility',      ([a]) => `◊(${a})`)],
]);

export function getAvailablePrimitives(): string[] {
  return [...AVAILABLE_PRIMITIVES.keys()].sort();
}

export function getPrimitive(name: string): LogicPrimitive | undefined {
  return AVAILABLE_PRIMITIVES.get(name.toLowerCase());
}

// ---------------------------------------------------------------------------
// LogicSymbol
// ---------------------------------------------------------------------------

export interface LogicSymbol {
  text: string;
  structure: LogicalStructure;
  /** Apply a named primitive to this symbol's text. */
  apply(primitiveName: string, other?: string): string;
  /** Convert to a FOL string representation. */
  toFol(format?: 'symbolic' | 'prolog' | 'tptp'): string;
}

/**
 * Create a `LogicSymbol` wrapping the given text, with analysed structure.
 */
export function createLogicSymbol(text: string): LogicSymbol {
  const structure = analyzeLogicalStructure(text);

  return {
    text,
    structure,
    apply(primitiveName: string, other?: string): string {
      const prim = getPrimitive(primitiveName);
      if (!prim) throw new Error(`Unknown primitive: ${primitiveName}`);
      const operands = prim.arity === 1 ? [text] : [text, other ?? ''];
      return prim.apply(operands);
    },
    toFol(format: 'symbolic' | 'prolog' | 'tptp' = 'symbolic'): string {
      // Simplified: wrap text in a predicate if it looks natural
      const clean = text.trim().replace(/\s+/g, '_');
      switch (format) {
        case 'prolog': return `holds(${clean}).`;
        case 'tptp':   return `fof(axiom, axiom, ${clean}).`;
        default:       return clean;
      }
    },
  };
}
