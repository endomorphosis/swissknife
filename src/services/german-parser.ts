/**
 * German Parser for DCEC — T-218 (Sprint 49)
 *
 * Port of ipfs_datasets_py/logic/CEC/nl/german_parser.py
 *
 * Pattern-based German → DCEC converter.  Handles German-specific grammar
 * (modal particles, capitalized nouns, compound words, case system).
 */

// ---------------------------------------------------------------------------
// German deontic / cognitive / temporal operator constants
// ---------------------------------------------------------------------------

export const DEONTIC_OPERATOR = {
  OBLIGATION: 'obligation',
  PERMISSION: 'permission',
  PROHIBITION: 'prohibition',
} as const;
export type DeonticOp = typeof DEONTIC_OPERATOR[keyof typeof DEONTIC_OPERATOR];

export const COGNITIVE_OPERATOR = {
  BELIEF:    'belief',
  KNOWLEDGE: 'knowledge',
  INTENTION: 'intention',
  DESIRE:    'desire',
  GOAL:      'goal',
} as const;
export type CognitiveOp = typeof COGNITIVE_OPERATOR[keyof typeof COGNITIVE_OPERATOR];

export const TEMPORAL_OPERATOR = {
  ALWAYS:     'always',
  EVENTUALLY: 'eventually',
  NEXT:       'next',
  UNTIL:      'until',
  SINCE:      'since',
} as const;
export type TemporalOp = typeof TEMPORAL_OPERATOR[keyof typeof TEMPORAL_OPERATOR];

// ---------------------------------------------------------------------------
// Match types
// ---------------------------------------------------------------------------

export interface GermanMatch {
  type: 'deontic' | 'cognitive' | 'temporal' | 'connective';
  operator: string;
  groups: string[];
  span: [number, number];
  text: string;
}

// ---------------------------------------------------------------------------
// German pattern catalogue
// ---------------------------------------------------------------------------

type DeonticPattern  = [RegExp, DeonticOp];
type CognitivePattern = [RegExp, CognitiveOp];
type TemporalPattern  = [RegExp, TemporalOp];
type ConnectivePattern = [RegExp, string];

const DEONTIC_PATTERNS: DeonticPattern[] = [
  // Prohibition FIRST (negative patterns before positive)
  [/(?:nicht darf|nicht dürfen|darf nicht|dürfen nicht)\s+(\w+)/gi, DEONTIC_OPERATOR.PROHIBITION],
  [/(?:nicht muss|muss nicht|nicht müssen|müssen nicht)\s+(\w+)/gi, DEONTIC_OPERATOR.PROHIBITION],
  [/(?:verboten|ist verboten|es ist verboten)\s+(\w+)/gi,            DEONTIC_OPERATOR.PROHIBITION],
  // Obligation
  [/(?:müssen|verpflichtet sind|sind verpflichtet|haben die Pflicht)\s+(\w+)/gi, DEONTIC_OPERATOR.OBLIGATION],
  [/(?:muss|ist verpflichtet|hat die Pflicht|es ist erforderlich)\s+(\w+)/gi,    DEONTIC_OPERATOR.OBLIGATION],
  [/(?:soll|sollte|sollen|sollten)\s+(\w+)/gi,                                   DEONTIC_OPERATOR.OBLIGATION],
  // Permission
  [/(?:dürfen|sind erlaubt|sind berechtigt|haben das Recht)\s+(\w+)/gi,          DEONTIC_OPERATOR.PERMISSION],
  [/(?:darf|kann|ist erlaubt|ist berechtigt|hat das Recht)\s+(\w+)/gi,           DEONTIC_OPERATOR.PERMISSION],
  [/(?:es ist erlaubt|man darf|man kann)\s+(\w+)/gi,                             DEONTIC_OPERATOR.PERMISSION],
];

