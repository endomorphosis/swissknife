/**
 * LogicPublicApi — top-level public API facade for the swissknife logic stack.
 *
 * Mirrors ipfs_datasets_py/logic/api.py (723 lines) — the stable canonical
 * import surface for external consumers of the logic layer.
 *
 * Provides a single entry point that composes all 19 sprint modules:
 *   - NL → FOL (Sprint 14)
 *   - NL → Deontic statements + conflicts (Sprint 12)
 *   - NL → LegalNormIR + decoded text (Sprint 17)
 *   - NL → Prover syntax (Sprint 18)
 *   - NL → DeonticGraph (Sprint 16)
 *   - Monitoring, Registry, Batch (Sprint 19)
 *
 * Sprint 20, T-106.
 * Reference: ipfs_datasets_py/logic/api.py §LogicPublicApi
 */

import { FolTextConverter } from '../fol/fol-text-converter.js';
import type { FolConversionResult } from '../fol/fol-text-converter.js';
import { DeonticTextAnalyzer } from '../deontic/deontic-text-analyzer.js';
import type { DeonticStatement, DeonticConflict } from '../deontic/deontic-text-analyzer.js';
import { LegalNormBuilder } from '../deontic/legal-norm-builder.js';
import type { LegalNormIR } from '../deontic/legal-norm-ir.js';
import { decodeLegalNormIR } from '../deontic/legal-norm-decoder.js';
import type { DecodedLegalText } from '../deontic/legal-norm-decoder.js';
import { ProverSyntaxBuilder } from '../deontic/prover-syntax-builder.js';
import type { ProverSyntaxReport } from '../deontic/prover-syntax-builder.js';
import { DeonticGraphBuilder } from '../deontic/deontic-graph-builder.js';
import type { DeonticGraph } from '../deontic/deontic-graph.js';
import { LogicMonitor } from '../shared/logic-monitor.js';
import { getSubmoduleSpecs, getIntegrationManifest } from '../../platform/submodule-registry.js';
import type { LogicSubmoduleSpec } from '../../platform/submodule-registry.js';
import { BatchProcessor } from './batch-processor.js';
import type { BatchResult } from './batch-processor.js';
import { detectMultilingualConflicts } from '../deontic/i18n-conflict-report.js';
import type { I18NConflictReport } from '../deontic/i18n-conflict-report.js';

// ---------------------------------------------------------------------------
// Analysis result types
// ---------------------------------------------------------------------------

/** Full analysis of a text through the NL→logic pipeline. */
export interface TextAnalysisResult {
  /** Input text. */
  readonly text:       string;
  /** FOL formula and metadata. */
  readonly fol:        FolConversionResult;
  /** Extracted deontic statements. */
  readonly statements: DeonticStatement[];
  /** Detected deontic conflicts. */
  readonly conflicts:  DeonticConflict[];
  /** LegalNormIR objects (one per statement). */
  readonly norms:      LegalNormIR[];
  /** Decoded legal text objects. */
  readonly decoded:    DecodedLegalText[];
  /** Prover syntax reports (one per norm). */
  readonly syntax:     ProverSyntaxReport[];
  /** Deontic graph built from statements. */
  readonly graph:      DeonticGraph;
}

// ---------------------------------------------------------------------------
// LogicPublicApi
// ---------------------------------------------------------------------------

/**
 * LogicPublicApi — the stable public facade for the swissknife logic stack.
 *
 * Usage:
 * ```ts
 * const api = new LogicPublicApi();
 * const analysis = await api.analyzeText('Users must log access.');
 * console.log(analysis.fol.formula);         // ∀x (User(x) → LogAccess(x))
 * console.log(analysis.statements.length);   // 1
 * console.log(analysis.syntax[0]?.records.find(r => r.target_id === 'dcec')?.formula);
 * ```
 */
export class LogicPublicApi {
  private readonly _folConverter    = new FolTextConverter();
  private readonly _deonticAnalyzer = new DeonticTextAnalyzer();
  readonly monitor:          LogicMonitor;
  readonly batchProcessor:   typeof BatchProcessor;

  constructor(opts: { monitor?: LogicMonitor } = {}) {
    this.monitor       = opts.monitor ?? LogicMonitor.getInstance();
    this.batchProcessor = BatchProcessor;
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Convert natural-language text to a list of `LegalNormIR` objects.
   *
   * Python ref: `_api_compile_nl_to_policy(text)`.
   */
  async compileNlToPolicy(text: string): Promise<LegalNormIR[]> {
    return this.monitor.trackOperation('compile_nl_to_policy', async () => {
      const statements = this._deonticAnalyzer.extractStatements(text);
      return LegalNormBuilder.fromStatements(statements);
    });
  }

  /**
   * Evaluate natural-language text through the full NL→policy→prover-syntax pipeline.
   *
   * Python ref: `_api_evaluate_nl_policy(text, tool, actor)`.
   */
  async evaluateNlPolicy(text: string): Promise<ProverSyntaxReport[]> {
    return this.monitor.trackOperation('evaluate_nl_policy', async () => {
      const norms = await this.compileNlToPolicy(text);
      return ProverSyntaxBuilder.buildBatch(norms);
    });
  }

  /**
   * Run the full NL→logic analysis pipeline in one call.
   *
   * Returns FOL formula, deontic statements, conflicts, LegalNormIRs,
   * decoded texts, prover syntax reports, and the deontic graph.
   */
  async analyzeText(text: string): Promise<TextAnalysisResult> {
    return this.monitor.trackOperation('analyze_text', async () => {
      const fol        = this._folConverter.convert(text);
      const statements = this._deonticAnalyzer.extractStatements(text);
      const conflicts  = this._deonticAnalyzer.detectConflicts(statements);
      const norms      = LegalNormBuilder.fromStatements(statements);
      const decoded    = norms.map(n => decodeLegalNormIR(n));
      const syntax     = ProverSyntaxBuilder.buildBatch(norms);
      const graph      = DeonticGraphBuilder.fromStatements(statements, conflicts);
      return { text, fol, statements, conflicts, norms, decoded, syntax, graph };
    });
  }

  /**
   * Detect normative conflicts across multiple language variants.
   *
   * @param texts Map from ISO-639-1 language code to legal text.
   */
  async detectMultilingualConflicts(texts: Map<string, string>): Promise<I18NConflictReport> {
    return this.monitor.trackOperation('detect_multilingual_conflicts', async () => {
      return detectMultilingualConflicts(texts, this._deonticAnalyzer);
    });
  }

  // ---------------------------------------------------------------------------
  // Registry / metadata
  // ---------------------------------------------------------------------------

  /** Return all registered logic submodule specs. */
  getSubmoduleSpecs(): LogicSubmoduleSpec[] {
    return getSubmoduleSpecs();
  }

  /** Return the machine-readable integration manifest. */
  getIntegrationManifest(): Record<string, unknown> {
    return getIntegrationManifest();
  }

  // ---------------------------------------------------------------------------
  // Batch helpers
  // ---------------------------------------------------------------------------

  /**
   * Analyse a batch of texts concurrently.
   */
  async analyzeTexts(
    texts: string[],
    opts: { concurrency?: number } = {},
  ): Promise<BatchResult<TextAnalysisResult>> {
    return BatchProcessor.process(
      texts,
      text => this.analyzeText(text),
      { concurrency: opts.concurrency ?? 4 },
    );
  }
}
