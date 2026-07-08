/**
 * DCEC string parser integration for TDFOL.
 *
 * TypeScript port of ipfs_datasets_py/logic/TDFOL/tdfol_dcec_parser.py.
 */

import {
  Formula,
  Term,
  mkBinary,
  mkConstant,
  mkDeontic,
  mkPredicate,
  mkQuantified,
  mkTemporal,
  mkUnary,
  mkVariable,
} from './tdfol-core.js';

export class DCECStringParser {
  readonly useNative = false;

  parse(dcecString: string): Formula {
    return this.parseWithFallback(String(dcecString).trim());
  }

  private parseWithFallback(dcecString: string): Formula {
    if (!dcecString) throw new Error('Empty expression');
    if (dcecString.startsWith('(') && dcecString.endsWith(')')) {
      return this.parseSexpr(dcecString.slice(1, -1));
    }
    if (/^[A-Z][a-zA-Z0-9_]*\(.*\)$/.test(dcecString)) {
      return this.parsePredicate(dcecString);
    }
    if (/^[A-Z][a-zA-Z0-9_]*$/.test(dcecString)) {
      return mkPredicate(dcecString, []);
    }
    return this.parseSexpr(dcecString);
  }

  private parseSexpr(expr: string): Formula {
    const parts = this.splitSexpr(expr.trim());
    if (!parts.length) throw new Error(`Empty expression: ${expr}`);
    const operator = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (operator === 'and') return foldBinary('∧', args, this.parseWithFallback.bind(this), 'and');
    if (operator === 'or') return foldBinary('∨', args, this.parseWithFallback.bind(this), 'or');
    if (operator === 'not') {
      requireArity(operator, args, 1);
      return mkUnary(this.parseWithFallback(args[0]));
    }
    if (operator === 'implies' || operator === '->') {
      requireArity('implies', args, 2);
      return mkBinary('→', this.parseWithFallback(args[0]), this.parseWithFallback(args[1]));
    }
    if (operator === 'iff' || operator === '<->') {
      requireArity('iff', args, 2);
      return mkBinary('↔', this.parseWithFallback(args[0]), this.parseWithFallback(args[1]));
    }
    if (operator === 'forall') {
      requireArity(operator, args, 2);
      return mkQuantified('∀', mkVariable(args[0]), this.parseWithFallback(args[1]));
    }
    if (operator === 'exists') {
      requireArity(operator, args, 2);
      return mkQuantified('∃', mkVariable(args[0]), this.parseWithFallback(args[1]));
    }
    if (operator === 'o') {
      requireArity('O', args, 1);
      return mkDeontic('O', this.parseWithFallback(args[0]));
    }
    if (operator === 'p') {
      requireArity('P', args, 1);
      return mkDeontic('P', this.parseWithFallback(args[0]));
    }
    if (operator === 'f') {
      requireArity('F', args, 1);
      return mkDeontic('F', this.parseWithFallback(args[0]));
    }
    if (operator === 'always' || operator === 'g') {
      requireArity('always', args, 1);
      return mkTemporal('□', this.parseWithFallback(args[0]));
    }
    if (operator === 'eventually') {
      requireArity('eventually', args, 1);
      return mkTemporal('◊', this.parseWithFallback(args[0]));
    }
    if (operator === 'next' || operator === 'x') {
      requireArity('next', args, 1);
      return mkTemporal('X', this.parseWithFallback(args[0]));
    }
    if (operator === 'until' || operator === 'u') {
      requireArity('until', args, 2);
      return mkTemporal('U', this.parseWithFallback(args[0]), this.parseWithFallback(args[1]));
    }
    return this.parsePredicateApplication(operator, args);
  }

  private splitSexpr(expr: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    for (const char of expr) {
      if (char === '(') {
        depth += 1;
        current += char;
      } else if (char === ')') {
        depth -= 1;
        current += char;
      } else if (/\s/.test(char) && depth === 0) {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    if (current) parts.push(current);
    return parts;
  }

  private parsePredicate(predicate: string): Formula {
    const match = predicate.match(/^([A-Z][a-zA-Z0-9_]*)\((.*)\)$/);
    if (!match) throw new Error(`Invalid predicate: ${predicate}`);
    const args = match[2].trim()
      ? match[2].split(',').map(arg => this.parseTerm(arg.trim()))
      : [];
    return mkPredicate(match[1], args);
  }

  private parsePredicateApplication(name: string, args: string[]): Formula {
    return mkPredicate(name, args.map(arg => this.parseTerm(arg.trim())));
  }

  private parseTerm(value: string): Term {
    if (value && /^[a-z]/.test(value)) return mkVariable(value);
    return mkConstant(value);
  }
}

export function parseDcec(dcecString: string): Formula {
  return new DCECStringParser().parse(dcecString);
}

export function parseDcecSafe(dcecString: string): Formula | null {
  try {
    return parseDcec(dcecString);
  } catch {
    return null;
  }
}

export const parse_dcec = parseDcec;
export const parse_dcec_safe = parseDcecSafe;

function foldBinary(
  operator: '∧' | '∨',
  args: string[],
  parse: (value: string) => Formula,
  label: string,
): Formula {
  if (args.length < 2) throw new Error(`'${label}' requires at least 2 arguments`);
  let result = mkBinary(operator, parse(args[0]), parse(args[1]));
  for (const arg of args.slice(2)) result = mkBinary(operator, result, parse(arg));
  return result;
}

function requireArity(operator: string, args: string[], expected: number): void {
  if (args.length !== expected) throw new Error(`'${operator}' requires exactly ${expected} argument${expected === 1 ? '' : 's'}`);
}
