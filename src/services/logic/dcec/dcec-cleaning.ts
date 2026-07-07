/**
 * DCEC Cleaning Utilities — PORT-175
 *
 * Port of ipfs_datasets_py/logic/CEC/native/dcec_cleaning.py.
 *
 * Dedicated reusable normalization helpers for DCEC parser/prover inputs.
 */

export interface DCECCleaningResult {
  original: string;
  cleaned: string;
  changed: boolean;
  balancedParens: boolean;
}

const OPERATOR_SYNONYMS: Array<[RegExp, string]> = [
  [/\band\b/gi, '∧'],
  [/\bor\b/gi, '∨'],
  [/\bnot\b/gi, '¬'],
  [/\bimplies?\b/gi, '→'],
  [/\biff\b|\bif and only if\b/gi, '↔'],
  [/\bobligated\b|\bobligation\b/gi, 'O'],
  [/\bpermitted\b|\bpermission\b/gi, 'P'],
  [/\bforbidden\b|\bprohibited\b|\bprohibition\b/gi, 'F'],
  [/\balways\b/gi, '□'],
  [/\beventually\b/gi, '◊'],
];

export function stripWhitespace(expression: string): string {
  return expression.replace(/\s+/g, ' ').trim();
}

export function stripComments(expression: string): string {
  return expression
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/;[^\n]*/g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .trim();
}

export function normalizeOperators(expression: string): string {
  let out = expression;
  for (const [rx, replacement] of OPERATOR_SYNONYMS) {
    out = out.replace(rx, replacement);
  }
  return out;
}

export function normalizeDcecExpression(expression: string): string {
  return consolidateParens(
    stripWhitespace(
      normalizeOperators(
        stripComments(expression),
      ),
    )
      .replace(/\s*([(),])\s*/g, '$1')
      .replace(/\s*(∧|∨|→|↔)\s*/g, ` $1 `)
      .replace(/¬\s+/g, '¬'),
  );
}

export function cleanDcecFormula(expression: string): DCECCleaningResult {
  const cleaned = normalizeDcecExpression(expression);
  return {
    original: expression,
    cleaned,
    changed: cleaned !== expression,
    balancedParens: checkParens(cleaned),
  };
}

export function consolidateParens(expression: string): string {
  let prev = '';
  let result = expression;
  while (prev !== result) {
    prev = result;
    result = result.replace(/\(\s*\(([^()]+)\)\s*\)/g, '($1)');
  }
  return result;
}

export function checkParens(expression: string): boolean {
  let depth = 0;
  for (const ch of expression) {
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

export function getMatchingCloseParen(input: string, openIdx = 0): number | null {
  if (input[openIdx] !== '(') return null;
  let depth = 0;
  for (let i = openIdx; i < input.length; i++) {
    if (input[i] === '(') depth++;
    else if (input[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

export function splitTopLevelArgs(input: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      args.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = input.slice(start).trim();
  if (last) args.push(last);
  return args;
}

// Python-compatible snake_case aliases.
export const strip_whitespace = stripWhitespace;
export const strip_comments = stripComments;
export const consolidate_parens = consolidateParens;
export const check_parens = checkParens;
export const get_matching_close_paren = getMatchingCloseParen;
