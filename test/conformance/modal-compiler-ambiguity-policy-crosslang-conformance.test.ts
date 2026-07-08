import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  compilerAmbiguityPolicyTargets,
  compilerRefinedModalFamilyCueMarginBuffer,
  compilerRequiredAdaptiveAmbiguityTargets,
  compilerWeakTypedSelfFamilyCueMarginBuffer,
  isCompilerAmbiguityPolicyPair,
  isCompilerRequiredAdaptiveAmbiguityPair,
  isPrioritySignalFreeAdaptiveAmbiguityPair,
  isSignalFreeAdaptiveAmbiguityPair,
  prefersContestedZeroMarginAdaptiveAmbiguityPair,
  prioritySignalFreeAdaptiveAmbiguityTargets,
  signalFreeAdaptiveAmbiguityTargets,
  supportsSignalFreeAdaptiveAmbiguityPair,
} from '../../src/services/modal-compiler';

interface Vector {
  id: string;
  predictedFamily: string;
  targetFamily: string;
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface ResultRow {
  id: string;
  priorityTargets: string[];
  requiredTargets: string[];
  signalFreeTargets: string[];
  policyTargets: string[];
  refinedMarginBuffer: number;
  weakTypedSelfMarginBuffer: number;
  isPrioritySignalFreePair: boolean;
  isCompilerRequiredPair: boolean;
  isCompilerAmbiguityPolicyPair: boolean;
  isSignalFreeAdaptivePair: boolean;
  prefersContestedZeroMarginPair: boolean;
  supportsSignalFreeAdaptivePair: boolean;
}

interface ResultFile {
  schemaVersion: string;
  results: ResultRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/modal-compiler-ambiguity-policy-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): ResultFile {
  const tempDir = mkdtempSync(join(tmpdir(), 'modal-compiler-policy-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_compiler_ambiguity_policy_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python modal compiler ambiguity policy runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as ResultFile;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function evaluateTs(vector: Vector): Omit<ResultRow, 'id'> {
  const { predictedFamily, targetFamily } = vector;
  return {
    priorityTargets: prioritySignalFreeAdaptiveAmbiguityTargets(predictedFamily),
    requiredTargets: compilerRequiredAdaptiveAmbiguityTargets(predictedFamily),
    signalFreeTargets: signalFreeAdaptiveAmbiguityTargets(predictedFamily),
    policyTargets: compilerAmbiguityPolicyTargets(predictedFamily),
    refinedMarginBuffer: compilerRefinedModalFamilyCueMarginBuffer(predictedFamily, targetFamily),
    weakTypedSelfMarginBuffer: compilerWeakTypedSelfFamilyCueMarginBuffer(predictedFamily, targetFamily),
    isPrioritySignalFreePair: isPrioritySignalFreeAdaptiveAmbiguityPair(predictedFamily, targetFamily),
    isCompilerRequiredPair: isCompilerRequiredAdaptiveAmbiguityPair(predictedFamily, targetFamily),
    isCompilerAmbiguityPolicyPair: isCompilerAmbiguityPolicyPair(predictedFamily, targetFamily),
    isSignalFreeAdaptivePair: isSignalFreeAdaptiveAmbiguityPair(predictedFamily, targetFamily),
    prefersContestedZeroMarginPair: prefersContestedZeroMarginAdaptiveAmbiguityPair(predictedFamily, targetFamily),
    supportsSignalFreeAdaptivePair: supportsSignalFreeAdaptiveAmbiguityPair(predictedFamily, targetFamily),
  };
}

describe('PORT-250 modal compiler ambiguity policy parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-compiler-ambiguity-policy-vectors.json');
  const corpus = loadCorpus();

  it('matches Python ambiguity target, pair, and margin helper outputs', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors.length).toBeGreaterThanOrEqual(6);

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const ts = evaluateTs(vector);
      const pyRow = pyById.get(vector.id);
      expect(pyRow).toBeDefined();
      expect(ts).toEqual({
        priorityTargets: pyRow?.priorityTargets,
        requiredTargets: pyRow?.requiredTargets,
        signalFreeTargets: pyRow?.signalFreeTargets,
        policyTargets: pyRow?.policyTargets,
        refinedMarginBuffer: pyRow?.refinedMarginBuffer,
        weakTypedSelfMarginBuffer: pyRow?.weakTypedSelfMarginBuffer,
        isPrioritySignalFreePair: pyRow?.isPrioritySignalFreePair,
        isCompilerRequiredPair: pyRow?.isCompilerRequiredPair,
        isCompilerAmbiguityPolicyPair: pyRow?.isCompilerAmbiguityPolicyPair,
        isSignalFreeAdaptivePair: pyRow?.isSignalFreeAdaptivePair,
        prefersContestedZeroMarginPair: pyRow?.prefersContestedZeroMarginPair,
        supportsSignalFreeAdaptivePair: pyRow?.supportsSignalFreeAdaptivePair,
      });
    }
  });
});
