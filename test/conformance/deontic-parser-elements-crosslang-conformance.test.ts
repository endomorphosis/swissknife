import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { extractNormativeElements } from '../../src/services/deontic-legal-text-engine';

interface ExpectedFirst {
  deontic_operator: string;
  subject: string;
  action: string;
}

interface Vector {
  id: string;
  text: string;
  expected: {
    count: number;
    first: ExpectedFirst;
  };
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyResult {
  id: string;
  count: number;
  first: ExpectedFirst | null;
}

interface PyResults {
  schemaVersion: string;
  results: PyResult[];
}

function clean(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeSubject(subject: string): string {
  return clean(subject).toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[.;:,]+$/g, '');
}

function normalizeAction(action: string): string {
  return clean(action).toLowerCase().replace(/[.;:,]+$/g, '');
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/deontic-parser-elements-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = mkdtempSync(join(tmpdir(), 'deontic-elements-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic_parser_elements_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], { encoding: 'utf8' });
    if (proc.status !== 0) {
      throw new Error(`Python deontic parser elements runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('PORT-248 deontic parser normalized element parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic-parser-elements-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python normalized core fields for simple norms', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const tsElements = extractNormativeElements(vector.text);
      const tsFirst = tsElements[0]
        ? {
            deontic_operator: String(tsElements[0].deontic_operator ?? ''),
            subject: normalizeSubject(String(tsElements[0].subject ?? '')),
            action: normalizeAction(String(tsElements[0].action ?? tsElements[0].proposition ?? '')),
          }
        : null;

      expect(tsElements.length).toBe(vector.expected.count);
      expect(tsFirst).toEqual(vector.expected.first);

      const pyRow = pyById.get(vector.id);
      expect(pyRow).toBeDefined();
      expect(tsElements.length).toBe(pyRow?.count);
      expect(tsFirst).toEqual(pyRow?.first ?? null);
    }
  });
});
