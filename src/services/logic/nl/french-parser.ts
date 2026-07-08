/**
 * French Parser for DCEC — T-231
 *
 * Port of ipfs_datasets_py/logic/CEC/nl/french_parser.py
 *
 * Pattern-based French → DCEC converter, structurally parallel to german-parser.ts.
 * Handles French deontic modal verbs (devoir, pouvoir), cognitive verbs,
 * temporal expressions, and negation (ne … pas).
 */

// ---------------------------------------------------------------------------
// Operator constants (reuse string values from german-parser)
// ---------------------------------------------------------------------------

export const FR_DEONTIC_OP = {
  OBLIGATION:  'obligation',
  PERMISSION:  'permission',
  PROHIBITION: 'prohibition',
} as const;
export type FrDeonticOp = typeof FR_DEONTIC_OP[keyof typeof FR_DEONTIC_OP];

export const FR_COGNITIVE_OP = {
  BELIEF:    'belief',
  KNOWLEDGE: 'knowledge',
  INTENTION: 'intention',
  DESIRE:    'desire',
} as const;
export type FrCognitiveOp = typeof FR_COGNITIVE_OP[keyof typeof FR_COGNITIVE_OP];

export const FR_TEMPORAL_OP = {
  ALWAYS:     'always',
  EVENTUALLY: 'eventually',
  NEXT:       'next',
  UNTIL:      'until',
} as const;
export type FrTemporalOp = typeof FR_TEMPORAL_OP[keyof typeof FR_TEMPORAL_OP];

// ---------------------------------------------------------------------------
// Match type
// ---------------------------------------------------------------------------

export interface FrenchMatch {
  type: 'deontic' | 'cognitive' | 'temporal' | 'connective';
  operator: string;
  groups: string[];
  span: [number, number];
  text: string;
}

// ---------------------------------------------------------------------------
// Pattern catalogue
// ---------------------------------------------------------------------------

type DeonticPattern  = [RegExp, FrDeonticOp];
type CognitivePattern = [RegExp, FrCognitiveOp];
type TemporalPattern  = [RegExp, FrTemporalOp];

const FR_DEONTIC_PATTERNS: DeonticPattern[] = [
  // Prohibition FIRST (negation + devoir/pouvoir)
  [/(?:ne\s+doit\s+pas|ne\s+peut\s+pas|ne\s+doivent\s+pas|il\s+est\s+interdit\s+de)\s+(\w+)/gi, FR_DEONTIC_OP.PROHIBITION],
  [/(?:est\s+interdit|est\s+prohibé|est\s+défendu)\s+de\s+(\w+)/gi,                              FR_DEONTIC_OP.PROHIBITION],
  // Obligation
  [/(?:doit|doivent|est\s+obligé\s+de|sont\s+obligés\s+de|est\s+tenu\s+de|il\s+faut)\s+(\w+)/gi, FR_DEONTIC_OP.OBLIGATION],
  [/(?:devrait|devraient|est\s+requis\s+de|sont\s+requis\s+de)\s+(\w+)/gi,                        FR_DEONTIC_OP.OBLIGATION],
  // Permission
  [/(?:peut|peuvent|est\s+autorisé\s+à|sont\s+autorisés\s+à|il\s+est\s+permis\s+de)\s+(\w+)/gi,  FR_DEONTIC_OP.PERMISSION],
  [/(?:est\s+permis|est\s+autorisé|a\s+le\s+droit\s+de)\s+(\w+)/gi,                              FR_DEONTIC_OP.PERMISSION],
];

