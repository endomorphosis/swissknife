/**
 * First-order logic parsing and formula generation utilities.
 *
 * TypeScript port of ipfs_datasets_py/logic/fol/utils/fol_parser.py.
 */

import {
  convertToPrologFormat,
  convertToTptpFormat,
} from './logic-formatter.js';

export interface FolParsedQuantifier {
  type: 'universal' | 'existential';
  symbol: '∀' | '∃';
  scope: string;
  position: [number, number];
}

export interface FolParsedOperator {
  type: 'conjunction' | 'disjunction' | 'implication' | 'negation';
  symbol: '∧' | '∨' | '→' | '¬';
  position: [number, number];
}

export interface FolParsedRelation {
  type: 'universal' | 'existential' | 'implication';
  subject?: string;
  predicate?: string;
  premise?: string;
  conclusion?: string;
}

export interface FolPredicateGroups {
  nouns: string[];
  verbs: string[];
  adjectives: string[];
  relations: string[];
}

const UNIVERSAL_PATTERNS = [
  /\b(?:all|every|each)\s+(\w+)/gi,
  /\b(?:any|everything|everyone)\b/gi,
  /\bfor\s+all\s+(\w+)/gi,
];
const EXISTENTIAL_PATTERNS = [
  /\b(?:some|there (?:is|are|exists?))\s+(\w+)/gi,
  /\b(?:something|someone|at least one)\b/gi,
  /\bthere (?:is|are) (?:a|an|some)\s+(\w+)/gi,
];
const OPERATOR_PATTERNS: Array<[FolParsedOperator['type'], FolParsedOperator['symbol'], RegExp[]]> = [
  ['conjunction', '∧', [/\band\b/gi, /\bboth\s+.+?\s+and\b/gi, /[,;]\s*(?=\w)/g]],
  ['disjunction', '∨', [/\bor\b/gi, /\beither\s+.+?\s+or\b/gi]],
  ['implication', '→', [/\bif\s+.+?\s+then\b/gi, /\bimplies?\b/gi, /\btherefore\b/gi, /\bso\b/gi, /\bhence\b/gi]],
  ['negation', '¬', [/\bnot\b/gi, /\bno\b/gi, /\bnone\b/gi, /\bnever\b/gi, /\bnothing\b/gi]],
];

export function parseQuantifiers(text: string): FolParsedQuantifier[] {
  const quantifiers: FolParsedQuantifier[] = [];
  for (const pattern of UNIVERSAL_PATTERNS) {
    for (const match of String(text).toLowerCase().matchAll(new RegExp(pattern.source, pattern.flags))) {
      quantifiers.push({
        type: 'universal',
        symbol: '∀',
        scope: match[1] ?? 'x',
        position: [match.index ?? 0, (match.index ?? 0) + match[0].length],
      });
    }
  }
  for (const pattern of EXISTENTIAL_PATTERNS) {
    for (const match of String(text).toLowerCase().matchAll(new RegExp(pattern.source, pattern.flags))) {
      quantifiers.push({
        type: 'existential',
        symbol: '∃',
        scope: match[1] ?? 'x',
        position: [match.index ?? 0, (match.index ?? 0) + match[0].length],
      });
    }
  }
  return quantifiers;
}

export function parseLogicalOperators(text: string): FolParsedOperator[] {
  const operators: FolParsedOperator[] = [];
  const lower = String(text).toLowerCase();
  for (const [type, symbol, patterns] of OPERATOR_PATTERNS) {
    for (const pattern of patterns) {
      for (const match of lower.matchAll(new RegExp(pattern.source, pattern.flags))) {
        operators.push({ type, symbol, position: [match.index ?? 0, (match.index ?? 0) + match[0].length] });
      }
    }
  }
  return operators;
}

export function extractPredicates(text: string): FolPredicateGroups {
  const nouns = Array.from(new Set(Array.from(String(text).matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g))
    .map(match => normalizePredicateName(match[0]))));
  const lower = String(text).toLowerCase();
  const verbs = Array.from(new Set(Array.from(lower.matchAll(/\b(?:is|are|was|were|has|have|can|will|should|must)\s+(\w+)\b/g))
    .map(match => normalizePredicateName(match[1]))));
  const adjectives = Array.from(new Set(Array.from(lower.matchAll(/\b(?:is|are|was|were)\s+(\w+)(?:\s|$|\.)/g))
    .map(match => normalizePredicateName(match[1]))));
  return { nouns, verbs, adjectives, relations: [] };
}

