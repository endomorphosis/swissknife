/**
 * hybrid-confidence.ts
 *
 * Hybrid confidence scoring — combines symbolic, neural, and structural signals.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/symbolic/neurosymbolic/hybrid_confidence.py
 *
 * Provides:
 *   ConfidenceSource     — SYMBOLIC | NEURAL | STRUCTURAL | HISTORICAL
 *   ConfidenceBreakdown  — per-source scores + weights + explanation
 *   HybridConfidenceScorer — score(symbolic,neural,structural)/explain()
 */

// ---------------------------------------------------------------------------
// ConfidenceSource
// ---------------------------------------------------------------------------

export enum ConfidenceSource {
  SYMBOLIC   = 'symbolic',
  NEURAL     = 'neural',
  STRUCTURAL = 'structural',
  HISTORICAL = 'historical',
}

// ---------------------------------------------------------------------------
// ConfidenceBreakdown
// ---------------------------------------------------------------------------

export class ConfidenceBreakdown {
  readonly totalConfidence: number;
  readonly symbolicConfidence: number;
  readonly neuralConfidence: number;
  readonly structuralConfidence: number;
  readonly historicalConfidence: number;
  readonly weights: Record<string, number>;
  readonly explanation: string;

  constructor(opts: {
    totalConfidence: number;
    symbolicConfidence?: number;
    neuralConfidence?: number;
    structuralConfidence?: number;
    historicalConfidence?: number;
    weights?: Record<string, number>;
    explanation?: string;
  }) {
    this.totalConfidence = Math.min(1, Math.max(0, opts.totalConfidence));
    this.symbolicConfidence = opts.symbolicConfidence ?? 0;
    this.neuralConfidence = opts.neuralConfidence ?? 0;
    this.structuralConfidence = opts.structuralConfidence ?? 0;
    this.historicalConfidence = opts.historicalConfidence ?? 0;
    this.weights = opts.weights ?? {
      [ConfidenceSource.SYMBOLIC]:   0.5,
      [ConfidenceSource.NEURAL]:     0.3,
      [ConfidenceSource.STRUCTURAL]: 0.2,
    };
    this.explanation = opts.explanation ?? '';
  }

  /** Dominant source (highest weighted contribution). */
  get dominantSource(): ConfidenceSource {
    const weighted = {
      [ConfidenceSource.SYMBOLIC]:   this.symbolicConfidence * (this.weights[ConfidenceSource.SYMBOLIC] ?? 0.5),
      [ConfidenceSource.NEURAL]:     this.neuralConfidence   * (this.weights[ConfidenceSource.NEURAL]   ?? 0.3),
      [ConfidenceSource.STRUCTURAL]: this.structuralConfidence * (this.weights[ConfidenceSource.STRUCTURAL] ?? 0.2),
      [ConfidenceSource.HISTORICAL]: this.historicalConfidence * (this.weights[ConfidenceSource.HISTORICAL] ?? 0),
    };
    return Object.entries(weighted).sort(([, a], [, b]) => b - a)[0][0] as ConfidenceSource;
  }

  toDict(): Record<string, unknown> {
    return {
      total_confidence: this.totalConfidence,
      symbolic_confidence: this.symbolicConfidence,
      neural_confidence: this.neuralConfidence,
      structural_confidence: this.structuralConfidence,
      historical_confidence: this.historicalConfidence,
      weights: this.weights,
      dominant_source: this.dominantSource,
      explanation: this.explanation,
    };
  }
}

// ---------------------------------------------------------------------------
// HybridConfidenceScorer
// ---------------------------------------------------------------------------

export interface ScoreOptions {
  weights?: Partial<Record<ConfidenceSource, number>>;
  historicalConfidence?: number;
}

export class HybridConfidenceScorer {
  private defaultWeights: Record<ConfidenceSource, number>;

  constructor(weights?: Partial<Record<ConfidenceSource, number>>) {
    this.defaultWeights = {
      [ConfidenceSource.SYMBOLIC]:   weights?.[ConfidenceSource.SYMBOLIC]   ?? 0.5,
      [ConfidenceSource.NEURAL]:     weights?.[ConfidenceSource.NEURAL]     ?? 0.3,
      [ConfidenceSource.STRUCTURAL]: weights?.[ConfidenceSource.STRUCTURAL] ?? 0.2,
      [ConfidenceSource.HISTORICAL]: weights?.[ConfidenceSource.HISTORICAL] ?? 0,
    };
  }

  /**
   * Compute a hybrid confidence score from component signals.
   */
  score(
    symbolic: number,
    neural: number,
    structural: number,
    opts: ScoreOptions = {},
  ): ConfidenceBreakdown {
    const w = {
      ...this.defaultWeights,
      ...(opts.weights ?? {}),
    };
    const historical = opts.historicalConfidence ?? 0;

    const total = Math.min(1,
      symbolic   * (w[ConfidenceSource.SYMBOLIC] ?? 0.5) +
      neural     * (w[ConfidenceSource.NEURAL]   ?? 0.3) +
      structural * (w[ConfidenceSource.STRUCTURAL] ?? 0.2) +
      historical * (w[ConfidenceSource.HISTORICAL] ?? 0)
    );

    const parts: string[] = [];
    if (symbolic > 0)   parts.push(`symbolic=${symbolic.toFixed(2)}`);
    if (neural > 0)     parts.push(`neural=${neural.toFixed(2)}`);
    if (structural > 0) parts.push(`structural=${structural.toFixed(2)}`);
    const explanation = parts.length ? `Combined: ${parts.join(', ')} → ${total.toFixed(3)}` : 'All signals zero';

    return new ConfidenceBreakdown({
      totalConfidence: total,
      symbolicConfidence: symbolic,
      neuralConfidence: neural,
      structuralConfidence: structural,
      historicalConfidence: historical,
      weights: w,
      explanation,
    });
  }

  /**
   * Score from a proof result object.
   */
  scoreFromResult(result: { proved?: boolean; confidence?: number }): ConfidenceBreakdown {
    const symbolic = result.proved ? (result.confidence ?? 0.8) : 0;
    return this.score(symbolic, 0, 0);
  }

  /**
   * Generate a human-readable explanation for a breakdown.
   */
  explain(breakdown: ConfidenceBreakdown): string {
    const lines = [
      `Total confidence: ${(breakdown.totalConfidence * 100).toFixed(1)}%`,
      `  Dominant source: ${breakdown.dominantSource}`,
    ];
    if (breakdown.symbolicConfidence > 0)   lines.push(`  Symbolic:    ${(breakdown.symbolicConfidence * 100).toFixed(1)}%`);
    if (breakdown.neuralConfidence > 0)     lines.push(`  Neural:      ${(breakdown.neuralConfidence * 100).toFixed(1)}%`);
    if (breakdown.structuralConfidence > 0) lines.push(`  Structural:  ${(breakdown.structuralConfidence * 100).toFixed(1)}%`);
    return lines.join('\n');
  }
}
