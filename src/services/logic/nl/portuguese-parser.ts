/**
 * Portuguese Parser for DCEC — PORT-179
 *
 * Port of ipfs_datasets_py/logic/CEC/nl/portuguese_parser.py.
 *
 * Pattern-based Portuguese → DCEC converter, structurally parallel to the
 * French/German/Spanish parser modules. Handles Portuguese deontic modal
 * verbs, cognitive verbs, temporal expressions, and negation.
 */

// ---------------------------------------------------------------------------
// Operator constants
// ---------------------------------------------------------------------------

export const PT_DEONTIC_OP = {
  OBLIGATION:  'obligation',
  PERMISSION:  'permission',
  PROHIBITION: 'prohibition',
} as const;
export type PtDeonticOp = typeof PT_DEONTIC_OP[keyof typeof PT_DEONTIC_OP];

export const PT_COGNITIVE_OP = {
  BELIEF:    'belief',
  KNOWLEDGE: 'knowledge',
  INTENTION: 'intention',
  DESIRE:    'desire',
} as const;
export type PtCognitiveOp = typeof PT_COGNITIVE_OP[keyof typeof PT_COGNITIVE_OP];

export const PT_TEMPORAL_OP = {
  ALWAYS:     'always',
  EVENTUALLY: 'eventually',
  NEXT:       'next',
  UNTIL:      'until',
} as const;
export type PtTemporalOp = typeof PT_TEMPORAL_OP[keyof typeof PT_TEMPORAL_OP];

// ---------------------------------------------------------------------------
// Match type
// ---------------------------------------------------------------------------

export interface PortugueseMatch {
  type: 'deontic' | 'cognitive' | 'temporal' | 'connective';
  operator: string;
  groups: string[];
  span: [number, number];
  text: string;
}

// ---------------------------------------------------------------------------
// Pattern catalogue
// ---------------------------------------------------------------------------

type DeonticPattern = [RegExp, PtDeonticOp];
type CognitivePattern = [RegExp, PtCognitiveOp];
type TemporalPattern = [RegExp, PtTemporalOp];

const PT_FLAGS = 'giu';

const PT_DEONTIC_PATTERNS: DeonticPattern[] = [
  // Prohibition FIRST so "não deve" does not get classified as obligation.
  [new RegExp(String.raw`([^.;]+?)\s+(?:não\s+deve|não\s+devem|não\s+pode|não\s+podem|não\s+deverá|não\s+poderá)\s+([^.;]+)`, PT_FLAGS), PT_DEONTIC_OP.PROHIBITION],
  [new RegExp(String.raw`(?:é\s+proibido|é\s+vedado|fica\s+proibido|não\s+é\s+permitido)(?:\s+(?:a|de))?\s+([^.;]+)`, PT_FLAGS), PT_DEONTIC_OP.PROHIBITION],

  // Obligation
  [new RegExp(String.raw`([^.;]+?)\s+(?:deve|devem|deverá|deverão|tem\s+de|têm\s+de|é\s+obrigado\s+a|são\s+obrigados\s+a)\s+([^.;]+)`, PT_FLAGS), PT_DEONTIC_OP.OBLIGATION],
  [new RegExp(String.raw`(?:é\s+necessário|é\s+obrigatório|é\s+exigido|requer-se|exige-se)\s+([^.;]+)`, PT_FLAGS), PT_DEONTIC_OP.OBLIGATION],

  // Permission
  [new RegExp(String.raw`([^.;]+?)\s+(?:pode|podem|poderá|poderão|tem\s+permissão\s+para|têm\s+permissão\s+para|está\s+autorizado\s+a|estão\s+autorizados\s+a|tem\s+direito\s+a)\s+([^.;]+)`, PT_FLAGS), PT_DEONTIC_OP.PERMISSION],
  [new RegExp(String.raw`(?:é\s+permitido|é\s+lícito|permite-se|autoriza-se)\s+([^.;]+)`, PT_FLAGS), PT_DEONTIC_OP.PERMISSION],
];

const PT_COGNITIVE_PATTERNS: CognitivePattern[] = [
  [new RegExp(String.raw`([^.;]+?)\s+(?:acredita\s+que|crê\s+que|pensa\s+que|considera\s+que)\s+([^.;]+)`, PT_FLAGS), PT_COGNITIVE_OP.BELIEF],
  [new RegExp(String.raw`([^.;]+?)\s+(?:sabe\s+que|conhece|está\s+ciente\s+de\s+que)\s+([^.;]+)`, PT_FLAGS), PT_COGNITIVE_OP.KNOWLEDGE],
  [new RegExp(String.raw`([^.;]+?)\s+(?:tem\s+a\s+intenção\s+de|pretende|planeja|tenciona)\s+([^.;]+)`, PT_FLAGS), PT_COGNITIVE_OP.INTENTION],
  [new RegExp(String.raw`([^.;]+?)\s+(?:deseja|quer|aspira\s+a)\s+([^.;]+)`, PT_FLAGS), PT_COGNITIVE_OP.DESIRE],
];

const PT_TEMPORAL_PATTERNS: TemporalPattern[] = [
  [new RegExp(String.raw`(?:sempre|em\s+todo\s+momento|constantemente|permanentemente)\s+([^.;]+)`, PT_FLAGS), PT_TEMPORAL_OP.ALWAYS],
  [new RegExp(String.raw`(?:eventualmente|finalmente|cedo\s+ou\s+tarde|algum\s+dia)\s+([^.;]+)`, PT_FLAGS), PT_TEMPORAL_OP.EVENTUALLY],
  [new RegExp(String.raw`(?:depois|em\s+seguida|a\s+seguir|no\s+próximo\s+momento)\s+([^.;]+)`, PT_FLAGS), PT_TEMPORAL_OP.NEXT],
  [new RegExp(String.raw`([^.;]+?)\s+até\s+que\s+([^.;]+)`, PT_FLAGS), PT_TEMPORAL_OP.UNTIL],
];

