import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  decompilerModalOperatorFeatureKey,
  decompilerModalOperatorPairFeatureKey,
  decompilerTemporalClausePrefixRelation,
  decompilerTemporalTransitionContextCuesFromText,
} from '../../src/services/logic/modal/modal-ir-decompiler.js';

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
  return JSON.parse(readFileSync(path, 'utf8')) as TemporalOperatorCorpus;
}

function runPythonReference(corpusPath: string): PyResultFile {
  const tempDir = mkdtempSync(join(tmpdir(), 'modal-decompiler-temporal-operator-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_decompiler_temporal_operator_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python modal decompiler temporal/operator runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResultFile;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function evaluateTs(vector: TemporalOperatorVector): TemporalOperatorResult {
  return {
    operatorFeatureKeys: vector.symbols.map(decompilerModalOperatorFeatureKey),
    operatorPairFeatureKeys: vector.operatorPairs.map(([source, target]) => decompilerModalOperatorPairFeatureKey(source, target)),
    temporalClausePrefixRelations: vector.prefixKeys.map(decompilerTemporalClausePrefixRelation),
    temporalTransitionContextCues: vector.contextTexts.map(decompilerTemporalTransitionContextCuesFromText),
  };
}

describe('PORT-247 modal decompiler temporal/operator helper parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-temporal-operator-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python outputs for operator keys, temporal relations, and context cues', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors).toHaveLength(3);

    const pyResults = runPythonReference(corpusPath);
    const pyById = new Map(pyResults.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const ts = evaluateTs(vector);
      expect(ts).toEqual(vector.expectedDecompiler);

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