const FR_COGNITIVE_PATTERNS: CognitivePattern[] = [
  [/(?:croit\s+que|croit\s+que|pense\s+que|estime\s+que)\s+(.+)/gi, FR_COGNITIVE_OP.BELIEF],
  [/(?:sait\s+que|connaît|est\s+conscient\s+que)\s+(.+)/gi,         FR_COGNITIVE_OP.KNOWLEDGE],
  [/(?:a\s+l'intention\s+de|prévoit\s+de|envisage\s+de)\s+(\w+)/gi, FR_COGNITIVE_OP.INTENTION],
  [/(?:désire|souhaite|veut|aspire\s+à)\s+(\w+)/gi,                 FR_COGNITIVE_OP.DESIRE],
];

const FR_TEMPORAL_PATTERNS: TemporalPattern[] = [
  [/(?:toujours|en\s+tout\s+temps|constamment|perpétuellement)\s+(.+)/gi, FR_TEMPORAL_OP.ALWAYS],
  [/(?:finalement|éventuellement|un\s+jour|à\s+terme)\s+(.+)/gi,          FR_TEMPORAL_OP.EVENTUALLY],
  [/(?:ensuite|puis|après\s+cela|prochainement)\s+(.+)/gi,                FR_TEMPORAL_OP.NEXT],
  [/(.+)\s+jusqu(?:à|'à)\s+(.+)/gi,                                       FR_TEMPORAL_OP.UNTIL],
];

// ---------------------------------------------------------------------------
// FrenchPatternMatcher
// ---------------------------------------------------------------------------

function runPatterns<Op extends string>(
  text: string,
  patterns: Array<[RegExp, Op]>,
  type: 'deontic' | 'cognitive' | 'temporal' | 'connective',
): FrenchMatch[] {
  const results: FrenchMatch[] = [];
  for (const [rx, op] of patterns) {
    const cloned = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
    cloned.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = cloned.exec(text)) !== null) {
      results.push({
        type,
        operator: op,
        groups: m.slice(1).map(g => g?.trim() ?? ''),
        span: [m.index, m.index + m[0].length],
        text: m[0],
      });
    }
  }
  return results;
}

/**
 * Pattern-based matcher for French deontic / cognitive / temporal language.
 *
 * TypeScript port of `FrenchPatternMatcher` from
 * `ipfs_datasets_py/logic/CEC/nl/french_parser.py`.
 */
export class FrenchPatternMatcher {
  match(text: string): FrenchMatch[] {
    return [
      ...runPatterns(text, FR_DEONTIC_PATTERNS, 'deontic'),
      ...runPatterns(text, FR_COGNITIVE_PATTERNS, 'cognitive'),
      ...runPatterns(text, FR_TEMPORAL_PATTERNS, 'temporal'),
    ].sort((a, b) => a.span[0] - b.span[0]);
  }

  matchByType(text: string, type: 'deontic' | 'cognitive' | 'temporal' | 'connective'): FrenchMatch[] {
    return this.match(text).filter(m => m.type === type);
  }
}

// ---------------------------------------------------------------------------
// FrenchParser
// ---------------------------------------------------------------------------

export interface FrenchClause {
  operator: string;
  type: string;
  subject: string;
  predicate: string;
  confidence: number;
}

export interface FrenchParseResult {
  text: string;
  clauses: FrenchClause[];
  matches: FrenchMatch[];
}

/**
 * French NL → DCEC parser.
 *
 * TypeScript port of `FrenchParser` from
 * `ipfs_datasets_py/logic/CEC/nl/french_parser.py`.
 */
export class FrenchParser {
  private readonly matcher = new FrenchPatternMatcher();

  parse(text: string): FrenchParseResult {
    const matches = this.matcher.match(text);
    const clauses = this.extractClauses(text, matches);
    return { text, clauses, matches };
  }

  extractClauses(text: string, matches?: FrenchMatch[]): FrenchClause[] {
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
// Module-level lexicon data functions
// ---------------------------------------------------------------------------

/** French modal verb conjugations. */
export function getFrenchVerbConjugations(): Record<string, Record<string, string>> {
  return {
    devoir: { je: 'dois', tu: 'dois', il: 'doit', nous: 'devons', vous: 'devez', ils: 'doivent' },
    pouvoir: { je: 'peux', tu: 'peux', il: 'peut', nous: 'pouvons', vous: 'pouvez', ils: 'peuvent' },
    vouloir: { je: 'veux', tu: 'veux', il: 'veut', nous: 'voulons', vous: 'voulez', ils: 'veulent' },
    savoir: { je: 'sais', tu: 'sais', il: 'sait', nous: 'savons', vous: 'savez', ils: 'savent' },
  };
}

/** French articles (definite + indefinite). */
export function getFrenchArticles(): Record<string, string[]> {
  return {
    definite_singular_masc: ['le'],
    definite_singular_fem:  ['la'],
    definite_plural:        ['les'],
    indefinite_singular_masc: ['un'],
    indefinite_singular_fem:  ['une'],
    indefinite_plural:        ['des'],
    contracted_du:  ['du'],
    contracted_des: ['des'],
    contracted_au:  ['au'],
    contracted_aux: ['aux'],
  };
}

/** French negation patterns (ne … pas / ne … jamais / etc.). */
export function getFrenchNegationPatterns(): string[] {
  return [
    'ne … pas', 'ne … plus', 'ne … jamais', 'ne … rien',
    'ne … personne', 'ne … guère', 'ne … point',
  ];
}

/** French deontic keywords grouped by modality. */
export function getFrenchDeonticKeywords(): Record<string, string[]> {
  return {
    obligation:  ['doit', 'doivent', 'devrait', 'devraient', 'il faut', 'est obligé', 'est tenu', 'est requis'],
    permission:  ['peut', 'peuvent', 'est autorisé', 'il est permis', 'a le droit'],
    prohibition: ['ne doit pas', 'ne peut pas', 'est interdit', 'est prohibé', 'est défendu'],
  };
}
