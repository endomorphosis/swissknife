import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { TdfolProverBridge } from '../../src/services/provers/tdfol-prover-bridge';
import {
  Atom,
  Conjunction,
  Disjunction,
  Implies,
  Negation,
  Obligation,
  Permission,
  Prohibition,
  type DCECFormula,
} from '../../src/services/provers/provers-dcec-types.js';
import {
  Always,
  Eventually,
  Next,
  Release,
  Since,
  type TdfolFormula,
  Until,
} from '../../src/services/provers/provers-tdfol-types.js';

interface Vector {
  id: string;
  inputType: string;
  input: { tdfol?: { axioms?: string[]; goal?: string } };
  expected: { backendMode?: string };
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface PyRow {
  id: string;
  status: string;
  reason: string;
  proverId: string;
}

interface PyResults {
  schemaVersion: string;
  results: PyRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/vectors/tdfol-native-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): PyResults {
  const tempDir = mkdtempSync(join(tmpdir(), 'tdfol-native-crosslang-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/tdfol_native_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python TDFOL native runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResults;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function parseTdfolFormulaText(text: string): TdfolFormula {
  const source = String(text ?? '').trim();
  if (!source) throw new Error('empty formula');
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(source)) return Atom(source);

  const call = source.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/);
  if (!call) throw new Error(`unsupported TDFOL formula syntax: ${source}`);

  const op = String(call[1] ?? '').trim().toUpperCase();
  const argText = String(call[2] ?? '').trim();

  if (op === 'NOT') {
    const args = splitTopLevelArgs(argText, 1, op);
    return Negation(parseTdfolFormulaText(args[0]) as DCECFormula);
  }
  if (op === 'AND') {
    const args = splitTopLevelArgs(argText, 2, op);
    return Conjunction(parseTdfolFormulaText(args[0]) as DCECFormula, parseTdfolFormulaText(args[1]) as DCECFormula);
  }
  if (op === 'OR') {
    const args = splitTopLevelArgs(argText, 2, op);
    return Disjunction(parseTdfolFormulaText(args[0]) as DCECFormula, parseTdfolFormulaText(args[1]) as DCECFormula);
  }
  if (op === 'IMPLIES') {
    const args = splitTopLevelArgs(argText, 2, op);
    return Implies(parseTdfolFormulaText(args[0]) as DCECFormula, parseTdfolFormulaText(args[1]) as DCECFormula);
  }
  if (op === 'O') return Obligation(parseTdfolFormulaText(argText) as DCECFormula);
  if (op === 'P') return Permission(parseTdfolFormulaText(argText) as DCECFormula);
  if (op === 'F') return Prohibition(parseTdfolFormulaText(argText) as DCECFormula);

  if (op === 'ALWAYS' || op === 'G') return Always(parseTdfolFormulaText(argText));
  if (op === 'EVENTUALLY') return Eventually(parseTdfolFormulaText(argText));
  if (op === 'NEXT' || op === 'X') return Next(parseTdfolFormulaText(argText));
  if (op === 'UNTIL' || op === 'SINCE' || op === 'RELEASE') {
    const args = splitTopLevelArgs(argText, 2, op);
    const left = parseTdfolFormulaText(args[0]);
    const right = parseTdfolFormulaText(args[1]);
    if (op === 'UNTIL') return Until(left, right);
    if (op === 'SINCE') return Since(left, right);
    return Release(left, right);
  }

  throw new Error(`unsupported TDFOL operator: ${op}`);
}

function splitTopLevelArgs(args: string, expectedArity: number, operator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < args.length; index++) {
    const ch = args[index];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(args.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(args.slice(start).trim());
  const clean = parts.filter(Boolean);
  if (clean.length !== expectedArity) {
    throw new Error(`operator ${operator} expected ${expectedArity} arguments, got ${clean.length}`);
  }
  return clean;
}

async function runTsVector(vector: Vector): Promise<Pick<PyRow, 'status' | 'reason' | 'proverId'>> {
  const tdfol = vector.input.tdfol ?? {};
  const axioms = Array.isArray(tdfol.axioms)
    ? tdfol.axioms.map(item => String(item ?? '').trim()).filter(Boolean)
    : [];
  const goal = String(tdfol.goal ?? '').trim();

  if (!axioms.length) {
    return { status: 'unknown', reason: 'unknown', proverId: 'tdfol-native' };
  }

  const bridge = new TdfolProverBridge();
  const kb = axioms.map(parseTdfolFormulaText);
  const parsedGoal = goal ? parseTdfolFormulaText(goal) : kb[0];
  const proof = await bridge.prove(kb, parsedGoal);
  const reason = String(proof.reason ?? 'unknown');
  return { status: reason, reason, proverId: String(proof.prover_id ?? 'tdfol-native') };
}

describe('TDFOL native parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/vectors/tdfol-native-vectors.json');
  const corpus = loadCorpus();

  it('matches Python native TDFOL prover statuses on shared vectors', async () => {
    expect(corpus.vectors.length).toBeGreaterThanOrEqual(6);

    const targetVectors = corpus.vectors.filter(v => v.inputType === 'tdfol');
    expect(targetVectors.length).toBeGreaterThanOrEqual(6);
    for (const vector of targetVectors) {
      expect(vector.expected.backendMode).toBe('real');
    }

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row]));

    for (const vector of targetVectors) {
      const pyRow = pyById.get(vector.id);
      expect(pyRow).toBeDefined();
      const tsRow = await runTsVector(vector);
      expect(tsRow).toEqual({
        status: pyRow?.status,
        reason: pyRow?.reason,
        proverId: pyRow?.proverId,
      });
    }
  });
});
