import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  ambiguityToPythonDict,
  modalCompilerFormulaAmbiguities,
  modalCompilerRankingShare,
  type ModalCompilerFormulaLike,
} from '../../src/services/modal-compiler';

interface FormulaDocumentVector {
  id: string;
  formulas: ModalCompilerFormulaLike[];
}

interface RankingShareVector {
  id: string;
  candidate: Record<string, unknown>;
}

interface Corpus {
  schemaVersion: string;
  formulaDocuments: FormulaDocumentVector[];
  rankingShareCases: RankingShareVector[];
}

interface PyResults {
  schemaVersion: string;
  formulaDocuments: Array<{ id: string; ambiguities: Array<Record<string, unknown>> }>;
  rankingShareCases: Array<{ id: string; share: number }>;
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/modal-compiler-formula-ambiguity-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = mkdtempSync(join(tmpdir(), 'modal-compiler-formula-ambiguity-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_compiler_formula_ambiguity_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python modal compiler formula ambiguity runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-250 modal compiler formula ambiguity parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-compiler-formula-ambiguity-vectors.json');
  const corpus = loadCorpus();

  it('matches Python span-level formula ambiguity and ranking-share behavior', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.formulaDocuments.length).toBeGreaterThanOrEqual(4);
    expect(corpus.rankingShareCases.length).toBeGreaterThanOrEqual(4);

    const py = runPythonReference(corpusPath);
    const pyFormulaRows = new Map(py.formulaDocuments.map(row => [row.id, row.ambiguities]));
    const pyRankingRows = new Map(py.rankingShareCases.map(row => [row.id, row.share]));

    for (const vector of corpus.formulaDocuments) {
      const ts = modalCompilerFormulaAmbiguities(vector.formulas).map(ambiguityToPythonDict);
      expect(ts).toEqual(pyFormulaRows.get(vector.id));
    }

    for (const vector of corpus.rankingShareCases) {
      expect(modalCompilerRankingShare(vector.candidate)).toBe(pyRankingRows.get(vector.id));
    }
  });
});
