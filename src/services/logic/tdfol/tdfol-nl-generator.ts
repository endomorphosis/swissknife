/**
 * TDFOL NL Formula Generator — T-244 (Sprint 54)
 *
 * Port of ipfs_datasets_py/logic/TDFOL/nl/tdfol_nl_generator.py
 *
 * Converts pattern matches (from PatternMatcher) into TDFOL formula strings.
 * The Python original uses typed Formula objects from TDFOL core; this
 * TypeScript port generates equivalent string representations.
 */

import { PatternMatch, PatternType } from './tdfol-nl-patterns';
import { PatternMatcher } from './tdfol-nl-patterns';

// ---------------------------------------------------------------------------
// GeneratedFormula
// ---------------------------------------------------------------------------

/**
 * Result of generating a TDFOL formula from a pattern match.
 *
 * TypeScript port of `GeneratedFormula` from
 * `ipfs_datasets_py/logic/TDFOL/nl/tdfol_nl_generator.py`.
 */
export interface GeneratedFormula {
  /** TDFOL formula string. */
  formulaString: string;
  /** The pattern match that produced this formula. */
  patternMatch: PatternMatch | null;
  /** Confidence score in [0, 1]. */
  confidence: number;
  /** Extracted entities (agent, action, …). */
  entities: Record<string, string>;
  /** Alternative formula interpretations. */
  alternatives: string[];
  /** Additional metadata. */
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Generation templates
// ---------------------------------------------------------------------------

/**
 * Build a TDFOL formula string from a pattern match.
 * Returns `null` if the pattern type is not directly translatable.
 */
function buildFormulaString(match: PatternMatch): string | null {
  const { type } = match.pattern;
  const agent  = match.entities['agent']?.trim();
  const action = match.entities['action']?.trim();
  const subject = match.entities['subject']?.trim();

  switch (type) {
    case PatternType.OBLIGATION: {
      if (agent && action) {
        // ∀x.(Agent(x) → O(action(x)))
        return `∀x.(${capitalise(agent)}(x) → O(${camelCase(action)}(x)))`;
      }
      return `O(${action ?? 'act'})`;
    }
    case PatternType.PERMISSION: {
      if (agent && action) {
        return `∀x.(${capitalise(agent)}(x) → P(${camelCase(action)}(x)))`;
      }
      return `P(${action ?? 'act'})`;
    }
    case PatternType.PROHIBITION: {
      if (agent && action) {
        return `∀x.(${capitalise(agent)}(x) → F(${camelCase(action)}(x)))`;
      }
      return `F(${action ?? 'act'})`;
    }
    case PatternType.UNIVERSAL_QUANTIFICATION: {
      const quantifier = match.entities['quantifier']?.toLowerCase() ?? 'all';
      const agentE = agent ?? subject ?? 'entity';
      const actionE = action ?? 'act';
      if (quantifier === 'some' || quantifier === 'exists') {
        return `∃x.(${capitalise(agentE)}(x) ∧ ${camelCase(actionE)}(x))`;
      }
      return `∀x.(${capitalise(agentE)}(x) → ${camelCase(actionE)}(x))`;
    }
    case PatternType.TEMPORAL: {
      const op   = match.entities['temporal_op']?.toLowerCase() ?? '';
      const prop = match.entities['clause'] ?? match.text;
      if (op.includes('always') || op === 'g') return `□${camelCase(prop)}`;
      if (op.includes('eventually') || op === 'f') return `◊${camelCase(prop)}`;
      return `□${camelCase(prop)}`;
    }
    case PatternType.CONDITIONAL: {
      const cond = match.entities['condition']?.trim() ?? 'P';
      const cons = match.entities['consequence']?.trim() ?? 'Q';
      return `(${camelCase(cond)} → ${camelCase(cons)})`;
    }
    default:
      return null;
  }
}

function capitalise(s: string): string {
  if (!s) return s;
  const w = s.trim().split(/\s+/);
  return w.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

function camelCase(s: string): string {
  if (!s) return s;
  const words = s.trim().split(/[\s_]+/);
  return words[0].toLowerCase() + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

// ---------------------------------------------------------------------------
// FormulaGenerator
// ---------------------------------------------------------------------------

export interface GeneratorStats {
  totalGenerated: number;
  failed: number;
}

/**
 * Generates TDFOL formula strings from pattern matches.
 *
 * TypeScript port of `FormulaGenerator` from
 * `ipfs_datasets_py/logic/TDFOL/nl/tdfol_nl_generator.py`.
 */
export class FormulaGenerator {
  private variableCounter = 0;
  private readonly stats: GeneratorStats = { totalGenerated: 0, failed: 0 };

  /**
   * Generate TDFOL formulas from a list of pattern matches.
   */
  generateFromMatches(matches: PatternMatch[]): GeneratedFormula[] {
    const formulas: GeneratedFormula[] = [];
    for (const match of matches) {
      const formulaString = buildFormulaString(match);
      if (!formulaString) { this.stats.failed++; continue; }
      this.stats.totalGenerated++;
      formulas.push({
        formulaString,
        patternMatch: match,
        confidence: match.confidence,
        entities: { ...match.entities },
        alternatives: this._buildAlternatives(match, formulaString),
        metadata: { patternName: match.pattern.name, patternType: match.pattern.type },
      });
    }
    return formulas;
  }

  /**
   * Convenience: run PatternMatcher + generation on a text string.
   */
  generateFromText(text: string): GeneratedFormula[] {
    const matcher = new PatternMatcher();
    return this.generateFromMatches(matcher.match(text));
  }

  getStats(): Readonly<GeneratorStats> { return { ...this.stats }; }

  // -------------------------------------------------------------------------

  private _buildAlternatives(match: PatternMatch, primary: string): string[] {
    const alts: string[] = [];
    // Provide a simplified version as alternative
    const action = match.entities['action'];
    if (action && !primary.includes(action)) alts.push(camelCase(action));
    return alts.filter(a => a !== primary);
  }
}
