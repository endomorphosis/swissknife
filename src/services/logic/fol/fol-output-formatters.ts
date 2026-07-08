/**
 * FOL output formatting utilities.
 *
 * TypeScript port of ipfs_datasets_py/logic/fol/utils/logic_formatter.py.
 */

export interface FormattedFol {
  fol_formula: string;
  format: string;
  metadata?: Record<string, unknown>;
  prolog_form?: string;
  tptp_form?: string;
  structured_form?: Record<string, unknown>;
}

export function formatFol(
  formula: string,
  outputFormat = 'symbolic',
  includeMetadata = true,
): FormattedFol {
  const result: FormattedFol = { fol_formula: formula, format: outputFormat };
  if (outputFormat === 'prolog') result.prolog_form = convertToPrologFormat(formula);
  else if (outputFormat === 'tptp') result.tptp_form = convertToTptpFormat(formula);
  else if (outputFormat === 'json') result.structured_form = parseFolToJson(formula);
  if (includeMetadata) result.metadata = extractFolMetadata(formula);
  return result;
}

export function convertToPrologFormat(folFormula: string): string {
  const universal = folFormula.match(/∀(\w+)\s*\((\w+)\((\w+)\)\s*→\s*(\w+)\((\w+)\)\)/);
  if (universal) {
    const variable = universal[1].toUpperCase();
    return `${universal[4].toLowerCase()}(${variable}) :- ${universal[2].toLowerCase()}(${variable}).`;
  }

  const existential = folFormula.match(/∃(\w+)\s*(\w+)\((\w+)\)/);
  if (existential) {
    return `${existential[2].toLowerCase()}(a).`;
  }
  return `% ${folFormula}`;
}

export function convertToTptpFormat(folFormula: string): string {
  let tptp = folFormula
    .replace(/∀([a-zA-Z]\w*)/g, '![$1]:')
    .replace(/∃([a-zA-Z]\w*)/g, '?[$1]:')
    .replace(/∧/g, ' & ')
    .replace(/∨/g, ' | ')
    .replace(/→/g, ' => ')
    .replace(/↔/g, ' <=> ')
    .replace(/¬/g, '~');
  tptp = tptp.replace(/\s+/g, ' ').trim();
  return `fof(formula, axiom, ${tptp}).`;
}

export function convertToDefeasibleFormat(deonticFormula: string, normType: string): string {
  if (normType === 'obligation') return `obligatory(${deonticFormula}) unless defeated.`;
  if (normType === 'permission') return `permitted(${deonticFormula}) unless forbidden.`;
  if (normType === 'prohibition') return `forbidden(${deonticFormula}) unless permitted.`;
  return `norm(${deonticFormula}).`;
}

export function parseFolToJson(folFormula: string): Record<string, unknown> {
  const quantifiers = Array.from(folFormula.matchAll(/([∀∃])([a-z])/g)).map(match => ({
    type: match[1] === '∀' ? 'universal' : 'existential',
    variable: match[2],
    symbol: match[1],
  }));
  const predicates = Array.from(folFormula.matchAll(/([A-Z][a-zA-Z]*)\(([^)]+)\)/g)).map(match => {
    const args = match[2].split(',').map(arg => arg.trim());
    return { name: match[1], arity: args.length, arguments: args };
  });
  const variables = Array.from(new Set(Array.from(folFormula.matchAll(/\b([a-z])\b/g)).map(match => match[1]))).sort();
  const operators: Array<{ type: string; symbol: string }> = [];
  if (folFormula.includes('∧')) operators.push({ type: 'conjunction', symbol: '∧' });
  if (folFormula.includes('∨')) operators.push({ type: 'disjunction', symbol: '∨' });
  if (folFormula.includes('→')) operators.push({ type: 'implication', symbol: '→' });
  if (folFormula.includes('¬')) operators.push({ type: 'negation', symbol: '¬' });
  return { quantifiers, predicates, variables, operators };
}

export function parseDeonticToJson(deonticFormula: string): Record<string, unknown> {
  const deonticOperators = Array.from(deonticFormula.matchAll(/([OPF])\(/g)).map(match => ({
    type: { O: 'obligation', P: 'permission', F: 'prohibition' }[match[1] as 'O' | 'P' | 'F'] ?? 'unknown',
    symbol: match[1],
  }));
  const logicalPart = deonticFormula.match(/[OPF]\((.+)\)$/);
  return {
    deontic_operators: deonticOperators,
    predicates: [],
    logical_structure: logicalPart ? parseFolToJson(logicalPart[1]) : {},
  };
}

export function extractFolMetadata(formula: string): Record<string, unknown> {
  const predicateArgs = Array.from(formula.matchAll(/[A-Z][a-zA-Z]*\(([^)]+)\)/g)).map(match => match[1]);
  const metadata = {
    complexity: 'simple',
    quantifier_count: (formula.match(/[∀∃]/g) ?? []).length,
    predicate_count: predicateArgs.length,
    operator_count: (formula.match(/[∧∨→↔¬]/g) ?? []).length,
    max_arity: predicateArgs.length ? Math.max(...predicateArgs.map(args => args.split(',').length)) : 0,
  };
  const total = metadata.quantifier_count + metadata.predicate_count + metadata.operator_count;
  if (total > 10) metadata.complexity = 'complex';
  else if (total > 5) metadata.complexity = 'moderate';
  return metadata;
}

export function extractDeonticMetadata(formula: string, normType: string): Record<string, unknown> {
  return {
    ...extractFolMetadata(formula),
    norm_type: normType,
    deontic_operator: normType.slice(0, 1).toUpperCase(),
  };
}

export function formatOutput(
  formulas: Array<Record<string, unknown>>,
  summary: Record<string, unknown>,
  outputFormat = 'json',
): Record<string, unknown> | string {
  if (outputFormat === 'json') {
    return {
      status: 'success',
      formulas,
      summary,
      metadata: { conversion_timestamp: getTimestamp(), tool_version: '1.0.0' },
    };
  }
  if (outputFormat === 'text') return formatTextOutput(formulas, summary);
  if (outputFormat === 'xml') return JSON.stringify({ formulas, summary });
  return { error: `Unsupported output format: ${outputFormat}` };
}

export function formatTextOutput(formulas: Array<Record<string, unknown>>, summary: Record<string, unknown>): string {
  const lines = [
    'Logic Conversion Results',
    '==============================',
    `Total formulas: ${formulas.length}`,
    `Conversion rate: ${(Number(summary.conversion_rate ?? 0) * 100).toFixed(2)}%`,
    '',
  ];
  formulas.forEach((formula, index) => {
    lines.push(`Formula ${index + 1}:`);
    lines.push(`  Original: ${String(formula.original_text ?? '')}`);
    lines.push(`  Logic: ${String(formula.fol_formula ?? formula.deontic_formula ?? '')}`);
    lines.push('');
  });
  return lines.join('\n');
}

export function getTimestamp(): string {
  return new Date().toISOString();
}

export const format_fol = formatFol;
export const convert_to_prolog_format = convertToPrologFormat;
export const convert_to_tptp_format = convertToTptpFormat;
export const convert_to_defeasible_format = convertToDefeasibleFormat;
export const parse_fol_to_json = parseFolToJson;
export const parse_deontic_to_json = parseDeonticToJson;
export const extract_fol_metadata = extractFolMetadata;
export const extract_deontic_metadata = extractDeonticMetadata;
export const format_output = formatOutput;
export const format_text_output = formatTextOutput;
export const get_timestamp = getTimestamp;
