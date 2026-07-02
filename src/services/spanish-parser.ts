/**
 * Spanish Parser for DCEC — T-233 (Sprint 52)
 *
 * Port of ipfs_datasets_py/logic/CEC/nl/spanish_parser.py
 *
 * Pattern-based Spanish → DCEC converter. Handles Spanish deontic modal verbs
 * (deber, poder), cognitive verbs (creer, saber), temporal expressions,
 * and negation (no + modal).
 */

// ---------------------------------------------------------------------------
// Operator constants
// ---------------------------------------------------------------------------

export const ES_DEONTIC_OP = {
  OBLIGATION:  'obligation',
  PERMISSION:  'permission',
  PROHIBITION: 'prohibition',
} as const;
export type EsDeonticOp = typeof ES_DEONTIC_OP[keyof typeof ES_DEONTIC_OP];

export const ES_COGNITIVE_OP = {
  BELIEF:    'belief',
  KNOWLEDGE: 'knowledge',
  INTENTION: 'intention',
  DESIRE:    'desire',
} as const;
export type EsCognitiveOp = typeof ES_COGNITIVE_OP[keyof typeof ES_COGNITIVE_OP];

export const ES_TEMPORAL_OP = {
  ALWAYS:     'always',
  EVENTUALLY: 'eventually',
  NEXT:       'next',
  UNTIL:      'until',
} as const;
export type EsTemporalOp = typeof ES_TEMPORAL_OP[keyof typeof ES_TEMPORAL_OP];

// ---------------------------------------------------------------------------
// Match type
// ---------------------------------------------------------------------------

export interface SpanishMatch {
  type: 'deontic' | 'cognitive' | 'temporal' | 'connective';
  operator: string;
  groups: string[];
  span: [number, number];
  text: string;
}

// ---------------------------------------------------------------------------
// Pattern catalogue
// ---------------------------------------------------------------------------

type DeonticPattern  = [RegExp, EsDeonticOp];
type CognitivePattern = [RegExp, EsCognitiveOp];
type TemporalPattern  = [RegExp, EsTemporalOp];

const ES_DEONTIC_PATTERNS: DeonticPattern[] = [
  // Prohibition FIRST
  [/(?:no\s+debe|no\s+puede|no\s+deben|no\s+pueden|está\s+prohibido)\s+(\w+)/gi, ES_DEONTIC_OP.PROHIBITION],
  [/(?:es\s+prohibido|está\s+vedado|está\s+prohibido\s+de)\s+(\w+)/gi,            ES_DEONTIC_OP.PROHIBITION],
  // Obligation
  [/(?:debe|deben|tiene\s+que|tienen\s+que|es\s+obligatorio|se\s+requiere)\s+(\w+)/gi, ES_DEONTIC_OP.OBLIGATION],
  [/(?:debería|deberían|es\s+necesario|está\s+obligado\s+a)\s+(\w+)/gi,                ES_DEONTIC_OP.OBLIGATION],
  // Permission
  [/(?:puede|pueden|está\s+permitido|se\s+permite|tiene\s+derecho\s+a)\s+(\w+)/gi, ES_DEONTIC_OP.PERMISSION],
  [/(?:es\s+permitido|es\s+lícito|puede\s+legalmente)\s+(\w+)/gi,                  ES_DEONTIC_OP.PERMISSION],
];

const ES_COGNITIVE_PATTERNS: CognitivePattern[] = [
  [/(?:cree\s+que|piensa\s+que|considera\s+que|estima\s+que)\s+(.+)/gi, ES_COGNITIVE_OP.BELIEF],
  [/(?:sabe\s+que|conoce|es\s+consciente\s+de\s+que)\s+(.+)/gi,        ES_COGNITIVE_OP.KNOWLEDGE],
  [/(?:tiene\s+la\s+intención\s+de|planea|pretende)\s+(\w+)/gi,         ES_COGNITIVE_OP.INTENTION],
  [/(?:desea|quiere|aspira\s+a|anhela)\s+(\w+)/gi,                     ES_COGNITIVE_OP.DESIRE],
];

const ES_TEMPORAL_PATTERNS: TemporalPattern[] = [
  [/(?:siempre|en\s+todo\s+momento|constantemente|perpetuamente)\s+(.+)/gi, ES_TEMPORAL_OP.ALWAYS],
  [/(?:eventualmente|finalmente|tarde\s+o\s+temprano|algún\s+día)\s+(.+)/gi, ES_TEMPORAL_OP.EVENTUALLY],
  [/(?:luego|después|a\s+continuación|en\s+el\s+siguiente\s+momento)\s+(.+)/gi, ES_TEMPORAL_OP.NEXT],
  [/(.+)\s+hasta\s+que\s+(.+)/gi, ES_TEMPORAL_OP.UNTIL],
];

