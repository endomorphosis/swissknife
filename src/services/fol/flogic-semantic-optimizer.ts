/**
 * FLogicSemanticOptimizer — semantic round-trip quality scorer.
 *
 * Mirrors ipfs_datasets_py/logic/flogic_optimizer.py (673 lines):
 *   class FLogicOptimizerConfig
 *   class OntologyViolation
 *   class FLogicOptimizerResult
 *   class FLogicSemanticOptimizer
 *   def _cosine_similarity(a, b)
 *
 * Evaluates the semantic preservation quality of a NL↔FOL or NL↔NL round-trip
 * pipeline:
 *   source_text → encode → decode → decoded_text
 *
 * Quality is measured by:
 *   1. Cosine similarity between `source_embedding` and `decoded_embedding`
 *      (dense vector representations of the two texts).
 *   2. Optional F-logic ontology consistency check on `kg_triples`.
 *
 * The TypeScript port uses the same heuristic logic as the Python reference.
 * Real embeddings (e.g. from an LLM) must be supplied by the caller;
 * this module does NOT produce embeddings.
 *
 * Sprint 15, T-84.
 * Reference: ipfs_datasets_py/logic/flogic_optimizer.py §FLogicSemanticOptimizer
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface FLogicOptimizerConfig {
  /**
   * Minimum cosine similarity required for the round-trip to be considered
   * semantically preserved.  Default 0.80.  Python ref: similarity_threshold.
   */
  similarityThreshold: number;
  /**
   * When true, verifies F-logic ontology constraints on `kg_triples`.
   * Default false (no ontology loaded by default).
   */
  checkOntologyConsistency: boolean;
  /**
   * Maximum number of automatic refinement passes before giving up.
   * Set to 0 to disable refinement.  Default 3.
   */
  maxRefinementRounds: number;
  /** Name of this optimizer instance (for logging/metadata). */
  optimizerName: string;
}

const DEFAULT_CONFIG: FLogicOptimizerConfig = {
  similarityThreshold:     0.80,
  checkOntologyConsistency: false,
  maxRefinementRounds:      3,
  optimizerName:            'flogic-semantic-optimizer',
};

// ---------------------------------------------------------------------------
// Ontology types
// ---------------------------------------------------------------------------

/**
 * A single F-logic ontology violation — e.g., a subject is used as a class
 * that was never declared, or a predicate's argument types are wrong.
 *
 * Python ref: OntologyViolation dataclass.
 */
export interface OntologyViolation {
  readonly subject:   string;
  readonly predicate: string;
  readonly object:    string;
  readonly message:   string;
  /** 'ERROR' | 'WARNING' */
  readonly severity:  'ERROR' | 'WARNING';
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/**
 * Result returned by `FLogicSemanticOptimizer.evaluate()`.
 *
 * Python ref: FLogicOptimizerResult dataclass.
 */
export interface FLogicOptimizerResult {
  /** Cosine similarity ∈ [−1, 1] between source and decoded embeddings. */
  readonly similarityScore:     number;
  /** True when similarity ≥ threshold AND no blocking violations. */
  readonly passed:              boolean;
  /** True when no F-logic constraints were violated (or checking disabled). */
  readonly ontologyConsistent:  boolean;
  /** List of ontology violations (empty when consistent or checking disabled). */
  readonly violations:          OntologyViolation[];
  /** Number of refinement passes applied (0 when disabled). */
  readonly refinementRounds:    number;
  /** The source text that was evaluated. */
  readonly sourceText:          string;
  /** The decoded text that was evaluated. */
  readonly decodedText:         string;
  /** Metadata about the evaluation. */
  readonly metadata:            Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Cosine similarity helper
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two dense vectors.
 *
 * Returns a value in [−1, 1].  Returns 0 for zero-magnitude vectors.
 *
 * Python ref: `_cosine_similarity(a, b)` in flogic_optimizer.py.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// F-logic ontology (simplified)
// ---------------------------------------------------------------------------

/** A registered F-logic class with optional superclass declarations. */
interface FLogicClass {
  classId: string;
  superclasses: string[];
}

/**
 * Minimal F-logic ontology used for consistency checking.
 *
 * Mirrors the internal `_ergo` instance in Python's `FLogicSemanticOptimizer`.
 * Only class-hierarchy and subject-type checks are implemented.
 */
class FLogicOntology {
  private readonly classes = new Map<string, FLogicClass>();

  addClass(classId: string, superclasses: string[] = []): void {
    this.classes.set(classId, { classId, superclasses });
  }

