/**
 * DCEC English Grammar — T-213 (Sprint 48)
 *
 * Port of ipfs_datasets_py/logic/CEC/native/dcec_english_grammar.py
 *
 * English lexicon + grammar rules for bidirectional DCEC ↔ English conversion.
 * Supports deontic operators (must/may/forbidden), cognitive operators
 * (believes/knows/intends), temporal operators, and logical connectives.
 * (The Python original depends on GrammarEngine; this port inlines the
 * relevant machinery without an external CFG library.)
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Part-of-speech / syntactic category. */
export enum LexicalCategory {
  NOUN        = 'NOUN',
  VERB        = 'VERB',
  ADJECTIVE   = 'ADJECTIVE',
  ADVERB      = 'ADVERB',
  CONJUNCTION = 'CONJUNCTION',
  PREPOSITION = 'PREPOSITION',
  DETERMINER  = 'DETERMINER',
  QUANTIFIER  = 'QUANTIFIER',
  MODAL       = 'MODAL',
}

/** Semantic types for DCEC formula elements. */
export enum SemanticType {
  DEONTIC    = 'deontic',
  COGNITIVE  = 'cognitive',
  TEMPORAL   = 'temporal',
  CONNECTIVE = 'connective',
  QUANTIFIER = 'quantifier',
  PREDICATE  = 'predicate',
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/** A single lexical entry (word → DCEC semantics). */
export interface LexicalEntry {
  word: string;
  category: LexicalCategory;
  semantics: {
    type: SemanticType;
    operator: string;
    [extra: string]: unknown;
  };
  /** Alternative surface forms (plural, past tense, …). */
  forms?: string[];
}

/** A phrase-level grammar rule (pattern → semantics). */
export interface GrammarRule {
  name: string;
  pattern: RegExp;
  semantics: {
    type: SemanticType;
    operator: string;
    [extra: string]: unknown;
  };
  description?: string;
}

// ---------------------------------------------------------------------------
// Lexicon
// ---------------------------------------------------------------------------

const LEXICON: LexicalEntry[] = [
  // ── Logical connectives ──────────────────────────────────────────────────
  { word: 'and',      category: LexicalCategory.CONJUNCTION, semantics: { type: SemanticType.CONNECTIVE, operator: 'AND' } },
  { word: 'or',       category: LexicalCategory.CONJUNCTION, semantics: { type: SemanticType.CONNECTIVE, operator: 'OR'  } },
  { word: 'not',      category: LexicalCategory.ADVERB,      semantics: { type: SemanticType.CONNECTIVE, operator: 'NOT' } },
  { word: 'if',       category: LexicalCategory.CONJUNCTION, semantics: { type: SemanticType.CONNECTIVE, operator: 'IMPLIES' } },
  { word: 'implies',  category: LexicalCategory.VERB,        semantics: { type: SemanticType.CONNECTIVE, operator: 'IMPLIES' } },
  { word: 'iff',      category: LexicalCategory.CONJUNCTION, semantics: { type: SemanticType.CONNECTIVE, operator: 'IFF' } },

  // ── Deontic modals ───────────────────────────────────────────────────────
  { word: 'must',       category: LexicalCategory.MODAL, semantics: { type: SemanticType.DEONTIC, operator: 'obligated' }, forms: ['obligated', 'shall', 'should', 'is required to'] },
  { word: 'obligated',  category: LexicalCategory.VERB,  semantics: { type: SemanticType.DEONTIC, operator: 'obligated' } },
  { word: 'forbidden',  category: LexicalCategory.VERB,  semantics: { type: SemanticType.DEONTIC, operator: 'forbidden' }, forms: ['prohibited', 'must not', 'shall not'] },
  { word: 'prohibited', category: LexicalCategory.VERB,  semantics: { type: SemanticType.DEONTIC, operator: 'forbidden' } },
  { word: 'may',        category: LexicalCategory.MODAL, semantics: { type: SemanticType.DEONTIC, operator: 'permitted' }, forms: ['permitted', 'allowed', 'can'] },
  { word: 'permitted',  category: LexicalCategory.VERB,  semantics: { type: SemanticType.DEONTIC, operator: 'permitted' } },

  // ── Cognitive operators ──────────────────────────────────────────────────
  { word: 'believes',   category: LexicalCategory.VERB, semantics: { type: SemanticType.COGNITIVE, operator: 'believes' }, forms: ['belief'] },
  { word: 'knows',      category: LexicalCategory.VERB, semantics: { type: SemanticType.COGNITIVE, operator: 'knows'    }, forms: ['knowledge'] },
  { word: 'intends',    category: LexicalCategory.VERB, semantics: { type: SemanticType.COGNITIVE, operator: 'intends'  }, forms: ['intention', 'intend'] },
  { word: 'desires',    category: LexicalCategory.VERB, semantics: { type: SemanticType.COGNITIVE, operator: 'desires'  }, forms: ['desire', 'wants'] },
  { word: 'perceives',  category: LexicalCategory.VERB, semantics: { type: SemanticType.COGNITIVE, operator: 'perceives'}, forms: ['perceive'] },
  { word: 'says',       category: LexicalCategory.VERB, semantics: { type: SemanticType.COGNITIVE, operator: 'says'     } },

  // ── Temporal operators ───────────────────────────────────────────────────
  { word: 'always',     category: LexicalCategory.ADVERB, semantics: { type: SemanticType.TEMPORAL, operator: 'always'     }, forms: ['always', 'invariably'] },
  { word: 'eventually', category: LexicalCategory.ADVERB, semantics: { type: SemanticType.TEMPORAL, operator: 'eventually' }, forms: ['someday', 'at some point'] },
  { word: 'next',       category: LexicalCategory.ADVERB, semantics: { type: SemanticType.TEMPORAL, operator: 'next'       } },
  { word: 'until',      category: LexicalCategory.PREPOSITION, semantics: { type: SemanticType.TEMPORAL, operator: 'until' } },

  // ── Quantifiers ──────────────────────────────────────────────────────────
  { word: 'all',  category: LexicalCategory.QUANTIFIER, semantics: { type: SemanticType.QUANTIFIER, operator: 'forall' }, forms: ['every', 'each', 'any'] },
  { word: 'some', category: LexicalCategory.QUANTIFIER, semantics: { type: SemanticType.QUANTIFIER, operator: 'exists' }, forms: ['there exists', 'there is'] },
];

// ---------------------------------------------------------------------------
// Grammar rules (phrase-level patterns)
// ---------------------------------------------------------------------------

const GRAMMAR_RULES: GrammarRule[] = [
  {
    name: 'deontic_obligation',
    pattern: /\b(\w+(?:\s+\w+)*)\s+(must|shall|should|is required to|is obligated to)\s+([^.!?]+)/i,
    semantics: { type: SemanticType.DEONTIC, operator: 'obligated' },
    description: '<agent> must <action>',
  },
  {
    name: 'deontic_permission',
    pattern: /\b(\w+(?:\s+\w+)*)\s+(may|can|is allowed to|is permitted to)\s+([^.!?]+)/i,
    semantics: { type: SemanticType.DEONTIC, operator: 'permitted' },
    description: '<agent> may <action>',
  },
  {
    name: 'deontic_prohibition',
    pattern: /\b(\w+(?:\s+\w+)*)\s+(must not|shall not|is forbidden to|is prohibited from)\s+([^.!?]+)/i,
    semantics: { type: SemanticType.DEONTIC, operator: 'forbidden' },
    description: '<agent> must not <action>',
  },
  {
    name: 'cognitive_believes',
    pattern: /\b(\w+(?:\s+\w+)*)\s+believes?\s+(?:that\s+)?([^.!?]+)/i,
    semantics: { type: SemanticType.COGNITIVE, operator: 'believes' },
    description: '<agent> believes <proposition>',
  },
  {
    name: 'cognitive_knows',
    pattern: /\b(\w+(?:\s+\w+)*)\s+knows?\s+(?:that\s+)?([^.!?]+)/i,
    semantics: { type: SemanticType.COGNITIVE, operator: 'knows' },
    description: '<agent> knows <proposition>',
  },
  {
    name: 'cognitive_intends',
    pattern: /\b(\w+(?:\s+\w+)*)\s+intends?\s+to\s+([^.!?]+)/i,
    semantics: { type: SemanticType.COGNITIVE, operator: 'intends' },
    description: '<agent> intends to <action>',
  },
  {
    name: 'temporal_always',
    pattern: /\balways\s+([^.!?]+)/i,
    semantics: { type: SemanticType.TEMPORAL, operator: 'always' },
    description: 'always <proposition>',
  },
  {
    name: 'temporal_eventually',
    pattern: /\beventually\s+([^.!?]+)/i,
    semantics: { type: SemanticType.TEMPORAL, operator: 'eventually' },
    description: 'eventually <proposition>',
  },
];

// ---------------------------------------------------------------------------
// DCECEnglishGrammar
// ---------------------------------------------------------------------------

/** Phrase parse result. */
export interface PhraseParseResult {
  rule: GrammarRule;
  match: string;
  groups: string[];
  span: [number, number];
}

/**
 * English grammar for DCEC with bidirectional conversion.
 *
 * TypeScript port of `DCECEnglishGrammar` from
 * `ipfs_datasets_py/logic/CEC/native/dcec_english_grammar.py`.
 */
export class DCECEnglishGrammar {
  private readonly lexicon: Map<string, LexicalEntry>;
  private readonly rules: GrammarRule[];

