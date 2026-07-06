/**
 * DCEC Integration — T-271 (Sprint 60)
 * Port of CEC/native/dcec_integration.py (427L)
 */

import { ParseToken, parseDcecExpression } from './dcec-parsing';

export class DCECParsingError extends Error {
  constructor(message: string, public readonly expr?: string) {
    super(message); this.name = 'DCECParsingError';
  }
}

export function parseExpressionToToken(expr: string): ParseToken | string {
  const cleaned = expr.trim();
  if (!cleaned) throw new DCECParsingError('Empty expression', expr);
  try { return parseDcecExpression(cleaned); }
  catch (e) { throw new DCECParsingError(`Failed to parse: ${e}`, expr); }
}

export function tokenToFormula(token: ParseToken | string): string {
  if (typeof token === 'string') return token;
  return token.createFExpression();
}

export function parseDcecString(dcec: string): string {
  const token = parseExpressionToToken(dcec);
  if (typeof token === 'string') return token;
  return token.createFExpression();
}

export function validateFormula(formula: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let depth = 0;
  for (const ch of formula) {
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth < 0) { errors.push('Unmatched )'); break; } }
  }
  if (depth > 0) errors.push('Unclosed parenthesis');
  if (!formula.trim()) errors.push('Empty formula');
  return { valid: errors.length === 0, errors };
}
