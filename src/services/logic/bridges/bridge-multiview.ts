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

import {
  LegalIRDocument, LegalIRDocumentInit, LogicIRView,
  BridgeEvaluationReport, RoundTripMetrics,
} from './bridge-types.js';
import { sha256Hex } from '../../provers/browser-crypto.js';

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface BridgeAdapter {
  readonly name: string;
  encode(text: string, opts?: Record<string, unknown>): { doc: LegalIRDocument; context: Record<string, unknown> };
  evaluate(text: string, opts?: Record<string, unknown>): BridgeEvaluationReport;
}

export interface MultiviewDocumentEntry {
  readonly adapterName: string;
  readonly doc: LegalIRDocument;
  readonly report?: BridgeEvaluationReport;
  readonly accepted?: boolean;
}

export interface MergeMultiviewDocumentsOpts {
  readonly documentId: string;
  readonly sourceText: string;
  readonly bridgeNames: readonly string[];
  readonly citation?: string;
  readonly source?: string;
  readonly failures?: Record<string, string>;
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

function normalizedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function graphProjectionPasses(report: BridgeEvaluationReport | undefined): boolean {
  if (!report) return false;
  return (
    report.graphProjection.neo4jCompatible &&
    report.graphProjection.nodeCount > 0 &&
    report.graphProjection.relationshipCount > 0
  );
}

function entryAccepted(entry: MultiviewDocumentEntry): boolean {
  if (entry.accepted !== undefined) return entry.accepted;
  const report = entry.report;
  if (!report) return entry.doc.hasFrameLogic;
  return (
    report.success &&
    entry.doc.hasFrameLogic &&
    report.proofGate.compiles &&
    graphProjectionPasses(report)
  );
}

function firstCitation(entries: readonly MultiviewDocumentEntry[]): string | undefined {
  for (const entry of entries) {
    if (entry.doc.citation) return entry.doc.citation;
  }
  return undefined;
}

/**
 * Python parity for `bridge/multiview.py::_merge_reports_to_document`.
 *
 * The Python implementation sorts report entries by adapter name, prefixes view
 * names with `adapter.view`, annotates each merged view with the adapter and
 * original view name, deduplicates frame-logic triples, and emits a stable
 * `legal-ir-multiview-v1` document envelope.
 */
export function mergeMultiviewDocuments(
  entries: readonly MultiviewDocumentEntry[],
  opts: MergeMultiviewDocumentsOpts,
): LegalIRDocument {
  if (entries.length === 0) {
    return new LegalIRDocument({
      documentId: opts.documentId,
      sourceText: opts.sourceText,
      normalizedText: normalizedText(opts.sourceText),
      source: opts.source ?? 'us_code',
      citation: opts.citation,
      metadata: {
        accepted_bridge_count: 0,
        attempted_bridge_count: opts.bridgeNames.length,
        bridge_names: [...opts.bridgeNames],
        failed_bridge_count: Object.keys(opts.failures ?? {}).length,
        implemented_bridge_count: 0,
        multiview_version: 'legal-ir-multiview-v1',
        view_count: 0,
      },
      version: 'legal-ir-multiview-v1',
    });
  }

  const mergedViews: Record<string, LogicIRView> = {};
  const mergedTriples: Array<Record<string, string>> = [];
  const seenTriples = new Set<string>();
  let mergedNormalizedText = normalizedText(opts.sourceText);

  for (const entry of [...entries].sort((a, b) => a.adapterName.localeCompare(b.adapterName))) {
    const { adapterName, doc } = entry;
    if (doc.normalizedText) mergedNormalizedText = doc.normalizedText;
    for (const [name, view] of Object.entries(doc.views).sort(([a], [b]) => a.localeCompare(b))) {
      const key = `${adapterName}.${name}`;
      mergedViews[key] = new LogicIRView({
        name: key,
        format: view.format,
        sourceComponent: view.sourceComponent,
        payload: view.payload,
        metadata: {
          ...view.metadata,
          adapter_name: adapterName,
          original_view_name: name,
        },
      });
    }
    for (const triple of doc.frameLogicTriples) {
      const subject = String(triple.subject ?? '');
      const predicate = String(triple.predicate ?? '');
      const object = String(triple.object ?? '');
      if (!subject || !predicate || !object) continue;
      const key = `${subject}\u0000${predicate}\u0000${object}`;
      if (seenTriples.has(key)) continue;
      seenTriples.add(key);
      mergedTriples.push({ subject, predicate, object });
    }
  }

  const init: LegalIRDocumentInit = {
    documentId: opts.documentId,
    sourceText: opts.sourceText,
    normalizedText: mergedNormalizedText,
    source: opts.source ?? entries[0]?.doc.source ?? 'us_code',
    citation: opts.citation ?? firstCitation(entries),
    views: mergedViews,
    frameLogicTriples: mergedTriples,
    metadata: {
      accepted_bridge_count: entries.filter(entryAccepted).length,
      attempted_bridge_count: opts.bridgeNames.length,
      bridge_names: [...opts.bridgeNames],
      failed_bridge_count: Object.keys(opts.failures ?? {}).length,
      implemented_bridge_count: entries.length,
      multiview_version: 'legal-ir-multiview-v1',
      view_count: Object.keys(mergedViews).length,
    },
    version: 'legal-ir-multiview-v1',
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
    `multiview:${sha256Hex(text.slice(0, 512)).slice(0, 16)}`;

  const reports: Record<string, BridgeEvaluationReport> = {};
  const failures: Record<string, string> = {};
  const entries: MultiviewDocumentEntry[] = [];

  for (const adapter of adapters) {
    try {
      const { doc } = adapter.encode(text, { documentId: resolvedDocId, ...opts });
      const report = adapter.evaluate(text, { documentId: resolvedDocId, ...opts });
      reports[adapter.name] = report;
      entries.push({ adapterName: adapter.name, doc, report });
    } catch (err) {
      failures[adapter.name] = String(err);
    }
  }

  const mergedDoc = mergeMultiviewDocuments(entries, {
    documentId: resolvedDocId,
    sourceText: text,
    bridgeNames,
    citation: opts.citation,
    source: opts.source,
    failures,
  });
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
