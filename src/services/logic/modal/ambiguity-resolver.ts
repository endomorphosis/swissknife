/**
 * CEC Parse Ambiguity Resolver — PORT-174
 *
 * Port of ipfs_datasets_py/logic/CEC/native/ambiguity_resolver.py.
 *
 * Ranks competing NL/DCEC parse candidates with deterministic first/high-score,
 * semantic-context, and statistical-frequency strategies.
 */

export enum DisambiguationStrategy {
  FIRST = 'first',
  HIGHEST_SCORE = 'highest_score',
  SEMANTIC = 'semantic',
  STATISTICAL = 'statistical',
}

export interface ParseScore {
  parseId: string;
  score: number;
  formula: string;
  confidence: number;
  sourceText?: string;
  metadata?: Record<string, unknown>;
}

export interface ParseResolution {
  selected: ParseScore | null;
  strategy: DisambiguationStrategy;
  candidates: ParseScore[];
  reason: string;
}

export class AmbiguityResolver {
  resolve(
    parses: ParseScore[],
    strategy: DisambiguationStrategy = DisambiguationStrategy.HIGHEST_SCORE,
    context: string[] = [],
  ): ParseScore | null {
    return this.resolveDetailed(parses, strategy, context).selected;
  }

  resolveDetailed(
    parses: ParseScore[],
    strategy: DisambiguationStrategy = DisambiguationStrategy.HIGHEST_SCORE,
    context: string[] = [],
  ): ParseResolution {
    if (parses.length === 0) {
      return { selected: null, strategy, candidates: [], reason: 'no_candidates' };
    }

    const candidates = this.rank(parses, strategy, context);
    const selected = candidates[0] ?? null;
    return {
      selected,
      strategy,
      candidates,
      reason: selected ? `selected_${strategy}` : 'no_candidates',
    };
  }

  rank(
    parses: ParseScore[],
    strategy: DisambiguationStrategy = DisambiguationStrategy.HIGHEST_SCORE,
    context: string[] = [],
  ): ParseScore[] {
    if (strategy === DisambiguationStrategy.FIRST) return [...parses];

    const scored = strategy === DisambiguationStrategy.SEMANTIC
      ? parses.map(p => ({ ...p, score: this.score(p.formula, context), confidence: p.confidence }))
      : [...parses];

    return scored.sort((a, b) => {
      const delta = combinedScore(b) - combinedScore(a);
      if (delta !== 0) return delta;
      return a.parseId.localeCompare(b.parseId);
    });
  }

  score(formula: string, context: string[] = []): number {
    const normalized = formula.toLowerCase();
    const tokens = tokenizeFormula(normalized);
    const contextTerms = context.map(c => c.toLowerCase()).filter(Boolean);
    const contextHits = contextTerms.filter(c => normalized.includes(c)).length;
    const modalBonus = /(^|\W)(O|P|F|B|K|I)\s*\(/.test(formula) ? 0.15 : 0;
    const structureBonus = Math.min(0.2, tokens.length / 50);
    const contextScore = contextTerms.length ? contextHits / contextTerms.length : 0;
    return clamp01(0.35 + modalBonus + structureBonus + contextScore * 0.3);
  }
}

export class SemanticDisambiguator extends AmbiguityResolver {
  disambiguate(parses: ParseScore[], semanticContext: string[]): ParseScore | null {
    return this.resolve(parses, DisambiguationStrategy.SEMANTIC, semanticContext);
  }
}

export class StatisticalDisambiguator extends AmbiguityResolver {
  private readonly frequencies = new Map<string, number>();

  recordUsage(formula: string): void {
    this.frequencies.set(formula, (this.frequencies.get(formula) ?? 0) + 1);
  }

  disambiguate(parses: ParseScore[]): ParseScore | null {
    const total = Math.max(1, Array.from(this.frequencies.values()).reduce((sum, n) => sum + n, 0));
    const scored = parses.map(parse => ({
      ...parse,
      score: (this.frequencies.get(parse.formula) ?? 0) / total,
    }));
    return this.resolve(scored, DisambiguationStrategy.HIGHEST_SCORE);
  }

  getFrequency(formula: string): number {
    return this.frequencies.get(formula) ?? 0;
  }

  reset(): void {
    this.frequencies.clear();
  }
}

export function makeParseScore(
  parseId: string,
  formula: string,
  confidence = 0.5,
  metadata: Record<string, unknown> = {},
): ParseScore {
  return { parseId, formula, confidence, score: confidence, metadata };
}

export function resolveAmbiguity(
  parses: ParseScore[],
  strategy: DisambiguationStrategy = DisambiguationStrategy.HIGHEST_SCORE,
  context: string[] = [],
): ParseScore | null {
  return new AmbiguityResolver().resolve(parses, strategy, context);
}

function combinedScore(parse: ParseScore): number {
  return clamp01(parse.score * 0.7 + parse.confidence * 0.3);
}

function tokenizeFormula(formula: string): string[] {
  return formula.split(/[^a-z0-9_]+/i).filter(Boolean);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
