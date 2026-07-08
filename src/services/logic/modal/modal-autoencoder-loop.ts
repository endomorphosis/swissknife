/**
 * Modal Autoencoder Loop — T-259
 *
 * Port of modal/autoencoder_loop.py (776L — key API)
 *
 * Autoencoder loop that iteratively:
 *  1. Encodes legal text → modal IR
 *  2. Decodes modal IR → text
 *  3. Validates round-trip fidelity
 *  4. Applies residual patches to fix frame-logic violations
 */

import { DeterministicModalCompiler, ModalCompilationResult } from './modal-compiler';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ModalAutoencoderLoopConfig {
  maxIterations:         number;
  convergenceThreshold:  number;
  enablePatchValidation: boolean;
  parserBackend:         string;
  residualRepairEnabled: boolean;
  targetConfidence:      number;
}

export function defaultAutoencoderConfig(): ModalAutoencoderLoopConfig {
  return {
    maxIterations:         3,
    convergenceThreshold:  0.95,
    enablePatchValidation: true,
    parserBackend:         'regex',
    residualRepairEnabled: true,
    targetConfidence:      0.85,
  };
}

// ---------------------------------------------------------------------------
// FrameLogicPatchValidation
// ---------------------------------------------------------------------------

export interface FrameLogicPatchValidation {
  isValid:  boolean;
  errors:   string[];
  warnings: string[];
  patchId:  string;
  confidence: number;
}

function validatePatch(original: string, decoded: string): FrameLogicPatchValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Simple heuristic: check key deontic keywords are preserved
  const keywords = ['must', 'shall', 'may', 'obligat', 'permit', 'forbid', 'prohibited'];
  const origLower = original.toLowerCase();
  const decLower  = decoded.toLowerCase();

  for (const kw of keywords) {
    if (origLower.includes(kw) && !decLower.includes(kw)) {
      warnings.push(`Keyword '${kw}' lost in round-trip`);
    }
  }

  const overallSim = jaccard(origLower.split(/\s+/), decLower.split(/\s+/));
  if (overallSim < 0.3) errors.push(`Low round-trip similarity: ${overallSim.toFixed(2)}`);

  return {
    isValid:    errors.length === 0,
    errors,
    warnings,
    patchId:    `patch-${Date.now().toString(16)}`,
    confidence: overallSim,
  };
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter(x => sb.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? inter / union : 0;
}

// ---------------------------------------------------------------------------
// ModalAutoencoderLoopResult
// ---------------------------------------------------------------------------

export interface ModalAutoencoderLoopResult {
  /** Final compilation result (post all iterations). */
  compilationResult:  ModalCompilationResult;
  /** Decoded text (reconstructed from modal IR). */
  decodedText:        string;
  /** Per-iteration patch validations. */
  patchValidations:   FrameLogicPatchValidation[];
  /** Residual errors from last iteration. */
  residuals:          string[];
  /** Final confidence after all iterations. */
  confidence:         number;
  /** Number of iterations run. */
  iterations:         number;
  /** Whether convergence was reached before maxIterations. */
  converged:          boolean;
  metadata:           Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// LegalModalAutoencoderLoop
// ---------------------------------------------------------------------------

export interface AutoencoderLoopStats {
  totalRuns:        number;
  converged:        number;
  avgIterations:    number;
  avgConfidence:    number;
}

/**
 * Autoencoder loop for legal modal IR quality improvement.
 *
 * TypeScript port of `LegalModalAutoencoderLoop` from
 * `ipfs_datasets_py/logic/modal/autoencoder_loop.py`.
 */
export class LegalModalAutoencoderLoop {
  private readonly config: ModalAutoencoderLoopConfig;
  private readonly compiler: DeterministicModalCompiler;
  private readonly stats: AutoencoderLoopStats = {
    totalRuns: 0, converged: 0, avgIterations: 0, avgConfidence: 0,
  };

  constructor(config?: Partial<ModalAutoencoderLoopConfig>) {
    this.config   = { ...defaultAutoencoderConfig(), ...config };
    this.compiler = new DeterministicModalCompiler({ parserBackend: this.config.parserBackend as 'regex' });
  }

  /**
   * Run the autoencoder loop on a single text.
   */
  run(text: string, opts: { documentId?: string } = {}): ModalAutoencoderLoopResult {
    const patchValidations: FrameLogicPatchValidation[] = [];
    const residuals: string[] = [];
    let currentText = text;
    let compilationResult: ModalCompilationResult;
    let confidence = 0;
    let iteration = 0;

    for (iteration = 0; iteration < this.config.maxIterations; iteration++) {
      compilationResult = this.compiler.compile(currentText, opts);
      confidence = compilationResult.modalIr.confidence;

      // Decode: reconstruct text from modal IR (simplified — use frame + operators)
      const decoded = this._decode(compilationResult);

      // Validate round-trip
      if (this.config.enablePatchValidation) {
        const validation = validatePatch(currentText, decoded);
        patchValidations.push(validation);
        if (!validation.isValid) {
          residuals.push(...validation.errors);
        }
      }

      // Check convergence
      if (confidence >= this.config.convergenceThreshold) break;

      // Apply residual repair if enabled
      if (this.config.residualRepairEnabled && residuals.length > 0) {
        currentText = this._repairText(currentText, compilationResult);
      }
    }

    const converged = confidence >= this.config.convergenceThreshold;
    this._updateStats(converged, iteration + 1, confidence);

    return {
      compilationResult: compilationResult!,
      decodedText:       this._decode(compilationResult!),
      patchValidations,
      residuals,
      confidence,
      iterations:        iteration + 1,
      converged,
      metadata: { originalText: text, documentId: opts.documentId },
    };
  }

  /** Run loop on multiple texts. */
  runBatch(texts: string[]): ModalAutoencoderLoopResult[] {
    return texts.map(t => this.run(t));
  }

  getStats(): Readonly<AutoencoderLoopStats> { return { ...this.stats }; }

  // -------------------------------------------------------------------------

  private _decode(result: ModalCompilationResult): string {
    const { modalFamily, operators, slots } = result.modalIr;
    const parts: string[] = [];
    if (slots['agent'])  parts.push(slots['agent']);
    if (modalFamily === 'deontic') {
      const modals = operators.filter(op => ['obligation', 'permission', 'prohibition'].includes(op));
      if (modals.includes('obligation'))   parts.push('must');
      else if (modals.includes('permission'))  parts.push('may');
      else if (modals.includes('prohibition')) parts.push('must not');
    } else if (modalFamily === 'temporal') {
      if (operators.includes('temporal')) parts.push('always');
    }
    if (slots['action']) parts.push(slots['action']);
    return parts.join(' ') || result.normalizedText;
  }

  private _repairText(text: string, result: ModalCompilationResult): string {
    // Minimal repair: add modal keyword hint if missing
    if (result.selectedFrame === 'deontic' && !text.toLowerCase().includes('must') && !text.toLowerCase().includes('shall')) {
      return text + ' (normative)';
    }
    return text;
  }

  private _updateStats(converged: boolean, iterations: number, confidence: number): void {
    this.stats.totalRuns++;
    if (converged) this.stats.converged++;
    const n = this.stats.totalRuns;
    this.stats.avgIterations  = ((n - 1) * this.stats.avgIterations  + iterations)  / n;
    this.stats.avgConfidence  = ((n - 1) * this.stats.avgConfidence  + confidence)  / n;
  }
}
