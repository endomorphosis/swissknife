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
  modalOperatorFeatureKey,
  modalOperatorPairFeatureKey,
  temporalClausePrefixRelation,
  temporalTransitionContextCuesFromText,
} from '../../src/services/logic/modal/modal-logic-codec';

interface TemporalOperatorResult {
  operatorFeatureKeys: string[];
  operatorPairFeatureKeys: string[];
  temporalClausePrefixRelations: string[];
  temporalTransitionContextCues: string[][];
}

interface TemporalOperatorVector {
  id: string;
  description?: string;
  symbols: string[];
  operatorPairs: Array<[string, string]>;
  prefixKeys: string[];
  contextTexts: string[];
  expectedCodec: TemporalOperatorResult;
  expectedDecompiler: TemporalOperatorResult;
}

interface TemporalOperatorCorpus {
  schemaVersion: string;
  vectors: TemporalOperatorVector[];
}

interface PyResultRow extends TemporalOperatorResult {
  id: string;
}

interface PyResultFile {
  schemaVersion: string;
  results: PyResultRow[];
}

function loadCorpus(): TemporalOperatorCorpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/modal-temporal-operator-vectors.json');
  return JSON.parse(nodeFs.readFileSync(path, 'utf8')) as TemporalOperatorCorpus;
}

function runPythonReference(corpusPath: string): PyResultFile {
  const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'modal-codec-temporal-operator-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_codec_temporal_operator_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python modal codec temporal/operator runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as PyResultFile;
  } finally {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function evaluateTs(vector: TemporalOperatorVector): TemporalOperatorResult {
  return {
    operatorFeatureKeys: vector.symbols.map(modalOperatorFeatureKey),
    operatorPairFeatureKeys: vector.operatorPairs.map(([source, target]) => modalOperatorPairFeatureKey(source, target)),
    temporalClausePrefixRelations: vector.prefixKeys.map(temporalClausePrefixRelation),
    temporalTransitionContextCues: vector.contextTexts.map(temporalTransitionContextCuesFromText),
  };
}

describe('PORT-246 modal codec temporal/operator helper parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-temporal-operator-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python outputs for operator keys, temporal relations, and context cues', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors).toHaveLength(3);

    const pyResults = runPythonReference(corpusPath);
    const pyById = new Map(pyResults.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const ts = evaluateTs(vector);
      expect(ts).toEqual(vector.expectedCodec);

      const py = pyById.get(vector.id);
      expect(py).toBeDefined();
      expect(ts).toEqual({
        operatorFeatureKeys: py?.operatorFeatureKeys,
        operatorPairFeatureKeys: py?.operatorPairFeatureKeys,
        temporalClausePrefixRelations: py?.temporalClausePrefixRelations,
        temporalTransitionContextCues: py?.temporalTransitionContextCues,
      });
    }
  });
});
