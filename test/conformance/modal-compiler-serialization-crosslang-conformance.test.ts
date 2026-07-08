const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as {
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  mkdtempSync: (prefix: string) => string;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  rmSync: (path: string, options: { recursive?: boolean; force?: boolean }) => void;
  writeFileSync: (path: string, data: string) => void;
} | undefined;

if (!nodeFs) {
  throw new Error('node:fs builtin module is required for conformance tests');
}

import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  ambiguityToPythonDict,
  makeAmbiguity,
  modalCompilerConfigToPythonDict,
  pythonDefaultModalCompilerConfig,
} from '../../src/services/logic/modal/modal-compiler';

interface AmbiguityVector {
  id: string;
  ambiguityType: string;
  message: string;
  candidateIds: string[];
  severity: 'review' | 'error' | 'warning' | 'requires_rule';
  metadata: Record<string, unknown>;
}

interface Corpus {
  schemaVersion: string;
  ambiguities: AmbiguityVector[];
}

interface PyResults {
  schemaVersion: string;
  configDefaults: Record<string, unknown>;
  ambiguities: Array<{ id: string; dict: Record<string, unknown> }>;
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/modal-compiler-serialization-vectors.json');
  return JSON.parse(nodeFs.readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'modal-compiler-serialization-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_compiler_serialization_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python modal compiler serialization runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-250 modal compiler serialization parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-compiler-serialization-vectors.json');
  const corpus = loadCorpus();

  it('matches Python config defaults and ambiguity to_dict output', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.ambiguities).toHaveLength(3);

    const py = runPythonReference(corpusPath);
    expect(modalCompilerConfigToPythonDict(pythonDefaultModalCompilerConfig())).toEqual(py.configDefaults);

    const pyAmbiguities = new Map(py.ambiguities.map(row => [row.id, row.dict]));
    for (const vector of corpus.ambiguities) {
      const ambiguity = makeAmbiguity(vector.ambiguityType, vector.message, {
        candidateIds: vector.candidateIds,
        severity: vector.severity,
        metadata: vector.metadata,
      });
      expect(ambiguityToPythonDict(ambiguity)).toEqual(pyAmbiguities.get(vector.id));
    }
  });
});
