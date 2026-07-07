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
  classifyLegalEntity,
  classifyModal,
  extractActionRecipient,
  normalizePredicate,
} from '../../src/services/logic/deontic/deontic-parser-utils';

interface ModalCase {
  id: string;
  input: string;
  expected: {
    modality: string;
    operator: string;
  };
}

interface ValueCase {
  id: string;
  input: string;
  expected: string;
}

interface Corpus {
  schemaVersion: string;
  modalCases: ModalCase[];
  entityCases: ValueCase[];
  predicateCases: ValueCase[];
  recipientCases: ValueCase[];
}

interface PyModalRow {
  id: string;
  modality: string;
  operator: string;
}

interface PyValueRow {
  id: string;
  value: string;
}

interface PyResults {
  schemaVersion: string;
  modalResults: PyModalRow[];
  entityResults: PyValueRow[];
  predicateResults: PyValueRow[];
  recipientResults: PyValueRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/deontic-parser-utils-vectors.json');
  return JSON.parse(nodeFs.readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'deontic-parser-utils-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic_parser_utils_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], { encoding: 'utf8' });
    if (proc.status !== 0) {
      throw new Error(`Python deontic parser utils runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-248 deontic parser utility parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic-parser-utils-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python outputs for utility functions', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const py = runPythonReference(corpusPath);
    const pyModalById = new Map(py.modalResults.map(row => [row.id, row]));
    const pyEntityById = new Map(py.entityResults.map(row => [row.id, row.value]));
    const pyPredicateById = new Map(py.predicateResults.map(row => [row.id, row.value]));
    const pyRecipientById = new Map(py.recipientResults.map(row => [row.id, row.value]));

    for (const testCase of corpus.modalCases) {
      const ts = classifyModal(testCase.input);
      expect(ts.modality).toBe(testCase.expected.modality);
      expect(ts.operator).toBe(testCase.expected.operator);
      expect(ts.modality).toBe(pyModalById.get(testCase.id)?.modality);
      expect(ts.operator).toBe(pyModalById.get(testCase.id)?.operator);
    }

    for (const testCase of corpus.entityCases) {
      const ts = classifyLegalEntity(testCase.input);
      expect(ts).toBe(testCase.expected);
      expect(ts).toBe(pyEntityById.get(testCase.id));
    }

    for (const testCase of corpus.predicateCases) {
      const ts = normalizePredicate(testCase.input);
      expect(ts).toBe(testCase.expected);
      expect(ts).toBe(pyPredicateById.get(testCase.id));
    }

    for (const testCase of corpus.recipientCases) {
      const ts = extractActionRecipient(testCase.input);
      expect(ts).toBe(testCase.expected);
      expect(ts).toBe(pyRecipientById.get(testCase.id));
    }
  });
});