// ---------------------------------------------------------------------------
// PortuguesePatternMatcher
// ---------------------------------------------------------------------------

function runPortuguesePatterns<Op extends string>(
  text: string,
  patterns: Array<[RegExp, Op]>,
  type: 'deontic' | 'cognitive' | 'temporal',
): PortugueseMatch[] {
  const results: PortugueseMatch[] = [];
  for (const [rx, op] of patterns) {
    const cloned = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
    cloned.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = cloned.exec(text)) !== null) {
      const span: [number, number] = [m.index, m.index + m[0].length];
      if (results.some(r => overlaps(r.span, span))) continue;
      results.push({
        type,
        operator: op,
        groups: m.slice(1).map(g => g?.trim() ?? ''),
        span,
        text: m[0],
      });
    }
  }
  return results;
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * Pattern-based matcher for Portuguese deontic/cognitive/temporal language.
 */
export class PortuguesePatternMatcher {
  match(text: string): PortugueseMatch[] {
    return [
      ...runPortuguesePatterns(text, PT_DEONTIC_PATTERNS, 'deontic'),
      ...runPortuguesePatterns(text, PT_COGNITIVE_PATTERNS, 'cognitive'),
      ...runPortuguesePatterns(text, PT_TEMPORAL_PATTERNS, 'temporal'),
    ].sort((a, b) => a.span[0] - b.span[0]);
  }

  matchByType(text: string, type: 'deontic' | 'cognitive' | 'temporal' | 'connective'): PortugueseMatch[] {
    return this.match(text).filter(m => m.type === type);
  }
}

// ---------------------------------------------------------------------------
// PortugueseParser
// ---------------------------------------------------------------------------

export interface PortugueseClause {
  operator: string;
  type: string;
  subject: string;
  predicate: string;
  confidence: number;
}

export interface PortugueseParseResult {
  text: string;
  clauses: PortugueseClause[];
  matches: PortugueseMatch[];
}

/**
 * Portuguese NL → DCEC parser.
 */
export class PortugueseParser {
  private readonly matcher = new PortuguesePatternMatcher();

  parse(text: string): PortugueseParseResult {
    const matches = this.matcher.match(text);
    const clauses = this.extractClauses(text, matches);
    return { text, clauses, matches };
  }

  extractClauses(text: string, matches?: PortugueseMatch[]): PortugueseClause[] {
    const m = matches ?? this.matcher.match(text);
    return m.map(match => ({
      operator: match.operator,
      type: match.type,
      subject: match.groups[1] ? stripPortugueseArticle(match.groups[0] ?? '') : '',
      predicate: match.groups[1] ?? match.groups[0] ?? '',
      confidence: this.confidence(match),
    }));
  }

  private confidence(match: PortugueseMatch): number {
    const base = match.type === 'deontic' ? 0.75 : 0.60;
    return Math.min(1.0, base + match.groups.filter(Boolean).length * 0.05);
  }
}

function stripPortugueseArticle(text: string): string {
  return text.replace(/^(?:o|a|os|as|um|uma|uns|umas)\s+/iu, '').trim();
}

// ---------------------------------------------------------------------------
// Lexicon data functions
// ---------------------------------------------------------------------------

export interface PortugueseDeonticKeywords {
  obligation: string[];
  permission: string[];
  prohibition: string[];
  negation: string[];
}

export function getPortugueseVerbConjugations(): Record<string, Record<string, string>> {
  return {
    dever: { eu: 'devo', tu: 'deves', ele: 'deve', nos: 'devemos', vos: 'deveis', eles: 'devem' },
    poder: { eu: 'posso', tu: 'podes', ele: 'pode', nos: 'podemos', vos: 'podeis', eles: 'podem' },
    querer: { eu: 'quero', tu: 'queres', ele: 'quer', nos: 'queremos', vos: 'quereis', eles: 'querem' },
    saber: { eu: 'sei', tu: 'sabes', ele: 'sabe', nos: 'sabemos', vos: 'sabeis', eles: 'sabem' },
  };
}

export function getPortugueseArticles(): Record<string, string[]> {
  return {
    definite_masc_sg: ['o'],
    definite_fem_sg: ['a'],
    definite_masc_pl: ['os'],
    definite_fem_pl: ['as'],
    indefinite_masc_sg: ['um'],
    indefinite_fem_sg: ['uma'],
    indefinite_masc_pl: ['uns'],
    indefinite_fem_pl: ['umas'],
  };
}

export function getPortugueseNegationPatterns(): string[] {
  return ['não', 'nunca', 'jamais', 'sem', 'não deve', 'não pode', 'não é permitido'];
}

export function getPortugueseDeonticKeywords(): PortugueseDeonticKeywords {
  return {
    obligation: ['deve', 'devem', 'deverá', 'deverão', 'tem de', 'têm de', 'é necessário', 'é obrigatório'],
    permission: ['pode', 'podem', 'poderá', 'poderão', 'é permitido', 'tem permissão', 'está autorizado', 'tem direito a'],
    prohibition: ['não deve', 'não pode', 'é proibido', 'é vedado', 'fica proibido', 'não é permitido'],
    negation: getPortugueseNegationPatterns(),
  };
}

export function getPortugueseLegalTerms(): Record<string, string> {
  return {
    contrato: 'contract',
    obrigação: 'obligation',
    permissão: 'permission',
    proibição: 'prohibition',
    direito: 'right',
    dever: 'duty',
    consentimento: 'consent',
    confidencialidade: 'confidentiality',
    dados: 'data',
  };
}
