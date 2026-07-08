/**
 * TDFOL Expansion Rules — PORT-185
 *
 * Port of ipfs_datasets_py/logic/TDFOL/expansion_rules.py.
 *
 * Dedicated, individually-testable expansion rules for propositional and
 * temporal TDFOL formulas. These rules are intentionally string-based so they
 * can serve parser/prover bridges before full AST conversion.
 */

export interface ExpansionBranch {
  formulas: string[];
  closed?: boolean;
}

export abstract class ExpansionRule {
  abstract readonly name: string;
  abstract matches(formula: string, negated?: boolean): boolean;
  abstract expand(formula: string, negated?: boolean): ExpansionBranch[];
}

export class AndExpansionRule extends ExpansionRule {
  readonly name = 'and-expansion';

  matches(formula: string, negated = false): boolean {
    return !negated && splitBinary(formula, ['∧', '&&', 'and']) !== null;
  }

  expand(formula: string): ExpansionBranch[] {
    const parts = splitBinary(formula, ['∧', '&&', 'and']);
    return parts ? [{ formulas: parts }] : [{ formulas: [formula] }];
  }
}

export class OrExpansionRule extends ExpansionRule {
  readonly name = 'or-expansion';

  matches(formula: string, negated = false): boolean {
    return !negated && splitBinary(formula, ['∨', '||', 'or']) !== null;
  }

  expand(formula: string): ExpansionBranch[] {
    const parts = splitBinary(formula, ['∨', '||', 'or']);
    return parts ? parts.map(part => ({ formulas: [part] })) : [{ formulas: [formula] }];
  }
}

export class ImpliesExpansionRule extends ExpansionRule {
  readonly name = 'implies-expansion';

  matches(formula: string, negated = false): boolean {
    return !negated && splitBinary(formula, ['→', '=>', 'implies']) !== null;
  }

  expand(formula: string): ExpansionBranch[] {
    const parts = splitBinary(formula, ['→', '=>', 'implies']);
    return parts ? [{ formulas: [`¬${parts[0]}`] }, { formulas: [parts[1]!] }] : [{ formulas: [formula] }];
  }
}

export class IffExpansionRule extends ExpansionRule {
  readonly name = 'iff-expansion';

  matches(formula: string, negated = false): boolean {
    return !negated && splitBinary(formula, ['↔', '<=>', 'iff']) !== null;
  }

  expand(formula: string): ExpansionBranch[] {
    const parts = splitBinary(formula, ['↔', '<=>', 'iff']);
    return parts
      ? [{ formulas: [`${parts[0]} → ${parts[1]}`, `${parts[1]} → ${parts[0]}`] }]
      : [{ formulas: [formula] }];
  }
}

export class NegationExpansionRule extends ExpansionRule {
  readonly name = 'negation-expansion';

  matches(formula: string, negated = false): boolean {
    return !negated && /^¬\s*¬|^~~/.test(formula.trim());
  }

  expand(formula: string): ExpansionBranch[] {
    return [{ formulas: [formula.trim().replace(/^¬\s*¬\s*|^~~\s*/, '')] }];
  }
}

export class TemporalExpansionRule extends ExpansionRule {
  readonly name = 'temporal-expansion';

  matches(formula: string, negated = false): boolean {
    if (negated) return false;
    const text = formula.trim();
    return /^□|^Always\(/.test(text) || /^◊|^Eventually\(/.test(text) || splitBinary(text, ['U', 'until']) !== null;
  }

  expand(formula: string): ExpansionBranch[] {
    const text = formula.trim();
    if (text.startsWith('□')) return [{ formulas: [stripUnaryTemporal(text, '□')] }];
    if (text.startsWith('◊')) return [{ formulas: [stripUnaryTemporal(text, '◊')] }, { formulas: [`X(${text})`] }];
    if (/^Always\(/.test(text)) return [{ formulas: [insideCall(text)] }];
    if (/^Eventually\(/.test(text)) return [{ formulas: [insideCall(text)] }, { formulas: [`X(${text})`] }];

    const until = splitBinary(text, ['U', 'until']);
    if (until) {
      const [left, right] = until;
      return [
        { formulas: [right!] },
        { formulas: [left!, `X(${text})`] },
      ];
    }
    return [{ formulas: [formula] }];
  }
}

const ALL_RULES: ExpansionRule[] = [
  new AndExpansionRule(),
  new OrExpansionRule(),
  new ImpliesExpansionRule(),
  new IffExpansionRule(),
  new NegationExpansionRule(),
  new TemporalExpansionRule(),
];

export function getAllExpansionRules(): ExpansionRule[] {
  return [...ALL_RULES];
}

export function selectExpansionRule(formula: string, negated = false): ExpansionRule | null {
  return ALL_RULES.find(rule => rule.matches(formula, negated)) ?? null;
}

export function expandFormula(formula: string, negated = false): ExpansionBranch[] {
  const rule = selectExpansionRule(formula, negated);
  return rule ? rule.expand(formula, negated) : [{ formulas: [formula] }];
}

function splitBinary(formula: string, operators: string[]): [string, string] | null {
  const text = stripOuterParens(formula.trim());
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth !== 0) continue;

    for (const op of operators) {
      if (matchesOperatorAt(text, i, op)) {
        const left = text.slice(0, i).trim();
        const right = text.slice(i + op.length).trim();
        if (left && right) return [left, right];
      }
    }
  }
  return null;
}

function matchesOperatorAt(text: string, index: number, op: string): boolean {
  if (text.slice(index, index + op.length) !== op) return false;
  if (/^[A-Za-z]+$/.test(op)) {
    const before = text[index - 1] ?? ' ';
    const after = text[index + op.length] ?? ' ';
    return /\W/.test(before) && /\W/.test(after);
  }
  return true;
}

function stripUnaryTemporal(text: string, op: string): string {
  const rest = text.slice(op.length).trim();
  return stripOuterParens(rest);
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

function insideCall(text: string): string {
  const start = text.indexOf('(');
  return start >= 0 && text.endsWith(')') ? text.slice(start + 1, -1).trim() : text;
}

// Backward-compatible alias used by older acceptance tests.
export { NegationExpansionRule as NotExpansionRule };
