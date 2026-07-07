/**
 * TDFOL NL Pattern Matcher — T-209 (Sprint 47)
 *
 * Port of ipfs_datasets_py/logic/TDFOL/nl/tdfol_nl_patterns.py
 *
 * Regex-based pattern matching for legal and deontic natural language.
 * The Python original relies on spaCy for token-pattern matching; this
 * TypeScript port uses regex-only patterns (the `textPattern` field) and
 * heuristic token scanning to remain dependency-free.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Semantic categories for NL → TDFOL conversion patterns. */
export enum PatternType {
  UNIVERSAL_QUANTIFICATION = 'universal_quantification',
  OBLIGATION               = 'obligation',
  PERMISSION               = 'permission',
  PROHIBITION              = 'prohibition',
  TEMPORAL                 = 'temporal',
  CONDITIONAL              = 'conditional',
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/** A pattern for matching a natural language construct. */
export interface Pattern {
  name: string;
  type: PatternType;
  /** JavaScript `RegExp` source string (optional for token-only patterns). */
  textPattern?: string;
  description: string;
  examples: string[];
  metadata?: Record<string, unknown>;
}

/** Result of matching a pattern against a text span. */
export interface PatternMatch {
  pattern: Pattern;
  /** Character [start, end) in the input string. */
  span: [number, number];
  /** The matched substring. */
  text: string;
  /** Extracted entities (agent, action, …). */
  entities: Record<string, string>;
  /** Confidence in [0, 1]. */
  confidence: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Built-in pattern catalogue
// ---------------------------------------------------------------------------

const BUILTIN_PATTERNS: Pattern[] = [
  // ── Universal quantification ──────────────────────────────────────────────
  {
    name: 'all_agents_must',
    type: PatternType.UNIVERSAL_QUANTIFICATION,
    textPattern: String.raw`\b(all|every|any|each)\s+(\w+(?:\s+\w+)?)\s+(must|shall|should|may|are required to)\s+(\w+)`,
    description: 'All/Every/Any <agent> must/shall <action>',
    examples: ['All contractors must pay taxes', 'Every employee shall comply'],
  },
  {
    name: 'agents_plural_must',
    type: PatternType.UNIVERSAL_QUANTIFICATION,
    textPattern: String.raw`\b(\w+s)\s+(must|shall|should|are required to)\s+(\w+)`,
    description: '<agents-plural> must/shall <action>',
    examples: ['Contractors must pay', 'Employees shall comply'],
  },
  {
    name: 'for_all_agents',
    type: PatternType.UNIVERSAL_QUANTIFICATION,
    textPattern: String.raw`\bfor\s+all\s+(\w+(?:\s+\w+)?)`,
    description: 'For all <agents>',
    examples: ['For all contractors', 'For all employees'],
  },
  // ── Obligation ────────────────────────────────────────────────────────────
  {
    name: 'agent_must_action',
    type: PatternType.OBLIGATION,
    textPattern: String.raw`\b(\w+)\s+must\s+(\w+(?:\s+\w+)?)`,
    description: '<agent> must <action>',
    examples: ['Contractor must pay', 'Employee must attend'],
  },
  {
    name: 'agent_shall_action',
    type: PatternType.OBLIGATION,
    textPattern: String.raw`\b(\w+)\s+shall\s+(\w+(?:\s+\w+)?)`,
    description: '<agent> shall <action>',
    examples: ['Parties shall comply', 'Vendor shall deliver'],
  },
  {
    name: 'agent_required_to',
    type: PatternType.OBLIGATION,
    textPattern: String.raw`\b(\w+)\s+(?:is\s+)?required\s+to\s+(\w+(?:\s+\w+)?)`,
    description: '<agent> is required to <action>',
    examples: ['Contractor is required to register', 'Employee required to attend'],
  },
  {
    name: 'obligation_to_action',
    type: PatternType.OBLIGATION,
    textPattern: String.raw`\bobligation\s+to\s+(\w+(?:\s+\w+)?)`,
    description: 'obligation to <action>',
    examples: ['obligation to pay', 'obligation to report'],
  },
  // ── Permission ────────────────────────────────────────────────────────────
  {
    name: 'agent_may_action',
    type: PatternType.PERMISSION,
    textPattern: String.raw`\b(\w+)\s+may\s+(\w+(?:\s+\w+)?)`,
    description: '<agent> may <action>',
    examples: ['Contractor may subcontract', 'Employee may request leave'],
  },
  {
    name: 'agent_can_action',
    type: PatternType.PERMISSION,
    textPattern: String.raw`\b(\w+)\s+can\s+(\w+(?:\s+\w+)?)`,
    description: '<agent> can <action>',
    examples: ['Vendor can cancel order'],
  },
  {
    name: 'permitted_to_action',
    type: PatternType.PERMISSION,
    textPattern: String.raw`\b(?:is\s+)?permitted\s+to\s+(\w+(?:\s+\w+)?)`,
    description: '(is) permitted to <action>',
    examples: ['is permitted to access', 'permitted to use'],
  },
  {
    name: 'allowed_to_action',
    type: PatternType.PERMISSION,
    textPattern: String.raw`\b(?:is\s+)?allowed\s+to\s+(\w+(?:\s+\w+)?)`,
    description: '(is) allowed to <action>',
    examples: ['allowed to proceed', 'is allowed to terminate'],
  },
  // ── Prohibition ───────────────────────────────────────────────────────────
  {
    name: 'agent_must_not',
    type: PatternType.PROHIBITION,
    textPattern: String.raw`\b(\w+)\s+must\s+not\s+(\w+(?:\s+\w+)?)`,
    description: '<agent> must not <action>',
    examples: ['Contractor must not subcontract', 'Employee must not disclose'],
  },
  {
    name: 'agent_shall_not',
    type: PatternType.PROHIBITION,
    textPattern: String.raw`\b(\w+)\s+shall\s+not\s+(\w+(?:\s+\w+)?)`,
    description: '<agent> shall not <action>',
    examples: ['Vendor shall not transfer', 'Party shall not disclose'],
  },
  {
    name: 'forbidden_to_action',
    type: PatternType.PROHIBITION,
    textPattern: String.raw`\b(?:is\s+)?forbidden\s+to\s+(\w+(?:\s+\w+)?)`,
    description: '(is) forbidden to <action>',
    examples: ['is forbidden to access', 'forbidden to disclose'],
  },
  {
    name: 'prohibited_from_action',
    type: PatternType.PROHIBITION,
    textPattern: String.raw`\bprohibited\s+from\s+(\w+(?:\s+\w+)?)`,
    description: 'prohibited from <action>',
    examples: ['prohibited from sharing', 'prohibited from using'],
  },
  // ── Temporal ──────────────────────────────────────────────────────────────
  {
    name: 'always_eventually',
    type: PatternType.TEMPORAL,
    textPattern: String.raw`\b(always|eventually|until|after|before|while)\s+(\w+(?:\s+\w+)?)`,
    description: '<temporal-op> <clause>',
    examples: ['always compliant', 'eventually paid', 'until termination'],
  },
  {
    name: 'within_timeframe',
    type: PatternType.TEMPORAL,
    textPattern: String.raw`\bwithin\s+(\d+\s+(?:days?|hours?|weeks?|months?|years?))`,
    description: 'within <timeframe>',
    examples: ['within 30 days', 'within 3 months'],
  },
  {
    name: 'by_date',
    type: PatternType.TEMPORAL,
    textPattern: String.raw`\bby\s+(\d{4}[-/]\d{2}[-/]\d{2}|\w+\s+\d{1,2}\s*,?\s*\d{4})`,
    description: 'by <date>',
    examples: ['by 2025-12-31', 'by December 31, 2025'],
  },
  // ── Conditional ───────────────────────────────────────────────────────────
  {
    name: 'if_then',
    type: PatternType.CONDITIONAL,
    textPattern: String.raw`\bif\s+(.+?)\s*,?\s*then\s+(.+)`,
    description: 'if <condition>, then <consequence>',
    examples: ['if contractor fails, then penalty applies'],
  },
  {
    name: 'when_clause',
    type: PatternType.CONDITIONAL,
    textPattern: String.raw`\bwhen\s+(.+?)\s*,\s*(.+)`,
    description: 'when <condition>, <consequence>',
    examples: ['when payment is due, contractor must pay'],
  },
  {
    name: 'provided_that',
    type: PatternType.CONDITIONAL,
    textPattern: String.raw`\bprovided\s+that\s+(.+)`,
    description: 'provided that <condition>',
    examples: ['provided that consent is given'],
  },
];

// ---------------------------------------------------------------------------
// PatternMatcher
// ---------------------------------------------------------------------------

/**
 * Regex-based pattern matcher for TDFOL NL processing.
 *
 * TypeScript port of `PatternMatcher` from
 * `ipfs_datasets_py/logic/TDFOL/nl/tdfol_nl_patterns.py`.
 *
 * The Python original also supports spaCy token patterns; this port
 * is regex-only (no external NLP dependency required).
 */
export class PatternMatcher {
  private readonly patterns: Pattern[];
  private readonly compiledRegex: Map<string, RegExp>;

