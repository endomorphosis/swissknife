/**
 * TPTP Problem Utilities — PORT-172
 *
 * Dedicated TPTP emitter/parser for external ATP integration. Supports fof/cnf
 * declarations with nested formulas, role grouping, SZS status extraction, and
 * proof-step extraction.
 */

export type TptpKind = 'fof' | 'cnf';
export type TptpRole = 'axiom' | 'hypothesis' | 'assumption' | 'conjecture' | 'negated_conjecture' | string;

export interface TptpFormula {
  kind: TptpKind;
  name: string;
  role: TptpRole;
  formula: string;
  source: string;
}

export interface TptpProblem {
  name: string;
  formulas: TptpFormula[];
  axioms: TptpFormula[];
  conjectures: TptpFormula[];
  szsStatus?: string;
  proofSteps: string[];
}

export interface CreateTptpProblemOptions {
  name?: string;
  axioms?: Array<string | Partial<TptpFormula>>;
  conjectures?: Array<string | Partial<TptpFormula>>;
  role?: TptpRole;
}

export function formulaToTptp(formula: string): string {
  return normalizeFormula(formula)
    .replace(/∀([A-Za-z]\w*)\./g, (_, variable: string) => `! [${tptpVariable(variable)}] : `)
    .replace(/∃([A-Za-z]\w*)\./g, (_, variable: string) => `? [${tptpVariable(variable)}] : `)
    .replace(/∧/g, ' & ')
    .replace(/∨/g, ' | ')
    .replace(/¬/g, '~')
    .replace(/→/g, ' => ')
    .replace(/↔/g, ' <=> ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createTptpProblem(opts: CreateTptpProblemOptions = {}): string {
  const name = sanitizeName(opts.name ?? 'problem');
  const lines = [`% TPTP problem: ${name}`];
  for (const [idx, axiom] of (opts.axioms ?? []).entries()) {
    lines.push(formatTptpFormula(normalizeFormulaEntry(axiom, `ax_${idx + 1}`, opts.role ?? 'axiom', 'fof')));
  }
  for (const [idx, conjecture] of (opts.conjectures ?? []).entries()) {
    lines.push(formatTptpFormula(normalizeFormulaEntry(conjecture, `conj_${idx + 1}`, 'conjecture', 'fof')));
  }
  return lines.join('\n');
}

export function formatTptpFormula(formula: TptpFormula): string {
  return `${formula.kind}(${sanitizeName(formula.name)}, ${formula.role}, (${formulaToTptp(formula.formula)})).`;
}

export function parseTptpProblem(text: string, name = 'problem'): TptpProblem {
  const formulas = parseTptpFormulas(text);
  return {
    name,
    formulas,
    axioms: formulas.filter(formula => ['axiom', 'hypothesis', 'assumption'].includes(formula.role)),
    conjectures: formulas.filter(formula => ['conjecture', 'negated_conjecture'].includes(formula.role)),
    szsStatus: parseSzsStatus(text),
    proofSteps: extractTptpProofSteps(text),
  };
}

export function parseTptpFormulas(text: string): TptpFormula[] {
  const formulas: TptpFormula[] = [];
  for (const statement of scanTptpStatements(text)) {
    const parsed = parseTptpStatement(statement);
    if (parsed) formulas.push(parsed);
  }
  return formulas;
}

export function parseTptpStatement(statement: string): TptpFormula | null {
  const trimmed = statement.trim().replace(/\.$/, '');
  const kindMatch = trimmed.match(/^(fof|cnf)\s*\(/i);
  if (!kindMatch) return null;
  const kind = kindMatch[1]!.toLowerCase() as TptpKind;
  const argsText = trimmed.slice(trimmed.indexOf('(') + 1, -1);
  const args = splitTopLevel(argsText, ',');
  if (args.length < 3) return null;
  return {
    kind,
    name: args[0]!.trim(),
    role: args[1]!.trim(),
    formula: stripOuterParens(args.slice(2).join(',').trim()),
    source: statement.trim(),
  };
}

export function parseSzsStatus(text: string): string | undefined {
  const match = text.match(/SZS\s+status\s+([A-Za-z_][\w-]*)/i);
  return match?.[1];
}

export function extractTptpProofSteps(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^%?\s*SZS\s+output\s+start/i.test(line) || /^fof\(|^cnf\(|^%?\s*\d+\./i.test(line));
}

function scanTptpStatements(text: string): string[] {
  const statements: string[] = [];
  const cleaned = text.split(/\r?\n/).map(stripLineComment).join('\n');
  let index = 0;
  while (index < cleaned.length) {
    const next = findNextDeclaration(cleaned, index);
    if (next < 0) break;
    let depth = 0;
    let end = next;
    for (; end < cleaned.length; end++) {
      const ch = cleaned[end];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === '.' && depth === 0) {
        statements.push(cleaned.slice(next, end + 1));
        end++;
        break;
      }
    }
    index = Math.max(end, next + 1);
  }
  return statements;
}

function findNextDeclaration(text: string, from: number): number {
  const fof = text.indexOf('fof(', from);
  const cnf = text.indexOf('cnf(', from);
  if (fof < 0) return cnf;
  if (cnf < 0) return fof;
  return Math.min(fof, cnf);
}

function stripLineComment(line: string): string {
  const index = line.indexOf('%');
  return index < 0 ? line : line.slice(0, index);
}

function normalizeFormulaEntry(value: string | Partial<TptpFormula>, fallbackName: string, fallbackRole: TptpRole, fallbackKind: TptpKind): TptpFormula {
  if (typeof value === 'string') {
    return { kind: fallbackKind, name: fallbackName, role: fallbackRole, formula: value, source: value };
  }
  return {
    kind: value.kind ?? fallbackKind,
    name: value.name ?? fallbackName,
    role: value.role ?? fallbackRole,
    formula: value.formula ?? '',
    source: value.source ?? value.formula ?? '',
  };
}

function normalizeFormula(formula: string): string {
  return formula
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bforall\s+([A-Za-z]\w*)\s*[:.]/gi, '∀$1.')
    .replace(/\bexists\s+([A-Za-z]\w*)\s*[:.]/gi, '∃$1.')
    .replace(/<->|<=>/g, '↔')
    .replace(/->|=>/g, '→')
    .replace(/\bAND\b/g, '∧')
    .replace(/\bOR\b/g, '∨')
    .replace(/\bNOT\b/g, '¬')
    .replace(/\s*&\s*/g, ' ∧ ')
    .replace(/\s*\|\s*/g, ' ∨ ')
    .replace(/\s*([∧∨→↔])\s*/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (depth === 0 && text.slice(i, i + separator.length) === separator) {
      parts.push(text.slice(start, i).trim());
      start = i + separator.length;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

function stripOuterParens(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return trimmed;
  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '(') depth++;
    else if (trimmed[i] === ')') {
      depth--;
      if (depth === 0 && i < trimmed.length - 1) return trimmed;
    }
  }
  return trimmed.slice(1, -1).trim();
}

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z_]+/, 'f_');
}

function tptpVariable(variable: string): string {
  return variable[0]!.toUpperCase() + variable.slice(1);
}
