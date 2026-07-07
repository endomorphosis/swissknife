/**
 * E2EValidator — end-to-end pipeline validation for the logic/prover stack.
 *
 * Mirrors ipfs_datasets_py/logic/e2e_validation.py (691 lines):
 *   class ValidationResult
 *   class E2EValidator
 *
 * Validates the complete swissknife logic pipeline:
 *   FOL pipeline → Deontic pipeline → Proof execution →
 *   Monitor → Registry → Batch → Error handling
 *
 * Sprint 20, T-105.
 * Reference: ipfs_datasets_py/logic/e2e_validation.py §E2EValidator
 */

import { FolTextConverter } from '../fol/fol-text-converter.js';
import { DeonticTextAnalyzer } from '../deontic/deontic-text-analyzer.js';
import { LegalNormBuilder } from '../deontic/legal-norm-builder.js';
import { decodeLegalNormIR } from '../deontic/legal-norm-decoder.js';
import { ProverSyntaxBuilder } from '../deontic/prover-syntax-builder.js';
import { DeonticGraph } from '../deontic/deontic-graph.js';
import { DeonticGraphBuilder } from '../deontic/deontic-graph-builder.js';
import { LogicMonitor } from '../shared/logic-monitor.js';
import { getSubmoduleSpecs, getIntegrationManifest } from '../../platform/submodule-registry.js';
import { BatchProcessor } from './batch-processor.js';

// ---------------------------------------------------------------------------
// ValidationResult
// ---------------------------------------------------------------------------

/** Result from a single validation test. Python ref: `ValidationResult`. */
export interface ValidationResult {
  readonly test_name:  string;
  readonly passed:     boolean;
  readonly duration_ms: number;
  readonly message:    string;
  readonly details:    Record<string, unknown>;
  readonly error?:     string;
}

export function validationResultToDict(r: ValidationResult): Record<string, unknown> {
  return {
    test_name:   r.test_name,
    passed:      r.passed,
    duration_ms: r.duration_ms,
    message:     r.message,
    details:     r.details,
    error:       r.error ?? null,
  };
}

/** Aggregated summary from `E2EValidator.run()`. */
export interface ValidationSummary {
  readonly all_passed:  boolean;
  readonly passed:      number;
  readonly failed:      number;
  readonly total:       number;
  readonly duration_ms: number;
  readonly results:     ValidationResult[];
}

// ---------------------------------------------------------------------------
// E2EValidator
// ---------------------------------------------------------------------------

/**
 * E2EValidator — runs a suite of end-to-end integration tests across the
 * full swissknife logic stack.
 *
 * Python ref: `E2EValidator.run()` → dict with all_passed/passed/failed/total.
 */
export class E2EValidator {
  private readonly results: ValidationResult[] = [];

  // ---------------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------------

  async run(): Promise<ValidationSummary> {
    this.results.length = 0;
    const start = Date.now();

    await this._testFolPipeline();
    await this._testDeonticPipeline();
    await this._testProofExecution();
    await this._testMonitorIntegration();
    await this._testRegistryIntegration();
    await this._testBatchProcessing();
    await this._testErrorHandling();

    const elapsed = Date.now() - start;
    const passed  = this.results.filter(r => r.passed).length;
    const total   = this.results.length;

    return {
      all_passed:  passed === total,
      passed,
      failed:      total - passed,
      total,
      duration_ms: elapsed,
      results:     [...this.results],
    };
  }

  // ---------------------------------------------------------------------------
  // Individual test suites
  // ---------------------------------------------------------------------------

  private async _testFolPipeline(): Promise<void> {
    await this._test('fol_pipeline', async () => {
      const converter = new FolTextConverter();
      const result = converter.convert('All users must log their access.');
      if (!result.formula) throw new Error('No formula generated');
      if (result.confidence < 0) throw new Error('Invalid confidence');
      return { formula: result.formula, confidence: result.confidence };
    });
  }

