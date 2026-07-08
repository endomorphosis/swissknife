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
  DeterministicModalLogicCodec,
  stableMockEmbedding,
} from '../../src/services/logic/modal/modal-logic-codec';

interface Vector {
  id: string;
  text: string;
  dimensions: number;
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyResult {
  id: string;
  embedding: number[];
}

interface PyResults {
  schemaVersion: string;
  results: PyResult[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-stable-embedding-vectors.json');
  return JSON.parse(nodeFs.readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'modal-codec-embedding-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_codec_stable_embedding_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], { encoding: 'utf8' });
    if (proc.status !== 0) {
      throw new Error(`Python modal codec stable embedding runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-246 modal codec stable embedding parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-stable-embedding-vectors.json');
  const corpus = loadCorpus();

  it('matches Python stable_mock_embedding and encode source embeddings', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors).toHaveLength(4);

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const pyRow = pyById.get(vector.id);
      expect(pyRow).toBeDefined();

      const embedding = stableMockEmbedding(vector.text, vector.dimensions);
      expect(embedding).toEqual(pyRow?.embedding);

      const codec = new DeterministicModalLogicCodec({ embeddingDimensions: vector.dimensions });
      const encoded = codec.encode(vector.text);
      expect(encoded.sourceEmbedding).toEqual(pyRow?.embedding);
      expect(encoded.metadata.embedding_model).toBe('stable_mock_embedding');
      expect(encoded.metadata).not.toHaveProperty('simulated');
    }
  });
});
