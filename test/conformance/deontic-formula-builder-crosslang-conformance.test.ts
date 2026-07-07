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
  parserElementToFormula,
  parserElementToFormulaRecord,
} from '../../src/services/logic/deontic/deontic-formula-builder';

interface Vector {
  id: string;
  element: Record<string, unknown>;
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyResult {
  id: string;
  formula: string;
  record: Record<string, unknown>;
}

interface PyResults {
  schemaVersion: string;
  results: PyResult[];
}

const RECORD_KEYS = [
  'formula_id',
  'source_id',
  'canonical_citation',
  'target_logic',
  'formula',
  'modality',
  'norm_type',
  'support_span',
  'proof_ready',
  'requires_validation',
  'repair_required',
  'blockers',
  'parser_warnings',
  'included_formula_slots',
  'omitted_formula_slots',
  'deterministic_resolution',
  'schema_version',
];

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/deontic-formula-builder-vectors.json');
  return JSON.parse(nodeFs.readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'deontic-formula-builder-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic_formula_builder_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], { encoding: 'utf8' });
    if (proc.status !== 0) {
      throw new Error(`Python deontic formula builder runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function selectRecordFields(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(RECORD_KEYS.map(key => [key, record[key]]));
}

describe('PORT-248 deontic formula builder parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic-formula-builder-vectors.json');
  const corpus = loadCorpus();

  it('matches Python parser-element formulas and source-grounded formula records', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors.length).toBeGreaterThanOrEqual(7);

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const pyRow = pyById.get(vector.id);
      expect(pyRow).toBeDefined();

      const tsFormula = parserElementToFormula(vector.element);
      const tsRecord = selectRecordFields(parserElementToFormulaRecord(vector.element));

      expect(tsFormula).toEqual(pyRow?.formula);
      expect(tsRecord).toEqual(pyRow?.record);
    }
  });
});
