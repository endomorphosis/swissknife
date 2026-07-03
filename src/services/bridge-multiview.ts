/**
 * bridge-multiview.ts
 *
 * Multi-view legal IR aggregator — runs multiple bridge adapters over the same
 * text and merges their views into a unified LegalIRDocument.
 *
 * TypeScript port of ipfs_datasets_py/logic/bridge/multiview.py
 *
 * Provides:
 *   MultiViewLegalIRReport  — aggregated report from all adapters
 *   LegalIRTrainingTarget   — optimizer target derived from a multi-view doc
 *   evaluateLegalIRMultiview() — run all adapters and aggregate
 */

import { createHash } from 'node:crypto';
import {
  LegalIRDocument, LegalIRDocumentInit, LogicIRView,
  BridgeEvaluationReport, RoundTripMetrics,
} from './bridge-types.js';

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface BridgeAdapter {
  readonly name: string;
  encode(text: string, opts?: Record<string, unknown>): { doc: LegalIRDocument; context: Record<string, unknown> };
  evaluate(text: string, opts?: Record<string, unknown>): BridgeEvaluationReport;
}

// ---------------------------------------------------------------------------
// MultiViewLegalIRReport
// ---------------------------------------------------------------------------

export class MultiViewLegalIRReport {
  readonly bridgeNames: readonly string[];
  readonly document: LegalIRDocument;
  readonly reports: Readonly<Record<string, BridgeEvaluationReport>>;
  readonly failures: Readonly<Record<string, string>>;

  constructor(init: {
    bridgeNames: readonly string[];
    document: LegalIRDocument;
    reports?: Record<string, BridgeEvaluationReport>;
    failures?: Record<string, string>;
  }) {
    this.bridgeNames = init.bridgeNames;
    this.document = init.document;
    this.reports = init.reports ?? {};
    this.failures = init.failures ?? {};
  }

  get attemptedCount(): number { return this.bridgeNames.length; }

  get acceptedCount(): number {
    return Object.values(this.reports).filter(r => r.success).length;
  }

  get acceptanceRate(): number {
    return this.attemptedCount > 0 ? this.acceptedCount / this.attemptedCount : 0;
  }

  get failureCount(): number { return Object.keys(this.failures).length; }

  get viewNames(): string[] { return Object.keys(this.document.views); }

  toDict(): Record<string, unknown> {
    return {
      acceptance_rate: this.acceptanceRate,
      accepted_count: this.acceptedCount,
      attempted_count: this.attemptedCount,
      bridge_names: [...this.bridgeNames],
      document_hash: this.document.canonicalHash(),
      document_id: this.document.documentId,
      failure_count: this.failureCount,
      failures: this.failures,
      reports: Object.fromEntries(
        Object.entries(this.reports).map(([k, v]) => [k, v.toDict()])
      ),
      view_names: this.viewNames,
    };
  }
}

// ---------------------------------------------------------------------------
// LegalIRTrainingTarget
// ---------------------------------------------------------------------------

export class LegalIRTrainingTarget {
  readonly bridgeNames: readonly string[];
  readonly document: LegalIRDocument;
  readonly losses: Readonly<Record<string, number>>;
  readonly adapterLosses: Readonly<Record<string, Record<string, number>>>;
  readonly viewDistribution: Readonly<Record<string, number>>;
  readonly accepted: boolean;

  constructor(init: {
    bridgeNames: readonly string[];
    document: LegalIRDocument;
    losses?: Record<string, number>;
    adapterLosses?: Record<string, Record<string, number>>;
    viewDistribution?: Record<string, number>;
    accepted?: boolean;
  }) {
    this.bridgeNames = init.bridgeNames;
    this.document = init.document;
    this.losses = init.losses ?? {};
    this.adapterLosses = init.adapterLosses ?? {};
    this.viewDistribution = init.viewDistribution ?? {};
    this.accepted = init.accepted ?? false;
  }

  get totalLoss(): number {
    return this.losses['legal_ir_multiview_total_loss'] ?? 0;
  }

  toDict(): Record<string, unknown> {
    return {
      accepted: this.accepted,
      adapter_losses: Object.fromEntries(
        Object.entries(this.adapterLosses)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).sort())])
      ),
      bridge_names: [...this.bridgeNames],
      document_hash: this.document.canonicalHash(),
      document_id: this.document.documentId,
      document_version: this.document.version,
      losses: Object.fromEntries(Object.entries(this.losses).sort()),
      total_loss: this.totalLoss,
      view_distribution: Object.fromEntries(Object.entries(this.viewDistribution).sort()),
    };
  }
}

