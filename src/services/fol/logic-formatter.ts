/**
 * Logic Formatter — PORT-188 (Sprint 82)
 *
 * Port of ipfs_datasets_py/logic/fol/utils/logic_formatter.py.
 *
 * Provides standalone formula normalization and rendering helpers for common
 * FOL notations. This complements fol-text-converter.ts, whose formatter
 * helpers are tied to the natural-language conversion pipeline.
 */

export type LogicFormulaFormat = 'unicode' | 'ascii' | 'latex' | 'prolog' | 'tptp' | 'json' | 'pretty';

export interface FormulaFormatOptions {
  format?: LogicFormulaFormat;
  name?: string;
  role?: 'axiom' | 'conjecture' | 'hypothesis' | 'lemma' | 'theorem';
  normalize?: boolean;
}

export interface FormulaJsonRecord {
  formula: string;
  unicode: string;
  ascii: string;
  predicates: string[];
  variables: string[];
}

const ASCII_TO_UNICODE: Array<[RegExp, string]> = [
  [/\bforall\s+([A-Za-z]\w*)\s*[.:]/gi, '∀$1.'],
  [/\bexists\s+([A-Za-z]\w*)\s*[.:]/gi, '∃$1.'],
  [/\ball\s+([A-Za-z]\w*)\s*[.:]/gi, '∀$1.'],
  [/\bsome\s+([A-Za-z]\w*)\s*[.:]/gi, '∃$1.'],
  [/<->|<=>|↔/g, '↔'],
  [/->|=>|→/g, '→'],
  [/\/\\|&&|∧/g, '∧'],
  [/\\\/|\|\||∨/g, '∨'],
  [/\bnot\b|~|¬/gi, '¬'],
];

const UNICODE_TO_ASCII: Array<[RegExp, string]> = [
  [/∀\s*([A-Za-z]\w*)\s*\./g, 'forall $1.'],
  [/∃\s*([A-Za-z]\w*)\s*\./g, 'exists $1.'],
  [/↔/g, '<->'],
  [/→/g, '->'],
  [/∧/g, '/\\'],
  [/∨/g, '\\/'],
  [/¬/g, 'not '],
];

const UNICODE_TO_LATEX: Array<[RegExp, string]> = [
  [/∀\s*([A-Za-z]\w*)\s*\./g, '\\forall $1.'],
  [/∃\s*([A-Za-z]\w*)\s*\./g, '\\exists $1.'],
  [/↔/g, '\\leftrightarrow'],
  [/→/g, '\\rightarrow'],
  [/∧/g, '\\land'],
  [/∨/g, '\\lor'],
  [/¬/g, '\\neg '],
];

/** Normalize formula spelling, operators, and whitespace to canonical Unicode. */
export function normalizeFormula(formula: string): string {
  let out = formula.trim();
  for (const [rx, replacement] of ASCII_TO_UNICODE) out = out.replace(rx, replacement);
  out = out
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),.])\s*/g, '$1 ')
    .replace(/\s*(∀|∃)\s*([A-Za-z]\w*)\s*\.\s*/g, '$1$2. ')
    .replace(/\s*(↔|→|∧|∨)\s*/g, ' $1 ')
    .replace(/¬\s+/g, '¬')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
  return out.replace(/\s+([),.])/g, '$1');
}

/** Convert ASCII-ish FOL syntax to canonical Unicode symbols. */
export function toUnicode(formula: string): string {
  return normalizeFormula(formula);
}

/** Convert Unicode FOL syntax to portable ASCII syntax. */
export function toAscii(formula: string): string {
  let out = normalizeFormula(formula);
  for (const [rx, replacement] of UNICODE_TO_ASCII) out = out.replace(rx, replacement);
  return out.replace(/\s+/g, ' ').trim();
}

