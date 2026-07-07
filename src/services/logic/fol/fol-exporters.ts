/**
 * FOL Exporters — PORT-173 (Sprint 86)
 *
 * Exports FOL formulas to Prolog, TPTP FOF, TPTP CNF, and prefix notation for
 * external theorem prover interop.
 */

import { formulaToTptp } from '../../provers/tptp-problem.js';

export type FolExportFormat = 'prolog' | 'tptp' | 'tptp-cnf' | 'prefix';

export interface FolExportOptions {
  name?: string;
  role?: 'axiom' | 'hypothesis' | 'conjecture';
}

export function exportFolFormula(formula: string, format: FolExportFormat, opts: FolExportOptions = {}): string {
  switch (format) {
    case 'prolog':
      return convertFolToProlog(formula);
    case 'tptp':
      return convertFolToTptp(formula, opts);
    case 'tptp-cnf':
      return convertFolToTptpCnf(formula, opts);
    case 'prefix':
      return toPrefixNotation(formula);
    default:
      return formula;
  }
}

export function convertFolToProlog(formula: string): string {
  const normalized = normalizeFol(formula);
  const body = stripQuantifierEnvelope(normalized);
  const implication = splitTopLevel(body, '→');
  if (implication) {
    return `${toPrologExpression(implication[1]!)} :- ${toPrologExpression(implication[0]!)}.`;
  }
  return `${toPrologExpression(body)}.`;
}

export function convertFolToTptp(formula: string, opts: FolExportOptions = {}): string {
  return `fof(${sanitizeName(opts.name ?? 'fol_formula')}, ${opts.role ?? 'conjecture'}, (${formulaToTptp(formula)})).`;
}

export function convertFolToTptpCnf(formula: string, opts: FolExportOptions = {}): string {
  const body = stripQuantifierEnvelope(normalizeFol(formula));
  const implication = splitTopLevel(body, '→');
  const cnfBody = implication
    ? `(~ ${toTptpAtom(implication[0]!)} | ${toTptpAtom(implication[1]!)})`
    : formulaToTptp(body);
  return `cnf(${sanitizeName(opts.name ?? 'fol_clause')}, ${opts.role ?? 'axiom'}, ${cnfBody}).`;
}

export function toPrefixNotation(formula: string): string {
  const normalized = stripQuantifierEnvelope(normalizeFol(formula));
  for (const [symbol, name] of [['↔', 'iff'], ['→', 'implies'], ['∨', 'or'], ['∧', 'and']] as const) {
    const parts = splitTopLevel(normalized, symbol);
    if (parts) return `(${name} ${toPrefixNotation(parts[0]!)} ${toPrefixNotation(parts[1]!)})`;
  }
  if (normalized.startsWith('¬')) return `(not ${toPrefixNotation(normalized.slice(1).trim())})`;
  return normalized;
}

function normalizeFol(formula: string): string {
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

function stripQuantifierEnvelope(formula: string): string {
  return formula
    .replace(/^[∀∃][A-Za-z]\w*\.\s*/g, '')
    .replace(/^\((.*)\)$/g, '$1')
    .trim();
}

function toPrologExpression(formula: string): string {
  const conjunction = splitTopLevel(formula, '∧');
  if (conjunction) return conjunction.map(toPrologExpression).join(', ');
  const disjunction = splitTopLevel(formula, '∨');
  if (disjunction) return disjunction.map(toPrologExpression).join('; ');
  if (formula.trim().startsWith('¬')) return `not ${toPrologExpression(formula.trim().slice(1))}`;
  return toPrologAtom(formula);
}

function toPrologAtom(atom: string): string {
  const trimmed = stripOuterParens(atom.trim());
  const match = trimmed.match(/^([A-Za-z_]\w*)\((.*)\)$/);
  if (!match) return lowerFirst(trimmed);
  const args = splitArguments(match[2]!).map(toPrologTerm).join(', ');
  return `${lowerFirst(match[1]!)}(${args})`;
}

function toTptpAtom(atom: string): string {
  const normalized = toPrologAtom(atom).replace(/\bnot\s+/g, '~ ');
  return normalized.replace(/\b([A-Z][A-Za-z0-9_]*)\b/g, '$1');
}

function toPrologTerm(term: string): string {
  const trimmed = term.trim();
  if (/^[a-z]\w*$/.test(trimmed)) return trimmed[0]!.toUpperCase() + trimmed.slice(1);
  return trimmed;
}

function splitArguments(text: string): string[] {
  const parts = splitTopLevelAll(text, ',');
  return parts.length ? parts : [text.trim()];
}

function splitTopLevel(text: string, separator: string): [string, string] | null {
  const parts = splitTopLevelAll(text, separator);
  return parts.length === 2 ? [parts[0]!, parts[1]!] : null;
}

function splitTopLevelAll(text: string, separator: string): string[] {
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
  return parts.filter(Boolean);
}

function stripOuterParens(text: string): string {
  if (!text.startsWith('(') || !text.endsWith(')')) return text;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0 && i < text.length - 1) return text;
    }
  }
  return text.slice(1, -1).trim();
}

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z_]+/, 'fol_');
}

function lowerFirst(value: string): string {
  return value ? value[0]!.toLowerCase() + value.slice(1) : value;
}
