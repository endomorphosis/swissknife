import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { deonticNormalizedTextFromRows } from '../../src/services/logic/bridges/deontic-norms-bridge.js';

interface Vector {
  id: string;
  rows: Array<Record<string, string>>;
  source_text: string;
  expected: string;
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyRow {
  id: string;
  output: string;
}

interface PyResults {
  schemaVersion: string;
  results: PyRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-normalized-text-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = mkdtempSync(join(tmpdir(), 'deontic-bridge-normalized-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic_bridge_normalized_text_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], { encoding: 'utf8' });
    if (proc.status !== 0) {
      throw new Error(`Python deontic bridge normalized-text runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-249 deontic bridge normalized-text parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-normalized-text-vectors.json');
  const corpus = loadCorpus();

  it('matches expected outputs and Python normalized-text derivation', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row.output]));

    for (const vector of corpus.vectors) {
      const ts = deonticNormalizedTextFromRows(vector.rows, vector.source_text);
      expect(ts).toBe(vector.expected);
      expect(ts).toBe(pyById.get(vector.id));
    }
  });
});