// ---------------------------------------------------------------------------
// Merge helper: combine views from multiple documents into one
// ---------------------------------------------------------------------------

function mergeDocuments(
  docs: LegalIRDocument[],
  resolvedDocId: string,
  sourceText: string,
): LegalIRDocument {
  if (docs.length === 0) {
    return new LegalIRDocument({ documentId: resolvedDocId, sourceText, normalizedText: sourceText.replace(/\s+/g, ' ').trim() });
  }
  const mergedViews: Record<string, LogicIRView> = {};
  const mergedTriples: Array<Record<string, string>> = [];

  for (const doc of docs) {
    for (const [name, view] of Object.entries(doc.views)) {
      // Later adapters' views win on name collision (prefixed with bridge name)
      const key = `${doc.metadata['bridge'] ?? 'bridge'}:${name}`;
      mergedViews[key] = view;
    }
    mergedTriples.push(...doc.frameLogicTriples);
  }

  const init: LegalIRDocumentInit = {
    documentId: resolvedDocId,
    sourceText,
    normalizedText: docs[0].normalizedText,
    source: docs[0].source,
    views: mergedViews,
    frameLogicTriples: mergedTriples,
    metadata: {
      bridge: 'multiview',
      adapter_count: docs.length,
    },
  };
  return new LegalIRDocument(init);
}

// ---------------------------------------------------------------------------
// evaluateLegalIRMultiview
// ---------------------------------------------------------------------------

export interface MultiviewOpts {
  documentId?: string;
  citation?: string;
  source?: string;
}

/**
 * Run all `adapters` over `text` and return a `MultiViewLegalIRReport`
 * whose document merges all adapter views.
 */
export function evaluateLegalIRMultiview(
  text: string,
  adapters: BridgeAdapter[],
  opts: MultiviewOpts = {},
): MultiViewLegalIRReport {
  const bridgeNames = adapters.map(a => a.name);
  const resolvedDocId =
    opts.documentId ??
    `multiview:${createHash('sha256').update(text.slice(0, 512), 'utf8').digest('hex').slice(0, 16)}`;

  const reports: Record<string, BridgeEvaluationReport> = {};
  const failures: Record<string, string> = {};
  const docs: LegalIRDocument[] = [];

  for (const adapter of adapters) {
    try {
      const { doc } = adapter.encode(text, { documentId: resolvedDocId, ...opts });
      const report = adapter.evaluate(text, { documentId: resolvedDocId, ...opts });
      reports[adapter.name] = report;
      docs.push(doc);
    } catch (err) {
      failures[adapter.name] = String(err);
    }
  }

  const mergedDoc = mergeDocuments(docs, resolvedDocId, text);
  return new MultiViewLegalIRReport({ bridgeNames, document: mergedDoc, reports, failures });
}

// ---------------------------------------------------------------------------
// toTrainingTarget
// ---------------------------------------------------------------------------

/**
 * Convert a `MultiViewLegalIRReport` into an `LegalIRTrainingTarget`
 * by computing aggregate losses from all bridge reports.
 */
export function toTrainingTarget(report: MultiViewLegalIRReport): LegalIRTrainingTarget {
  const adapterLosses: Record<string, Record<string, number>> = {};
  let totalLoss = 0;

  for (const [name, bridgeReport] of Object.entries(report.reports)) {
    const m = new RoundTripMetrics(bridgeReport.metrics as never);
    const l = m.totalLoss();
    adapterLosses[name] = { total_loss: l };
    totalLoss += l;
  }

  const viewNames = Object.keys(report.document.views);
  const viewDistribution: Record<string, number> = {};
  if (viewNames.length > 0) {
    const share = 1 / viewNames.length;
    for (const name of viewNames) viewDistribution[name] = share;
  }

  return new LegalIRTrainingTarget({
    bridgeNames: report.bridgeNames,
    document: report.document,
    losses: { legal_ir_multiview_total_loss: totalLoss },
    adapterLosses,
    viewDistribution,
    accepted: report.acceptedCount > 0,
  });
}