  constructor(extraPatterns: Pattern[] = []) {
    this.patterns = [...BUILTIN_PATTERNS, ...extraPatterns];
    this.compiledRegex = new Map();
    for (const p of this.patterns) {
      if (p.textPattern) {
        this.compiledRegex.set(p.name, new RegExp(p.textPattern, 'gi'));
      }
    }
  }

  /** Match all patterns against `text`. Returns matches ordered by span start. */
  match(text: string): PatternMatch[] {
    const matches: PatternMatch[] = [];
    for (const pattern of this.patterns) {
      const rx = this.compiledRegex.get(pattern.name);
      if (!rx) continue;
      // Reset lastIndex for global flag
      rx.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        const entities = this._extractEntities(pattern, m);
        matches.push({
          pattern,
          span: [start, end],
          text: m[0],
          entities,
          confidence: this._confidence(pattern, m),
        });
      }
    }
    matches.sort((a, b) => a.span[0] - b.span[0]);
    return matches;
  }

  /** Run `match()` over an array of texts. */
  matchAll(texts: string[]): PatternMatch[][] {
    return texts.map(t => this.match(t));
  }

  /** All registered patterns (built-in + any extras). */
  getPatterns(): ReadonlyArray<Pattern> {
    return this.patterns;
  }

  /** Retrieve patterns by type. */
  getPatternsByType(type: PatternType): Pattern[] {
    return this.patterns.filter(p => p.type === type);
  }

