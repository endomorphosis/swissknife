import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  applyCompilerGuidanceSurfaceOverlay,
  compilerGuidanceFeatureStrings,
  compilerGuidanceSummary,
  compilerGuidanceSurfaceOverlayTerms,
  numericDistribution,
  numericSignedMapping,
  sourceCopyRewardHackPenalty,
  sourceGroundedGuidanceSurfaceOverlayTerms,
} from '../../src/services/modal-logic-codec';

interface Vector {
  id: string;
  guidance: Record<string, unknown>;
  numericDistribution?: Record<string, unknown>;
  numericSignedMapping?: Record<string, unknown>;
  sourceText?: string;
  structuralDecodedText?: string;
  sourceCopyPenalty?: {
    sourceSpanCopyRatio: number;
    textReconstructionSimilarity: number;
    structuralTextSimilarity: number;
  };
}

interface Corpus {
  schemaVersion: string;
  vectors: Vector[];
}

interface ResultRow {
  id: string;
  numericDistribution: Record<string, number>;
  numericSignedMapping: Record<string, number>;
  guidanceSummary: Record<string, unknown>;
  featureStrings: string[];
  surfaceOverlayTerms: string[];
  sourceGroundedSurfaceOverlayTerms: string[];
  appliedSurfaceOverlay: string;
  sourceCopyRewardHackPenalty: number;
}

interface ResultFile {
  schemaVersion: string;
  results: ResultRow[];
}

function loadCorpus(): Corpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-guidance-summary-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

function runPythonReference(corpusPath: string): ResultFile {
  const tempDir = mkdtempSync(join(tmpdir(), 'modal-codec-guidance-summary-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_codec_guidance_summary_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python modal codec guidance summary runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as ResultFile;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function evaluateTs(vector: Vector): Omit<ResultRow, 'id'> {
  const guidanceSummary = compilerGuidanceSummary(vector.guidance);
  const surfaceOverlayTerms = compilerGuidanceSurfaceOverlayTerms(guidanceSummary);
  const sourceText = vector.sourceText ?? '';
  const penalty = vector.sourceCopyPenalty ?? {
    sourceSpanCopyRatio: 0,
    textReconstructionSimilarity: 0,
    structuralTextSimilarity: 0,
  };
  return {
    numericDistribution: numericDistribution(vector.numericDistribution ?? {}),
    numericSignedMapping: numericSignedMapping(vector.numericSignedMapping ?? {}),
    guidanceSummary,
    featureStrings: compilerGuidanceFeatureStrings(guidanceSummary),
    surfaceOverlayTerms,
    sourceGroundedSurfaceOverlayTerms: sourceGroundedGuidanceSurfaceOverlayTerms(surfaceOverlayTerms, sourceText),
    appliedSurfaceOverlay: applyCompilerGuidanceSurfaceOverlay(
      vector.structuralDecodedText ?? '',
      surfaceOverlayTerms,
      sourceText,
    ),
    sourceCopyRewardHackPenalty: sourceCopyRewardHackPenalty(penalty),
  };
}

describe('PORT-246 modal codec guidance summary parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-guidance-summary-vectors.json');
  const corpus = loadCorpus();

  it('matches Python summary, overlay, numeric mapping, and source-copy penalty helpers', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors.length).toBeGreaterThanOrEqual(2);

    const py = runPythonReference(corpusPath);
    const pyById = new Map(py.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const ts = evaluateTs(vector);
      const pyRow = pyById.get(vector.id);
      expect(pyRow).toBeDefined();
      expect(ts).toEqual({
        numericDistribution: pyRow?.numericDistribution,
        numericSignedMapping: pyRow?.numericSignedMapping,
        guidanceSummary: pyRow?.guidanceSummary,
        featureStrings: pyRow?.featureStrings,
        surfaceOverlayTerms: pyRow?.surfaceOverlayTerms,
        sourceGroundedSurfaceOverlayTerms: pyRow?.sourceGroundedSurfaceOverlayTerms,
        appliedSurfaceOverlay: pyRow?.appliedSurfaceOverlay,
        sourceCopyRewardHackPenalty: pyRow?.sourceCopyRewardHackPenalty,
      });
    }
  });
});
