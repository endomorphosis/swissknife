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

import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { DeterministicModalCompiler } from '../../src/services/logic/modal/modal-compiler';

interface Vector {
  id: string;
  text: string;
  documentId: string;
  citation: string;
  source: string;
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface ResultRow {
  id: string;
  normalizedText: string;
  parserName: string;
  formulaFamilies: string[];
  formulaCount: number;
  ambiguityTypes: string[];
  metadata: {
    citation: string;
    deterministic_parser: string;
    modal_family_counts: Record<string, number>;
    parser_backend: string;
    segment_count: number;
    ambiguity_count: number;
  };
}

interface ResultFile {
  schemaVersion: string;
  results: ResultRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/modal-compiler-regex-compile-vectors.json');
  return JSON.parse(nodeFs.readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): ResultFile {
  const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'modal-compiler-regex-compile-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_compiler_regex_compile_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
    });
    if (proc.status !== 0) {
      throw new Error(`Python modal compiler regex compile runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as ResultFile;
  } finally {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function evaluateTs(vector: Vector): Omit<ResultRow, 'id'> {
  const compiler = new DeterministicModalCompiler({ parserBackend: 'regex' });
  const result = compiler.compile(vector.text, {
    documentId: vector.documentId,
    citation: vector.citation,
    source: vector.source,
  });

  return {
    normalizedText: result.normalizedText,
    parserName: result.parserName,
    formulaFamilies: result.modalIr.formulaFamilies,
    formulaCount: result.modalIr.formulaCount,
    ambiguityTypes: result.ambiguities.map(ambiguity => ambiguity.ambiguityType),
    metadata: {
      citation: String(result.metadata.citation ?? ''),
      deterministic_parser: String(result.metadata.deterministic_parser ?? ''),
      modal_family_counts: (result.metadata.modal_family_counts ?? {}) as Record<string, number>,
      parser_backend: String(result.metadata.parser_backend ?? ''),
      segment_count: Number(result.metadata.segment_count ?? 0),
      ambiguity_count: Number(result.metadata.ambiguity_count ?? 0),
    },
  };
}

describe('PORT-250 modal compiler regex compile family parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-compiler-regex-compile-vectors.json');
  const corpus = loadCorpus();

  it('matches Python legal parser family emission and missing-formula ambiguity behavior', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors.length).toBeGreaterThanOrEqual(6);

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const pyRow = pyById.get(vector.id);
      expect(pyRow).toBeDefined();
      expect(evaluateTs(vector)).toEqual({
        normalizedText: pyRow?.normalizedText,
        parserName: pyRow?.parserName,
        formulaFamilies: pyRow?.formulaFamilies,
        formulaCount: pyRow?.formulaCount,
        ambiguityTypes: pyRow?.ambiguityTypes,
        metadata: pyRow?.metadata,
      });
    }
  });
});
