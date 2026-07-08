import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  deonticFloat,
  deonticRate,
  deonticRecordValidationRate,
} from '../../src/services/deontic-norms-bridge';

type VectorKind = 'float' | 'rate' | 'record_validation_rate';

interface Vector {
  id: string;
  kind: VectorKind;
  value?: unknown;
  numerator?: unknown;
  denominator?: unknown;
  records?: Array<Record<string, unknown>>;
  expected: number;
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyRow {
  id: string;
  kind: VectorKind;
  output: number;
}

interface PyResults {
  schemaVersion: string;
  results: PyRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-rate-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = mkdtempSync(join(tmpdir(), 'deontic-bridge-rate-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic_bridge_rate_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python deontic bridge rate runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runTs(vector: Vector): number {
  if (vector.kind === 'float') {
    return deonticFloat(vector.value);
  }
  if (vector.kind === 'rate') {
    return deonticRate(vector.numerator, vector.denominator);
  }
  return deonticRecordValidationRate(vector.records ?? []);
}

describe('PORT-249 deontic bridge rate helper parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-rate-vectors.json');
  const corpus = loadCorpus();

  it('matches expected outputs and Python float/rate helper behavior', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row.output]));

    for (const vector of corpus.vectors) {
      const ts = runTs(vector);
      expect(ts).toBeCloseTo(vector.expected, 10);
      expect(ts).toBeCloseTo(pyById.get(vector.id) ?? Number.NaN, 10);
    }
  });
});
