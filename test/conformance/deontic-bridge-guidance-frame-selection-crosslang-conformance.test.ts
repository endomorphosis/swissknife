import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as {
  mkdtempSync: (prefix: string) => string;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  rmSync: (path: string, options: { recursive?: boolean; force?: boolean }) => void;
} | undefined;

if (!nodeFs) {
  throw new Error('node:fs builtin module is required for deontic bridge conformance tests');
}

import {
  deonticGuidanceFrameCandidates,
  deonticSelectedFrameFromCompilerGuidance,
} from '../../src/services/logic/bridges/deontic-norms-bridge';

type VectorKind = 'frame_candidates' | 'selected_frame';

interface Vector {
  id: string;
  kind: VectorKind;
  context: Record<string, unknown>;
  norm: Record<string, unknown>;
  expected: unknown;
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyRow {
  id: string;
  kind: VectorKind;
  output: unknown;
}

interface PyResults {
  schemaVersion: string;
  results: PyRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-guidance-frame-selection-vectors.json');
  return JSON.parse(nodeFs.readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'deontic-bridge-guidance-frame-selection-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic_bridge_guidance_frame_selection_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python deontic bridge guidance frame-selection runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runTs(vector: Vector): unknown {
  if (vector.kind === 'frame_candidates') {
    return deonticGuidanceFrameCandidates(vector.context, vector.norm);
  }
  return deonticSelectedFrameFromCompilerGuidance(vector.context, vector.norm);
}

describe('PORT-249 deontic guidance frame-selection helper parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-guidance-frame-selection-vectors.json');
  const corpus = loadCorpus();

  it('matches expected outputs and Python guidance frame-selection helper behavior', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row.output]));

    for (const vector of corpus.vectors) {
      const ts = runTs(vector);
      expect(ts).toEqual(vector.expected);
      expect(ts).toEqual(pyById.get(vector.id));
    }
  });
});
