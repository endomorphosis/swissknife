import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  deonticCopySlotValue,
  deonticFillEmptyField,
  deonticValueIsPresent,
} from '../../src/services/deontic-norms-bridge';

type VectorKind = 'value_is_present' | 'copy_slot_value' | 'fill_empty_field';

interface Vector {
  id: string;
  kind: VectorKind;
  value?: unknown;
  target?: Record<string, unknown>;
  source?: Record<string, unknown>;
  key?: string;
  expected: unknown;
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyRow {
  id: string;
  kind: VectorKind;
  output: unknown;
}

interface PyResults {
  schemaVersion: string;
  results: PyRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-fill-empty-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = mkdtempSync(join(tmpdir(), 'deontic-bridge-fill-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic_bridge_fill_empty_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python deontic bridge fill-empty runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runTs(vector: Vector): unknown {
  if (vector.kind === 'value_is_present') {
    return deonticValueIsPresent(vector.value);
  }
  if (vector.kind === 'copy_slot_value') {
    return deonticCopySlotValue(vector.value);
  }
  const target = { ...(vector.target ?? {}) };
  deonticFillEmptyField(target, vector.source ?? {}, vector.key ?? '');
  return target;
}

describe('PORT-249 deontic bridge fill-empty helper parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/deontic-bridge-fill-empty-vectors.json');
  const corpus = loadCorpus();

  it('matches expected outputs and Python fill/copy/presence helper behavior', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row.output]));

    for (const vector of corpus.vectors) {
      const ts = runTs(vector);
      expect(ts).toEqual(vector.expected);
      expect(ts).toEqual(pyById.get(vector.id));
    }
  });
});
