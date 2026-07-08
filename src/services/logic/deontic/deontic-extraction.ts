/**
 * Deontic Extraction Utilities — PORT-189
 *
 * Completes reusable predicate/deontic extraction heuristics and nested
 * deontic formula parsing with explicit operator precedence.
 */

export type DeonticOperator = 'O' | 'P' | 'F';
export type DeonticAstKind = 'atom' | 'modal' | 'not' | 'and' | 'or' | 'implies';

export interface ExtractedPredicate {
  name: string;
  args: string[];
  source: string;
  confidence: number;
}

export interface ExtractedDeonticStatement {
  operator: DeonticOperator;
  modality: 'obligation' | 'permission' | 'prohibition';
  actor: string;
  proposition: string;
  action: string;
  source: string;
  confidence: number;
}

export type DeonticAst =
  | { kind: 'atom'; value: string }
  | { kind: 'modal'; operator: DeonticOperator; body: DeonticAst }
  | { kind: 'not'; body: DeonticAst }
  | { kind: 'and' | 'or' | 'implies'; left: DeonticAst; right: DeonticAst };

export function extractPredicatesFromText(text: string): ExtractedPredicate[] {
  const predicates: ExtractedPredicate[] = [];
  for (const match of text.matchAll(/\b([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
    predicates.push({
      name: match[1]!,
      args: match[2]!.split(',').map(arg => arg.trim()).filter(Boolean),
      source: match[0],
      confidence: 0.95,
    });
  }
  for (const match of text.matchAll(/\b([A-Z]?[a-z]+)\s+(?:is|are)\s+([a-z][\w-]+)/g)) {
    predicates.push({
      name: normalizePredicateName(match[2]!),
      args: [match[1]!],
      source: match[0],
      confidence: 0.7,
    });
  }
  return predicates;
}

export function extractDeonticStatements(text: string): ExtractedDeonticStatement[] {
  const statements: ExtractedDeonticStatement[] = [];
  const patterns: Array<{ operator: DeonticOperator; modality: ExtractedDeonticStatement['modality']; phrases: string[]; confidence: number }> = [
    { operator: 'F', modality: 'prohibition', phrases: ['must not', 'shall not', 'may not', 'is prohibited from', 'is forbidden to'], confidence: 0.9 },
    { operator: 'O', modality: 'obligation', phrases: ['is required to', 'is obligated to', 'must', 'shall', 'should'], confidence: 0.88 },
    { operator: 'P', modality: 'permission', phrases: ['is permitted to', 'is allowed to', 'may', 'can'], confidence: 0.84 },
  ];
  for (const clause of text.split(/[.;]+/).map(part => part.trim()).filter(Boolean)) {
    for (const pattern of patterns) {
      const match = splitOnModalPhrase(clause, pattern.phrases);
      if (!match) continue;
      statements.push({
        operator: pattern.operator,
        modality: pattern.modality,
        actor: cleanPhrase(match.actor),
        proposition: cleanPhrase(match.action),
        action: cleanPhrase(match.action),
        source: clause,
        confidence: pattern.confidence,
      });
      break;
    }
  }
  return statements;
}

function splitOnModalPhrase(clause: string, phrases: string[]): { actor: string; action: string } | null {
  const lower = clause.toLowerCase();
  for (const phrase of phrases) {
    const index = lower.indexOf(` ${phrase} `);
    if (index <= 0) continue;
    return {
      actor: clause.slice(0, index).trim(),
      action: clause.slice(index + phrase.length + 2).trim(),
    };
  }
  return null;
}

export function parseDeonticFormula(formula: string): DeonticAst {
  return parseExpression(stripOuterParens(formula.trim()));
}

export function serializeDeonticAst(ast: DeonticAst): string {
  switch (ast.kind) {
    case 'atom':
      return ast.value;
    case 'modal':
      return `${ast.operator}(${serializeDeonticAst(ast.body)})`;
    case 'not':
      return `¬${serializeDeonticAst(ast.body)}`;
    case 'and':
      return `(${serializeDeonticAst(ast.left)} ∧ ${serializeDeonticAst(ast.right)})`;
    case 'or':
      return `(${serializeDeonticAst(ast.left)} ∨ ${serializeDeonticAst(ast.right)})`;
    case 'implies':
      return `(${serializeDeonticAst(ast.left)} → ${serializeDeonticAst(ast.right)})`;
  }
}

function parseExpression(text: string): DeonticAst {
  const implication = splitTopLevel(text, '→') ?? splitTopLevel(text, '=>') ?? splitTopLevel(text, '->');
  if (implication) return { kind: 'implies', left: parseExpression(implication[0]), right: parseExpression(implication[1]) };
  const or = splitTopLevel(text, '∨') ?? splitTopLevel(text, '|');
  if (or) return { kind: 'or', left: parseExpression(or[0]), right: parseExpression(or[1]) };
  const and = splitTopLevel(text, '∧') ?? splitTopLevel(text, '&');
  if (and) return { kind: 'and', left: parseExpression(and[0]), right: parseExpression(and[1]) };
  if (text.startsWith('¬') || text.startsWith('~')) return { kind: 'not', body: parseExpression(text.slice(1).trim()) };
  const modal = text.match(/^([OPF])\s*\((.*)\)$/);
  if (modal) return { kind: 'modal', operator: modal[1] as DeonticOperator, body: parseExpression(stripOuterParens(modal[2]!.trim())) };
  return { kind: 'atom', value: stripOuterParens(text) };
}

function splitTopLevel(text: string, operator: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && text.slice(i, i + operator.length) === operator) {
      return [text.slice(0, i).trim(), text.slice(i + operator.length).trim()];
    }
  }
  return null;
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

function cleanPhrase(text: string): string {
  return text.replace(/^(the|a|an)\s+/i, '').replace(/\s+/g, ' ').trim();
}

function normalizePredicateName(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