  /** Register an additional pattern at runtime. */
  addPattern(pattern: Pattern): void {
    this.patterns.push(pattern);
    if (pattern.textPattern) {
      this.compiledRegex.set(pattern.name, new RegExp(pattern.textPattern, 'gi'));
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _extractEntities(pattern: Pattern, m: RegExpExecArray): Record<string, string> {
    const entities: Record<string, string> = {};
    switch (pattern.type) {
      case PatternType.UNIVERSAL_QUANTIFICATION:
        if (m[1]) entities['quantifier'] = m[1];
        if (m[2]) entities['agent']      = m[2];
        if (m[3]) entities['modal']      = m[3];
        if (m[4]) entities['action']     = m[4];
        break;
      case PatternType.OBLIGATION:
      case PatternType.PROHIBITION:
      case PatternType.PERMISSION:
        if (m[1]) entities['agent']  = m[1];
        if (m[2]) entities['action'] = m[2];
        break;
      case PatternType.TEMPORAL:
        if (m[1]) entities['temporal_op'] = m[1];
        if (m[2]) entities['clause']      = m[2];
        break;
      case PatternType.CONDITIONAL:
        if (m[1]) entities['condition']   = m[1];
        if (m[2]) entities['consequence'] = m[2];
        break;
    }
    return entities;
  }

  private _confidence(pattern: Pattern, m: RegExpExecArray): number {
    // Base confidence: higher when more capture groups matched
    const groupsMatched = m.slice(1).filter(g => g != null).length;
    const base = 0.5 + groupsMatched * 0.1;
    // Boost for exact deontic keywords
    const text = m[0].toLowerCase();
    const exactKeywords = ['must', 'shall', 'may', 'prohibited', 'forbidden', 'permitted', 'obligation'];
    const keywordBoost = exactKeywords.some(kw => text.includes(kw)) ? 0.1 : 0;
    return Math.min(1.0, base + keywordBoost);
  }
}
