import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  deonticFrameLogicTriplesFromRecords,
  deonticGraphDataFromFrameTriples,
} from '../../src/services/logic/bridges/deontic-norms-bridge.js';

interface Vector {
  id: string;
  documentId: string;
  graphId: string;
  graphMetadata: Record<string, unknown>;
  norms: Array<Record<string, unknown>>;
  formulaRecords?: Array<Record<string, unknown>>;
  coverageRecords?: Array<Record<string, unknown>>;
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyRow {
  id: string;
  triples: Array<Record<string, string>>;
  graph: Record<string, unknown> | null;
}

interface PyResults {
  schemaVersion: string;
  results: PyRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-frame-graph-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = mkdtempSync(join(tmpdir(), 'deontic-bridge-frame-graph-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic_bridge_frame_graph_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python deontic bridge frame graph runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-249 deontic bridge frame-logic graph parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-frame-graph-vectors.json');
  const corpus = loadCorpus();

  it('matches Python bridge triples and graph projection for shared fixtures', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const triples = deonticFrameLogicTriplesFromRecords(vector.documentId, {
        norms: vector.norms,
        formulaRecords: vector.formulaRecords ?? [],
        coverageRecords: vector.coverageRecords ?? [],
      });
      const graph = deonticGraphDataFromFrameTriples(triples, {
        graphId: vector.graphId,
        metadata: vector.graphMetadata,
      });
      const pyRow = pyById.get(vector.id);

      expect(pyRow).toBeDefined();
      expect(triples).toEqual(pyRow?.triples);
      expect(graph).toEqual(pyRow?.graph);
      expect(graph?.metadata?.['frame_logic_projection_augmented_aligned']).toBe(true);
      expect(graph?.metadata?.['legal_ir_multiview_graph_failure_penalty']).toBe(0);
    }
  });
});