  constructor() {
    this.lexicon = new Map();
    this.rules = [...GRAMMAR_RULES];

    for (const entry of LEXICON) {
      this.lexicon.set(entry.word.toLowerCase(), entry);
      for (const form of entry.forms ?? []) {
        if (!this.lexicon.has(form.toLowerCase())) {
          this.lexicon.set(form.toLowerCase(), entry);
        }
      }
    }
  }

  /** Look up a word in the lexicon. */
  lookupWord(word: string): LexicalEntry | null {
    return this.lexicon.get(word.toLowerCase()) ?? null;
  }

  /** Find all grammar-rule matches in `text`. */
  parsePhrase(text: string): PhraseParseResult[] {
    const results: PhraseParseResult[] = [];
    for (const rule of this.rules) {
      const rx = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
      let m: RegExpExecArray | null;
      while ((m = rx.exec(text)) !== null) {
        results.push({
          rule,
          match: m[0],
          groups: m.slice(1).map(g => g?.trim() ?? ''),
          span: [m.index, m.index + m[0].length],
        });
      }
    }
    results.sort((a, b) => a.span[0] - b.span[0]);
    return results;
  }

  /**
   * Generate an English paraphrase for a DCEC operator + proposition.
   *
   * @param operator - DCEC operator (e.g. 'obligated', 'knows').
   * @param agent    - Agent string (e.g. 'Alice').
   * @param prop     - Proposition string (e.g. 'pay taxes').
   */
  getEnglishForFormula(operator: string, agent: string, prop: string): string {
    const templates: Record<string, string> = {
      obligated:  `${agent} must ${prop}`,
      permitted:  `${agent} may ${prop}`,
      forbidden:  `${agent} must not ${prop}`,
      believes:   `${agent} believes that ${prop}`,
      knows:      `${agent} knows that ${prop}`,
      intends:    `${agent} intends to ${prop}`,
      desires:    `${agent} desires to ${prop}`,
      perceives:  `${agent} perceives that ${prop}`,
      says:       `${agent} says that ${prop}`,
      always:     `it is always the case that ${prop}`,
      eventually: `it will eventually be the case that ${prop}`,
      next:       `next, ${prop}`,
    };
    return templates[operator.toLowerCase()] ?? `${operator}(${agent}, ${prop})`;
  }

  /**
   * Extract DCEC formulas that could produce `english` text.
   * Returns operator + agent + proposition triples.
   */
  getFormulasForEnglish(english: string): Array<{ operator: string; agent: string; proposition: string }> {
    const results: Array<{ operator: string; agent: string; proposition: string }> = [];
    for (const r of this.parsePhrase(english)) {
      const op = r.rule.semantics.operator;
      if (r.groups.length >= 2) {
        results.push({ operator: op, agent: r.groups[0], proposition: r.groups[1] });
      } else if (r.groups.length === 1) {
        results.push({ operator: op, agent: '', proposition: r.groups[0] });
      }
    }
    return results;
  }

  /** All lexical entries. */
  getLexiconEntries(): LexicalEntry[] {
    // Deduplicate by word
    const seen = new Set<string>();
    return LEXICON.filter(e => {
      if (seen.has(e.word)) return false;
      seen.add(e.word);
      return true;
    });
  }

  /** All grammar rules. */
  getGrammarRules(): GrammarRule[] {
    return this.rules;
  }
}

/** Factory function matching the Python `create_dcec_grammar()`. */
export function createDcecGrammar(): DCECEnglishGrammar {
  return new DCECEnglishGrammar();
}