/** Convert a formula to a compact LaTeX math fragment. */
export function toLatex(formula: string): string {
  let out = normalizeFormula(formula);
  for (const [rx, replacement] of UNICODE_TO_LATEX) out = out.replace(rx, replacement);
  return out
    .replace(/\b([A-Z][A-Za-z0-9_]*)\(([^()]+)\)/g, (_, pred: string, args: string) => `${pred}(${args})`)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convert a simple Horn-shaped formula to Prolog; otherwise return a comment. */
export function toProlog(formula: string): string {
  const normalized = normalizeFormula(formula);
  const universal = normalized.match(/^∀([A-Za-z]\w*)\.\s*\(?\s*([A-Za-z]\w*)\(\1\)\s*→\s*([A-Za-z]\w*)\(\1\)\s*\)?$/);
  if (universal) {
    const variable = universal[1]!.toUpperCase();
    return `${prologSymbol(universal[3]!)}(${variable}) :- ${prologSymbol(universal[2]!)}(${variable}).`;
  }

  const fact = normalized.match(/^(?:∃([A-Za-z]\w*)\.\s*)?([A-Za-z]\w*)\(([^()]+)\)$/);
  if (fact) return `${prologSymbol(fact[2]!)}(${fact[3]!.trim().toLowerCase()}).`;

  return `% unsupported_formula(${toAscii(normalized)})`;
}

/** Convert a formula to a single TPTP fof declaration. */
export function toTptp(formula: string, name = 'formula', role: FormulaFormatOptions['role'] = 'conjecture'): string {
  const normalized = normalizeFormula(formula);
  const body = normalized
    .replace(/∀([A-Za-z]\w*)\.\s*/g, (_, v: string) => `! [${tptpVariable(v)}] : `)
    .replace(/∃([A-Za-z]\w*)\.\s*/g, (_, v: string) => `? [${tptpVariable(v)}] : `)
    .replace(/\b([A-Z][A-Za-z0-9_]*)\(/g, (_, p: string) => `${prologSymbol(p)}(`)
    .replace(/\b([a-z])\b/g, (_, v: string) => tptpVariable(v))
    .replace(/↔/g, '<=>')
    .replace(/→/g, '=>')
    .replace(/∧/g, '&')
    .replace(/∨/g, '|')
    .replace(/¬/g, '~');
  return `fof(${tptpName(name)}, ${role ?? 'conjecture'}, (${body})).`;
}

/** Return a JSON-serialisable description of a formula. */
export function toJsonRecord(formula: string): FormulaJsonRecord {
  const unicode = normalizeFormula(formula);
  return {
    formula,
    unicode,
    ascii: toAscii(unicode),
    predicates: extractPredicates(unicode),
    variables: extractVariables(unicode),
  };
}

/** Format a formula into the requested notation. */
export function formatFormula(formula: string, options: LogicFormulaFormat | FormulaFormatOptions = 'unicode'): string {
  const opts: FormulaFormatOptions = typeof options === 'string' ? { format: options } : options;
  const source = opts.normalize === false ? formula : normalizeFormula(formula);
  switch (opts.format ?? 'unicode') {
    case 'unicode': return source;
    case 'ascii': return toAscii(source);
    case 'latex': return toLatex(source);
    case 'prolog': return toProlog(source);
    case 'tptp': return toTptp(source, opts.name, opts.role);
    case 'json': return JSON.stringify(toJsonRecord(source));
    case 'pretty': return prettyFormula(source);
  }
}

export function prettyFormula(formula: string): string {
  return normalizeFormula(formula)
    .replace(/\s+(→|↔)\s+/g, '\n  $1 ')
    .replace(/\s+(∧|∨)\s+/g, '\n    $1 ');
}

function extractPredicates(formula: string): string[] {
  const predicates = new Set<string>();
  for (const match of normalizeFormula(formula).matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*\(/g)) {
    predicates.add(match[1]!);
  }
  return Array.from(predicates).sort();
}

function extractVariables(formula: string): string[] {
  const variables = new Set<string>();
  for (const match of normalizeFormula(formula).matchAll(/[∀∃]\s*([A-Za-z]\w*)\s*\./g)) {
    variables.add(match[1]!);
  }
  return Array.from(variables).sort();
}

function prologSymbol(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
}

function tptpVariable(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function tptpName(name: string): string {
  return prologSymbol(name || 'formula') || 'formula';
}

// Python-compatible snake_case aliases.
export const normalize_formula = normalizeFormula;
export const format_formula = formatFormula;
export const to_unicode = toUnicode;
export const to_latex = toLatex;