export function extractLogicalRelations(text: string): FolParsedRelation[] {
  const lower = String(text).toLowerCase();
  const relations: FolParsedRelation[] = [];
  for (const match of lower.matchAll(/if\s+(.+?)\s+then\s+(.+?)(?:\.|$)/g)) {
    relations.push({ type: 'implication', premise: match[1].trim(), conclusion: match[2].trim() });
  }
  for (const match of lower.matchAll(/all\s+(\w+)\s+(?:are|is|have|has)\s+(.+?)(?:\.|$)/g)) {
    relations.push({ type: 'universal', subject: match[1].trim(), predicate: match[2].trim() });
  }
  for (const match of lower.matchAll(/(?:some|there (?:is|are))\s+(\w+)\s+(?:are|is|have|has)\s+(.+?)(?:\.|$)/g)) {
    relations.push({ type: 'existential', subject: match[1].trim(), predicate: match[2].trim() });
  }
  return relations;
}

export function buildFolFormula(
  quantifiers: FolParsedQuantifier[],
  predicates: FolPredicateGroups,
  operators: FolParsedOperator[],
  relations: FolParsedRelation[],
): string {
  void quantifiers;
  void operators;
  if (relations.length === 0) {
    if (predicates.nouns.length && predicates.adjectives.length) {
      return `∀x (${predicates.nouns[0]}(x) → ${predicates.adjectives[0]}(x))`;
    }
    if (predicates.nouns.length) return `∃x ${predicates.nouns[0]}(x)`;
    return '⊤';
  }
  const formulas = relations.map(relation => {
    if (relation.type === 'universal') {
      return `∀x (${normalizePredicateName(relation.subject ?? '')}(x) → ${normalizePredicateName(relation.predicate ?? '')}(x))`;
    }
    if (relation.type === 'existential') {
      return `∃x (${normalizePredicateName(relation.subject ?? '')}(x) ∧ ${normalizePredicateName(relation.predicate ?? '')}(x))`;
    }
    return `∀x (${parseSimplePredicate(relation.premise ?? '')} → ${parseSimplePredicate(relation.conclusion ?? '')})`;
  });
  return formulas.length === 1 ? formulas[0] : formulas.map(formula => `(${formula})`).join(' ∧ ');
}

export function parseFol(text: string): Record<string, unknown> {
  const normalized = String(text ?? '').trim();
  if (!normalized) {
    return {
      fol_formula: '⊤',
      quantifiers: [],
      operators: [],
      predicates: {},
      relations: [],
      validation: validateFolSyntax('⊤'),
    };
  }
  const quantifiers = parseQuantifiers(normalized);
  const operators = parseLogicalOperators(normalized);
  const predicates = extractPredicates(normalized);
  const relations = extractLogicalRelations(normalized);
  const folFormula = buildFolFormula(quantifiers, predicates, operators, relations);
  return {
    fol_formula: folFormula,
    quantifiers,
    operators,
    predicates,
    relations,
    validation: validateFolSyntax(folFormula),
  };
}

export function normalizePredicateName(name: string): string {
  const filtered = String(name).trim().split(/\s+/).filter(word => !['the', 'a', 'an'].includes(word.toLowerCase()));
  return filtered.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('') || 'P';
}

export function parseSimplePredicate(text: string): string {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const predicate = words.length === 1 ? words[0] : words[words.length - 1] ?? 'P';
  return `${normalizePredicateName(predicate)}(x)`;
}

export function validateFolSyntax(formula: string): Record<string, unknown> {
  if (typeof formula !== 'string' || !formula) {
    return { valid: false, errors: ['Formula is empty or not a string'] };
  }
  const errors: string[] = [];
  let parenBalance = 0;
  for (const char of formula) {
    if (char === '(') parenBalance += 1;
    else if (char === ')') {
      parenBalance -= 1;
      if (parenBalance < 0) {
        errors.push('Unmatched closing parenthesis');
        break;
      }
    }
  }
  if (parenBalance !== 0) errors.push('Unbalanced parentheses');
  if ((formula.includes('∀') || formula.includes('∃')) && !/[∀∃][a-z]/.test(formula)) {
    errors.push('Quantifier missing variable');
  }
  if (!/[A-Z][a-zA-Z]*\([^)]*\)/.test(formula) && !['⊤', '⊥'].includes(formula)) {
    errors.push('No valid predicate found');
  }
  return { valid: errors.length === 0, errors };
}

export function convertToProlog(folFormula: string): string {
  return convertToPrologFormat(folFormula);
}

export function convertToTptp(folFormula: string): string {
  return convertToTptpFormat(folFormula);
}

export const parse_quantifiers = parseQuantifiers;
export const parse_logical_operators = parseLogicalOperators;
export const build_fol_formula = buildFolFormula;
export const parse_fol = parseFol;
export const normalize_predicate_name = normalizePredicateName;
export const parse_simple_predicate = parseSimplePredicate;
export const validate_fol_syntax = validateFolSyntax;
export const convert_to_prolog = convertToProlog;
export const convert_to_tptp = convertToTptp;