const COGNITIVE_PATTERNS: CognitivePattern[] = [
  [/(?:glaubt dass|denkt dass|meint dass|nimmt an dass)\s+(.+)/gi, COGNITIVE_OPERATOR.BELIEF],
  [/(?:weiß dass|kennt|ist sich bewusst dass)\s+(.+)/gi,           COGNITIVE_OPERATOR.KNOWLEDGE],
  [/(?:beabsichtigt|plant|hat vor|gedenkt)\s+(\w+)/gi,             COGNITIVE_OPERATOR.INTENTION],
  [/(?:will|möchte|wünscht|strebt an|hat den Wunsch)\s+(\w+)/gi,  COGNITIVE_OPERATOR.DESIRE],
  [/(?:hat das Ziel|zielt darauf ab|sein Ziel ist)\s+(\w+)/gi,    COGNITIVE_OPERATOR.GOAL],
];

const TEMPORAL_PATTERNS: TemporalPattern[] = [
  [/(?:immer|stets|jederzeit|allezeit)\s+(.+)/gi,                TEMPORAL_OPERATOR.ALWAYS],
  [/(?:schließlich|irgendwann|letztendlich|am Ende)\s+(.+)/gi,   TEMPORAL_OPERATOR.EVENTUALLY],
  [/(?:dann|danach|als nächstes|im nächsten Moment)\s+(.+)/gi,   TEMPORAL_OPERATOR.NEXT],
  [/(.+)\s+bis\s+(.+)/gi,                                        TEMPORAL_OPERATOR.UNTIL],
  [/(.+)\s+(?:seit|seitdem)\s+(.+)/gi,                          TEMPORAL_OPERATOR.SINCE],
];

const CONNECTIVE_PATTERNS: ConnectivePattern[] = [
  [/(.+)\s+und\s+(.+)/gi,           'AND'],
  [/(.+)\s+oder\s+(.+)/gi,          'OR'],
  [/wenn\s+(.+)\s+dann\s+(.+)/gi,   'IMPLIES'],
  [/falls\s+(.+)\s+dann\s+(.+)/gi,  'IMPLIES'],
  [/^nicht\s+(.+)/gi,               'NOT'],
];

// ---------------------------------------------------------------------------
// GermanPatternMatcher
// ---------------------------------------------------------------------------

/**
 * Pattern-based matcher for German deontic/cognitive/temporal language.
 *
 * TypeScript port of `GermanPatternMatcher` from
 * `ipfs_datasets_py/logic/CEC/nl/german_parser.py`.
 */
export class GermanPatternMatcher {
  /** Find all pattern matches in `text` ordered by span start. */
  match(text: string): GermanMatch[] {
    const results: GermanMatch[] = [];

    for (const [rx, op] of DEONTIC_PATTERNS) {
      const cloned = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
      cloned.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = cloned.exec(text)) !== null) {
        results.push({ type: 'deontic', operator: op, groups: m.slice(1).map(g => g ?? ''), span: [m.index, m.index + m[0].length], text: m[0] });
      }
    }

    for (const [rx, op] of COGNITIVE_PATTERNS) {
      const cloned = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
      cloned.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = cloned.exec(text)) !== null) {
        results.push({ type: 'cognitive', operator: op, groups: m.slice(1).map(g => g ?? ''), span: [m.index, m.index + m[0].length], text: m[0] });
      }
    }

    for (const [rx, op] of TEMPORAL_PATTERNS) {
      const cloned = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
      cloned.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = cloned.exec(text)) !== null) {
        results.push({ type: 'temporal', operator: op, groups: m.slice(1).map(g => g ?? ''), span: [m.index, m.index + m[0].length], text: m[0] });
      }
    }

    results.sort((a, b) => a.span[0] - b.span[0]);
    return results;
  }

  /** Filter matches to a specific deontic / cognitive / temporal type. */
  matchByType(text: string, type: 'deontic' | 'cognitive' | 'temporal' | 'connective'): GermanMatch[] {
    return this.match(text).filter(m => m.type === type);
  }
}

// ---------------------------------------------------------------------------
// GermanParser
// ---------------------------------------------------------------------------

export interface GermanClause {
  operator: string;
  type: string;
  subject: string;
  predicate: string;
  confidence: number;
}

export interface GermanParseResult {
  text: string;
  clauses: GermanClause[];
  matches: GermanMatch[];
}

/**
 * German NL → DCEC parser.
 *
 * TypeScript port of `GermanParser` from
 * `ipfs_datasets_py/logic/CEC/nl/german_parser.py`.
 */