  private async _testDeonticPipeline(): Promise<void> {
    await this._test('deontic_pipeline', async () => {
      const analyzer = new DeonticTextAnalyzer();
      const stmts = analyzer.extractStatements('Users must log access. Users may view records.');
      if (stmts.length === 0) throw new Error('No statements extracted');
      const conflicts = analyzer.detectConflicts(stmts);
      return { statements: stmts.length, conflicts: conflicts.length };
    });

    await this._test('deontic_legal_norm_ir', async () => {
      const analyzer = new DeonticTextAnalyzer();
      const stmts = analyzer.extractStatements('Agents must notify the controller.');
      const norms = LegalNormBuilder.fromStatements(stmts);
      if (norms.length === 0) throw new Error('No norms built');
      const decoded = decodeLegalNormIR(norms[0]);
      if (!decoded.text) throw new Error('No decoded text');
      return { norms: norms.length, decoded_text: decoded.text.slice(0, 50) };
    });
  }

  private async _testProofExecution(): Promise<void> {
    await this._test('prover_syntax_builder', async () => {
      const analyzer = new DeonticTextAnalyzer();
      const stmts = analyzer.extractStatements('Users must audit all access.');
      const norms = LegalNormBuilder.fromStatements(stmts);
      if (norms.length === 0) throw new Error('No norms');
      const reports = ProverSyntaxBuilder.buildBatch(norms);
      const r = reports[0];
      if (!r) throw new Error('No syntax report');
      return { reports: reports.length, all_valid: r.all_valid };
    });

    await this._test('deontic_graph_builder', async () => {
      const analyzer = new DeonticTextAnalyzer();
      const stmts = analyzer.extractStatements('Users must log access. Admins may delete records.');
      const conflicts = analyzer.detectConflicts(stmts);
      const graph = DeonticGraphBuilder.fromStatements(stmts, conflicts);
      const summary = graph.summary();
      return { nodes: summary['total_nodes'], rules: summary['total_rules'] };
    });
  }

  private async _testMonitorIntegration(): Promise<void> {
    await this._test('logic_monitor', async () => {
      const monitor = new LogicMonitor();
      await monitor.trackOperation('test_op', async () => 'result');
      const metrics = monitor.getMetrics();
      const health  = monitor.getHealthStatus();
      if (!metrics.operations['test_op']) throw new Error('No metrics recorded');
      if (health.status !== 'healthy') throw new Error(`Unexpected health: ${health.status}`);
      return { total_calls: metrics.total_calls, status: health.status };
    });
  }

  private async _testRegistryIntegration(): Promise<void> {
    await this._test('submodule_registry', async () => {
      const specs = getSubmoduleSpecs();
      const manifest = getIntegrationManifest();
      if (specs.length < 15) throw new Error(`Only ${specs.length} specs registered`);
      return { specs: specs.length, manifest_version: manifest['version'] };
    });
  }

  private async _testBatchProcessing(): Promise<void> {
    await this._test('batch_processor', async () => {
      const items = ['Users must log access.', 'Admins may delete records.'];
      const analyzer = new DeonticTextAnalyzer();
      const result = await BatchProcessor.process(items, async text => {
        return analyzer.extractStatements(text);
      });
      if (result.successful !== 2) throw new Error(`Expected 2 successes, got ${result.successful}`);
      return { successful: result.successful, failed: result.failed };
    });
  }

  private async _testErrorHandling(): Promise<void> {
    await this._test('error_handling_empty_input', async () => {
      const converter  = new FolTextConverter();
      const result     = converter.convert('');
      const analyzer   = new DeonticTextAnalyzer();
      const statements = analyzer.extractStatements('');
      return { formula: result.formula, statements: statements.length };
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helper
  // ---------------------------------------------------------------------------

  private async _test(name: string, fn: () => Promise<Record<string, unknown>>): Promise<void> {
    const start = Date.now();
    try {
      const details = await fn();
      this.results.push({
        test_name:   name,
        passed:      true,
        duration_ms: Date.now() - start,
        message:     'PASS',
        details,
      });
    } catch (err) {
      this.results.push({
        test_name:   name,
        passed:      false,
        duration_ms: Date.now() - start,
        message:     'FAIL',
        details:     {},
        error:       err instanceof Error ? err.message : String(err),
      });
    }
  }
}
