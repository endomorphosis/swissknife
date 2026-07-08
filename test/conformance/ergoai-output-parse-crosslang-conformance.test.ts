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

import { parseErgoOutputBindings } from '../../src/services/integrations/flogic-ergoai-wrapper';

interface ErgoCorpusVector {
  id: string;
  runner: {
    stdout?: string;
  };
  expected: {
    bindings?: Array<Record<string, string>>;
  };
}

interface ErgoCorpusFile {
  schemaVersion: string;
  vectors: ErgoCorpusVector[];
}

interface PyResultRow {
  id: string;
  bindings: Array<Record<string, string>>;
}

interface PyResultFile {
  results: PyResultRow[];
}

function loadErgoCorpus(): ErgoCorpusFile {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/ergoai-vectors.json');
  return JSON.parse(nodeFs.readFileSync(corpusPath, 'utf8')) as ErgoCorpusFile;
}

describe('PORT-254 Ergo output parser parity corpus (cross-language)', () => {
  const corpus = loadErgoCorpus();

  it('matches Python parser bindings for all stdout-bearing vectors', () => {
    const cases = corpus.vectors
      .filter(vector => vector.runner.stdout !== undefined)
      .map(vector => ({ id: vector.id, output: vector.runner.stdout ?? '' }));

    const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'ergo-output-parse-crosslang-'));
    try {
      const inPath = join(tempDir, 'cases.json');
      const outPath = join(tempDir, 'results.json');
      nodeFs.writeFileSync(inPath, JSON.stringify({ cases }, null, 2), 'utf8');

      const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/ergoai_output_parse_py_runner.py');
      const proc = spawnSync('python3', [scriptPath, '--cases', inPath, '--out', outPath], { encoding: 'utf8' });
      if (proc.status !== 0) {
        throw new Error(`Python output parser runner failed: ${proc.stderr || proc.stdout}`);
      }

      const pyResults = JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as PyResultFile;
      const pyById = new Map(pyResults.results.map(row => [row.id, row.bindings]));

      for (const vector of corpus.vectors) {
        const stdout = vector.runner.stdout;
        if (stdout === undefined) continue;
        const tsBindings = parseErgoOutputBindings(stdout);
        expect(pyById.has(vector.id)).toBe(true);
        expect(tsBindings).toEqual(pyById.get(vector.id));

        if (vector.expected.bindings !== undefined) {
          expect(tsBindings).toEqual(vector.expected.bindings);
        }
      }
    } finally {
      nodeFs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