// ---------------------------------------------------------------------------
// SpanishPatternMatcher
// ---------------------------------------------------------------------------

function runSpanishPatterns<Op extends string>(
  text: string,
  patterns: Array<[RegExp, Op]>,
  type: 'deontic' | 'cognitive' | 'temporal',
): SpanishMatch[] {
  const results: SpanishMatch[] = [];
  for (const [rx, op] of patterns) {
    const cloned = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
    cloned.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = cloned.exec(text)) !== null) {
      results.push({ type, operator: op, groups: m.slice(1).map(g => g?.trim() ?? ''), span: [m.index, m.index + m[0].length], text: m[0] });
    }
  }
  return results;
}

/**
 * Pattern-based matcher for Spanish deontic/cognitive/temporal language.
 *
 * TypeScript port of `SpanishPatternMatcher` from
 * `ipfs_datasets_py/logic/CEC/nl/spanish_parser.py`.
 */
export class SpanishPatternMatcher {
  match(text: string): SpanishMatch[] {
    return [
      ...runSpanishPatterns(text, ES_DEONTIC_PATTERNS, 'deontic'),
      ...runSpanishPatterns(text, ES_COGNITIVE_PATTERNS, 'cognitive'),
      ...runSpanishPatterns(text, ES_TEMPORAL_PATTERNS, 'temporal'),
    ].sort((a, b) => a.span[0] - b.span[0]);
  }

  matchByType(text: string, type: 'deontic' | 'cognitive' | 'temporal'): SpanishMatch[] {
    return this.match(text).filter(m => m.type === type);
  }
}

// ---------------------------------------------------------------------------
// SpanishParser
// ---------------------------------------------------------------------------

export interface SpanishClause {
  operator: string;
  type: string;
  subject: string;
  predicate: string;
  confidence: number;
}

export interface SpanishParseResult {
  text: string;
  clauses: SpanishClause[];
  matches: SpanishMatch[];
}

/**
 * Spanish NL → DCEC parser.
 */
export class SpanishParser {
  private readonly matcher = new SpanishPatternMatcher();

  parse(text: string): SpanishParseResult {
    const matches = this.matcher.match(text);
    const clauses = this.extractClauses(text, matches);
    return { text, clauses, matches };
  }

  extractClauses(text: string, matches?: SpanishMatch[]): SpanishClause[] {
    const m = matches ?? this.matcher.match(text);
    return m.map(match => ({
      operator: match.operator,
      type: match.type,
      subject: match.groups[0] ?? '',
      predicate: match.groups[1] ?? match.groups[0] ?? '',
      confidence: match.type === 'deontic' ? 0.75 : 0.60,
    }));
  }
}

// ---------------------------------------------------------------------------
// Lexicon data functions
// ---------------------------------------------------------------------------

export function getSpanishVerbConjugations(): Record<string, Record<string, string>> {
  return {
    deber: { yo: 'debo', tú: 'debes', él: 'debe', nosotros: 'debemos', vosotros: 'debéis', ellos: 'deben' },
    poder: { yo: 'puedo', tú: 'puedes', él: 'puede', nosotros: 'podemos', vosotros: 'podéis', ellos: 'pueden' },
    querer: { yo: 'quiero', tú: 'quieres', él: 'quiere', nosotros: 'queremos', vosotros: 'queréis', ellos: 'quieren' },
    saber: { yo: 'sé', tú: 'sabes', él: 'sabe', nosotros: 'sabemos', vosotros: 'sabéis', ellos: 'saben' },
  };
}

export function getSpanishArticles(): Record<string, string[]> {
  return {
    definite_masc_sg: ['el'], definite_fem_sg: ['la'], definite_masc_pl: ['los'],
    definite_fem_pl: ['las'], indefinite_masc_sg: ['un'], indefinite_fem_sg: ['una'],
    indefinite_masc_pl: ['unos'], indefinite_fem_pl: ['unas'],
  };
}

export function getSpanishDeonticKeywords(): Record<string, string[]> {
  return {
    obligation:  ['debe', 'deben', 'tiene que', 'tienen que', 'es obligatorio', 'debería', 'deberían'],
    permission:  ['puede', 'pueden', 'está permitido', 'se permite', 'tiene derecho a', 'es lícito'],
    prohibition: ['no debe', 'no puede', 'está prohibido', 'es prohibido', 'está vedado'],
  };
}