export class GermanParser {
  private readonly matcher = new GermanPatternMatcher();

  parse(text: string): GermanParseResult {
    const matches = this.matcher.match(text);
    const clauses = this.extractClauses(text, matches);
    return { text, clauses, matches };
  }

  extractClauses(text: string, matches?: GermanMatch[]): GermanClause[] {
    const m = matches ?? this.matcher.match(text);
    return m.map(match => ({
      operator: match.operator,
      type: match.type,
      subject: match.groups[0] ?? '',
      predicate: match.groups[1] ?? match.groups[0] ?? '',
      confidence: this._confidence(match),
    }));
  }

  private _confidence(match: GermanMatch): number {
    const base = match.type === 'deontic' ? 0.7 : 0.6;
    return Math.min(1.0, base + (match.groups.filter(Boolean).length * 0.05));
  }
}

// ---------------------------------------------------------------------------
// Module-level data functions (from German lexicon)
// ---------------------------------------------------------------------------

/** German modal verb conjugations grouped by infinitive. */
export function getGermanVerbConjugations(): Record<string, Record<string, string>> {
  return {
    müssen: { ich: 'muss', du: 'musst', er: 'muss', wir: 'müssen', ihr: 'müsst', sie: 'müssen' },
    dürfen: { ich: 'darf', du: 'darfst', er: 'darf', wir: 'dürfen', ihr: 'dürft', sie: 'dürfen' },
    sollen: { ich: 'soll', du: 'sollst', er: 'soll', wir: 'sollen', ihr: 'sollt', sie: 'sollen' },
    können: { ich: 'kann', du: 'kannst', er: 'kann', wir: 'können', ihr: 'könnt', sie: 'können' },
    wollen: { ich: 'will', du: 'willst', er: 'will', wir: 'wollen', ihr: 'wollt', sie: 'wollen' },
    mögen:  { ich: 'mag', du: 'magst', er: 'mag', wir: 'mögen', ihr: 'mögt', sie: 'mögen' },
  };
}

/** German articles (definite + indefinite) by case and gender. */
export function getGermanArticles(): Record<string, Record<string, string[]>> {
  return {
    definite: {
      nominative: ['der', 'die', 'das', 'die'],
      accusative: ['den', 'die', 'das', 'die'],
      dative:     ['dem', 'der', 'dem', 'den'],
      genitive:   ['des', 'der', 'des', 'der'],
    },
    indefinite: {
      nominative: ['ein', 'eine', 'ein', '—'],
      accusative: ['einen', 'eine', 'ein', '—'],
      dative:     ['einem', 'einer', 'einem', '—'],
      genitive:   ['eines', 'einer', 'eines', '—'],
    },
  };
}

/** German modal particles commonly found in legal/deontic text. */
export function getGermanModalParticles(): string[] {
  return ['aber', 'auch', 'doch', 'denn', 'eigentlich', 'eben', 'halt', 'ja', 'mal', 'noch', 'nur', 'schon', 'wohl'];
}

/** German deontic keywords grouped by modality. */
export function getGermanDeonticKeywords(): Record<string, string[]> {
  return {
    obligation:  ['müssen', 'muss', 'soll', 'sollen', 'sollte', 'sollten', 'verpflichtet', 'Pflicht', 'erforderlich', 'obligatorisch'],
    permission:  ['dürfen', 'darf', 'kann', 'können', 'erlaubt', 'berechtigt', 'gestattet'],
    prohibition: ['nicht dürfen', 'nicht darf', 'verboten', 'untersagt', 'nicht gestattet', 'nicht erlaubt'],
  };
}

/** Common German compound words relevant to deontic/legal text. */
export function getGermanCompoundWords(): Record<string, string> {
  return {
    Rechtspflicht: 'legal obligation',
    Genehmigung: 'permission',
    Verbot: 'prohibition',
    Verpflichtung: 'obligation',
    Berechtigung: 'authorization',
    Zustimmung: 'consent',
    Einwilligung: 'consent',
    Datenschutz: 'data protection',
    Vertraulichkeit: 'confidentiality',
    Haftung: 'liability',
  };
}
