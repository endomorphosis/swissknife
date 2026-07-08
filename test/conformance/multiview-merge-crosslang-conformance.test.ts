import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { mergeMultiviewDocuments } from '../../src/services/bridge-multiview';
import {
  BridgeEvaluationReport,
  GraphProjectionResult,
  LegalIRDocument,
  LogicIRView,
  ProofGateResult,
  RoundTripMetrics,
} from '../../src/services/bridge-types';

interface ViewPayload {
  format?: string;
  sourceComponent?: string;
  source_component?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface DocumentPayload {
  documentId: string;
  sourceText?: string;
  normalizedText?: string;
  source?: string;
  citation?: string;
  views?: Record<string, ViewPayload>;
  frameLogicTriples?: Array<Record<string, string>>;
  metadata?: Record<string, unknown>;
  version?: string;
}

interface ReportPayload {
  adapterName: string;
  targetComponent?: string;
  status?: string;
  document: DocumentPayload;
  proofGate?: Record<string, unknown>;
  graphProjection?: Record<string, unknown>;
}

interface Vector {
  id: string;
  documentId: string;
  sourceText: string;
  source?: string;
  citation?: string;
  bridgeNames: string[];
  failures?: Record<string, string>;
  reports: ReportPayload[];
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyResults {
  schemaVersion: string;
  results: Array<{ id: string; document: Record<string, unknown> }>;
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/multiview-merge-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = mkdtempSync(join(tmpdir(), 'multiview-merge-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/multiview_merge_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python multiview merge runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function proofGate(payload: Record<string, unknown> = {}): ProofGateResult {
  return new ProofGateResult({
    attemptedCount: Number(payload.attemptedCount ?? payload.attempted_count ?? 0),
    validCount: Number(payload.validCount ?? payload.valid_count ?? 0),
    unavailableCount: Number(payload.unavailableCount ?? payload.unavailable_count ?? 0),
    errorCount: Number(payload.errorCount ?? payload.error_count ?? 0),
    failedCount: Number(payload.failedCount ?? payload.failed_count ?? 0),
    verifiedBy: (payload.verifiedBy ?? payload.verified_by ?? []) as string[],
    details: (payload.details ?? []) as Array<Record<string, unknown>>,
  });
}

function graphProjection(payload: Record<string, unknown> = {}): GraphProjectionResult {
  return new GraphProjectionResult({
    graphId: String(payload.graphId ?? payload.graph_id ?? ''),
    neo4jCompatible: Boolean(payload.neo4jCompatible ?? payload.neo4j_compatible ?? false),
    nodeCount: Number(payload.nodeCount ?? payload.node_count ?? 0),
    relationshipCount: Number(payload.relationshipCount ?? payload.relationship_count ?? 0),
    nodeLabels: (payload.nodeLabels ?? payload.node_labels ?? []) as string[],
  });
}

function legalDocument(payload: DocumentPayload): LegalIRDocument {
  const views = Object.fromEntries(
    Object.entries(payload.views ?? {}).map(([name, view]) => [
      name,
      new LogicIRView({
        name,
        payload: view.payload ?? {},
        format: view.format ?? '',
        sourceComponent: view.sourceComponent ?? view.source_component ?? '',
        metadata: view.metadata ?? {},
      }),
    ])
  );
  return new LegalIRDocument({
    documentId: payload.documentId,
    sourceText: payload.sourceText ?? '',
    normalizedText: payload.normalizedText ?? '',
    source: payload.source,
    citation: payload.citation,
    views,
    frameLogicTriples: payload.frameLogicTriples ?? [],
    metadata: payload.metadata ?? {},
    version: payload.version,
  });
}

function tsDocument(vector: Vector): Record<string, unknown> {
  const entries = vector.reports.map(reportPayload => {
    const doc = legalDocument(reportPayload.document);
    const report = new BridgeEvaluationReport({
      bridgeName: reportPayload.adapterName,
      documentId: doc.documentId,
      metrics: new RoundTripMetrics(),
      proofGate: proofGate(reportPayload.proofGate ?? {}),
      graphProjection: graphProjection(reportPayload.graphProjection ?? {}),
      viewNames: Object.keys(doc.views),
      error: reportPayload.status && reportPayload.status !== 'ok' ? reportPayload.status : undefined,
    });
    return { adapterName: reportPayload.adapterName, doc, report };
  });
  return mergeMultiviewDocuments(entries, {
    documentId: vector.documentId,
    sourceText: vector.sourceText,
    bridgeNames: vector.bridgeNames,
    citation: vector.citation,
    source: vector.source,
    failures: vector.failures ?? {},
  }).toDict();
}

describe('PORT-249 Legal-IR multiview merge parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/multiview-merge-vectors.json');
  const corpus = loadCorpus();

  it('matches Python multiview merged LegalIRDocument output', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row.document]));

    for (const vector of corpus.vectors) {
      const ts = tsDocument(vector);
      expect(ts).toEqual(pyById.get(vector.id));
      expect(Object.keys((ts.views as Record<string, unknown>) ?? {})).toEqual([
        'deontic.a_view',
        'deontic.z_view',
        'fol_tdfol.tdfol_formulas',
      ]);
      expect(ts.metadata).toMatchObject({
        accepted_bridge_count: 1,
        attempted_bridge_count: 3,
        failed_bridge_count: 1,
        implemented_bridge_count: 2,
        multiview_version: 'legal-ir-multiview-v1',
        view_count: 3,
      });
    }
  });
});
