import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  deonticListOfStrings,
  deonticNormalizedTargetNames,
} from '../../src/services/deontic-norms-bridge';

interface Vector {
  id: string;
  input: unknown;
  expectedListOfStrings: string[];
  expectedNormalizedTargetNames: string[];
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyRow {
  id: string;
  listOfStrings: string[];
  normalizedTargetNames: string[];
}

interface PyResults {
  schemaVersion: string;
  results: PyRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-target-names-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = mkdtempSync(join(tmpdir(), 'deontic-bridge-targets-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic_bridge_target_names_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python deontic bridge target-name runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-249 deontic bridge target-name helper parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-target-names-vectors.json');
  const corpus = loadCorpus();

  it('matches expected outputs and Python target-name helper behavior', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const tsList = deonticListOfStrings(vector.input);
      const tsNormalized = deonticNormalizedTargetNames(vector.input);
      expect(tsList).toEqual(vector.expectedListOfStrings);
      expect(tsNormalized).toEqual(vector.expectedNormalizedTargetNames);

      const pyRow = pyById.get(vector.id);
      expect(tsList).toEqual(pyRow?.listOfStrings ?? []);
      expect(tsNormalized).toEqual(pyRow?.normalizedTargetNames ?? []);
    }
  });
});
