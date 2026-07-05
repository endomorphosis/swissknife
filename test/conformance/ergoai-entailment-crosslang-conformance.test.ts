import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { FLogicProvingMethod, ZKPFLogicProver } from '../../src/services/flogic-ergoai-wrapper';

interface EntailmentVector {
  id: string;
  formula: string;
  axioms: string[];
  expected: {
    isProved: boolean;
  };
}

interface EntailmentCorpus {
  schemaVersion: string;
  vectors: EntailmentVector[];
}

interface PyResultRow {
  id: string;
  isProved: boolean;
}

interface PyResultFile {
  schemaVersion: string;
  results: PyResultRow[];
}

function loadEntailmentCorpus(): EntailmentCorpus {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/ergoai-entailment-vectors.json');
  return JSON.parse(readFileSync(corpusPath, 'utf8')) as EntailmentCorpus;
}

function runPythonReference(corpusPath: string): PyResultFile {
  const tempDir = mkdtempSync(join(tmpdir(), 'ergoai-entailment-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/ergoai_entailment_py_runner.py');
    const proc = spawnSync(
      'python3',
      [scriptPath, '--vectors', corpusPath, '--out', outPath],
      { encoding: 'utf8' },
    );
    if (proc.status !== 0) {
      throw new Error(`Python entailment runner failed: ${proc.stderr || proc.stdout}`);
    }

    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResultFile;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-254 ErgoAI entailment parity corpus (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/ergoai-entailment-vectors.json');
  const corpus = loadEntailmentCorpus();

  it('matches Python reference and expected outcomes for each vector', async () => {
    const pyResults = runPythonReference(corpusPath);
    const pyById = new Map(pyResults.results.map(row => [row.id, row.isProved]));

    const prover = new ZKPFLogicProver();
    for (const vector of corpus.vectors) {
      const tsResult = await prover.prove(vector.formula, vector.axioms, FLogicProvingMethod.STANDARD);
      expect(pyById.has(vector.id)).toBe(true);
      expect(tsResult.isProved).toBe(vector.expected.isProved);
      expect(tsResult.isProved).toBe(pyById.get(vector.id));
    }
  });
});