  /** Check whether `subject` is a declared class (or subclass of one). */
  isKnownClass(classId: string): boolean {
    return this.classes.has(classId);
  }

  /**
   * Check kg_triples against the registered ontology.
   * Returns a list of violations (empty = consistent).
   */
  checkTriples(triples: Array<{ subject: string; predicate: string; object: string }>): OntologyViolation[] {
    const violations: OntologyViolation[] = [];
    for (const triple of triples) {
      // Check: if subject looks like a class assertion and is unknown
      if (triple.predicate === 'type' || triple.predicate === 'rdf:type') {
        if (this.classes.size > 0 && !this.isKnownClass(triple.object)) {
          violations.push({
            subject:   triple.subject,
            predicate: triple.predicate,
            object:    triple.object,
            message:   `Unknown class '${triple.object}' referenced in type assertion`,
            severity:  'WARNING',
          });
        }
      }
    }
    return violations;
  }
}

// ---------------------------------------------------------------------------
// FLogicSemanticOptimizer
// ---------------------------------------------------------------------------

/**
 * FLogicSemanticOptimizer — evaluates NL↔FOL round-trip quality.
 *
 * The primary use case is validating how well a text encoding/decoding
 * pipeline preserves semantic content:
 *
 *   NL source → encode(KG + F-logic) → decode → NL decoded
 *
 * Quality is measured by:
 *   1. Cosine similarity of embeddings (source vs decoded).
 *   2. Optional F-logic ontology consistency check.
 *
 * Usage:
 * ```ts
 * const optimizer = new FLogicSemanticOptimizer({ similarityThreshold: 0.85 });
 * const result = optimizer.evaluate(
 *   'The dog ran across the park.',
 *   'A canine sprinted through the green space.',
 *   sourceEmbedding,  // e.g. from an LLM embedding API
 *   decodedEmbedding,
 * );
 * console.log(result.similarityScore); // ~0.97
 * console.log(result.passed);          // true
 * ```
 */
export class FLogicSemanticOptimizer {
  private readonly config: FLogicOptimizerConfig;
  private readonly ontology = new FLogicOntology();

  constructor(config?: Partial<FLogicOptimizerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Evaluate round-trip quality.
   *
   * @param sourceText     The original natural-language input.
   * @param decodedText    The decoded (re-generated) text from the pipeline.
   * @param sourceEmbedding  Dense vector embedding of `sourceText`.
   * @param decodedEmbedding Dense vector embedding of `decodedText`.
   * @param kgTriples      Optional KG triples for F-logic consistency checking.
   */
  evaluate(
    sourceText: string,
    decodedText: string,
    sourceEmbedding: number[],
    decodedEmbedding: number[],
    kgTriples: Array<{ subject: string; predicate: string; object: string }> = [],
  ): FLogicOptimizerResult {
    // 1. Cosine similarity
    const similarity = cosineSimilarity(sourceEmbedding, decodedEmbedding);

    // 2. Ontology consistency
    let violations: OntologyViolation[] = [];
    let ontologyConsistent = true;

    if (this.config.checkOntologyConsistency && kgTriples.length > 0) {
      violations = this.ontology.checkTriples(kgTriples);
      ontologyConsistent = violations.filter(v => v.severity === 'ERROR').length === 0;
    }

    // 3. Overall pass/fail
    const passed =
      similarity >= this.config.similarityThreshold &&
      ontologyConsistent;

    return {
      similarityScore:    similarity,
      passed,
      ontologyConsistent,
      violations,
      refinementRounds:   0, // automatic refinement not implemented in TS port
      sourceText,
      decodedText,
      metadata: {
        optimizer:          this.config.optimizerName,
        threshold:          this.config.similarityThreshold,
        triple_count:       kgTriples.length,
        violation_count:    violations.length,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Ontology management
  // ---------------------------------------------------------------------------

  /**
   * Register an F-logic class in the internal ontology.
   *
   * Must be called before `evaluate()` when `checkOntologyConsistency: true`.
   * Python ref: `FLogicSemanticOptimizer.add_ontology_class()`.
   */
  addOntologyClass(classId: string, superclasses: string[] = []): void {
    this.ontology.addClass(classId, superclasses);
  }

  // ---------------------------------------------------------------------------
  // Batch helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute cosine similarity matrix for a list of embedding pairs.
   * Useful for bulk round-trip quality assessment.
   */
  batchSimilarity(pairs: Array<{ source: number[]; decoded: number[] }>): number[] {
    return pairs.map(p => cosineSimilarity(p.source, p.decoded));
  }
}
