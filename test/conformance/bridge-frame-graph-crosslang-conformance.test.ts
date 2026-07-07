import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  dcecFrameLogicTriplesFromRecords,
  dcecGraphDataFromFrameTriples,
} from '../../src/services/logic/bridges/cec-dcec-bridge';
import {
  tdfolFrameLogicTriplesFromRecords,
  tdfolGraphDataFromFrameTriples,
} from '../../src/services/logic/bridges/fol-tdfol-bridge';

const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as {
  mkdtempSync: (prefix: string) => string;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  rmSync: (path: string, options: { recursive?: boolean; force?: boolean }) => void;
} | undefined;

if (!nodeFs) {
  throw new Error('node:fs builtin module is required for bridge frame graph conformance tests');
}

interface Vector {
  id: string;
  bridge: 'fol_tdfol' | 'cec_dcec';
  documentId: string;
  graphId: string;
  graphMetadata: Record<string, unknown>;
  formulaRecords?: Array<Record<string, unknown>>;
  records?: Array<Record<string, unknown>>;
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyRow {
  id: string;
  bridge: string;
  triples: Array<Record<string, string>>;
  graph: Record<string, unknown> | null;
}

interface PyResults {
  schemaVersion: string;
  results: PyRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/bridge-frame-graph-vectors.json');
  return JSON.parse(nodeFs.readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'bridge-frame-graph-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/bridge_frame_graph_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python bridge frame graph runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runTs(vector: Vector): { triples: Array<Record<string, string>>; graph: Record<string, unknown> | null } {
  if (vector.bridge === 'fol_tdfol') {
    const triples = tdfolFrameLogicTriplesFromRecords(vector.documentId, vector.formulaRecords ?? []);
    const graph = tdfolGraphDataFromFrameTriples(triples, {
      graphId: vector.graphId,
      metadata: vector.graphMetadata,
    });
    return { triples, graph: graph as unknown as Record<string, unknown> | null };
  }
  const triples = dcecFrameLogicTriplesFromRecords(vector.documentId, vector.records ?? []);
  const graph = dcecGraphDataFromFrameTriples(triples, {
    graphId: vector.graphId,
    metadata: vector.graphMetadata,
  });
  return { triples, graph: graph as unknown as Record<string, unknown> | null };
}

describe('PORT-249 FOL/TDFOL and CEC/DCEC bridge frame-logic graph parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/bridge-frame-graph-vectors.json');
  const corpus = loadCorpus();

  it('matches Python bridge triples and graph projection for shared fixtures', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const ts = runTs(vector);
      const pyRow = pyById.get(vector.id);

      expect(pyRow).toBeDefined();
      expect(pyRow?.bridge).toBe(vector.bridge);
      expect(ts.triples).toEqual(pyRow?.triples);
      expect(ts.graph).toEqual(pyRow?.graph);
      expect(ts.graph?.metadata?.['frame_logic_projection_aligned']).toBe(true);
      expect(ts.graph?.metadata?.['legal_ir_multiview_graph_failure_penalty']).toBe(0);
    }
  });
});
