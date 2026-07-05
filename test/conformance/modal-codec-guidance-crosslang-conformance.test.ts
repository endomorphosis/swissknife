import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  compilerGuidanceFrameAuditFeatures,
  compilerGuidanceFrameLogicTargetRoutes,
  compilerGuidanceImpliesFrameLogicTarget,
  compilerGuidanceImpliesNeo4jProjectionTarget,
  compilerGuidanceRouteFeatures,
  compilerGuidanceViewGapFeatures,
} from '../../src/services/modal-logic-codec';

interface GuidanceResult {
  routeFeatures: string[];
  viewGapFeatures: string[];
  neo4jProjectionTarget: boolean;
  frameLogicTargetRoutes: string[];
  frameLogicTarget: boolean;
  frameAuditFeatures: string[];
}

interface GuidanceVector {
  id: string;
  description?: string;
  guidance: Record<string, unknown>;
  expected: GuidanceResult;
}

interface GuidanceCorpus {
  schemaVersion: string;
  vectors: GuidanceVector[];
}

interface PyResultRow extends GuidanceResult {
  id: string;
}

interface PyResultFile {
  schemaVersion: string;
  results: PyResultRow[];
}

function loadCorpus(): GuidanceCorpus {
  const path = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-guidance-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')) as GuidanceCorpus;
}

function runPythonReference(corpusPath: string): PyResultFile {
  const tempDir = mkdtempSync(join(tmpdir(), 'modal-codec-guidance-py-'));
  const outPath = join(tempDir, 'py-results.json');
  try {
    const scriptPath = resolve(process.cwd(), '../implementation_plan/conformance/modal_codec_guidance_py_runner.py');
    const proc = spawnSync('python3', [scriptPath, '--vectors', corpusPath, '--out', outPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: resolve(process.cwd(), '../external/ipfs_datasets'),
      },
    });
    if (proc.status !== 0) {
      throw new Error(`Python modal codec guidance runner failed: ${proc.stderr || proc.stdout}`);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as PyResultFile;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function evaluateTs(guidance: Record<string, unknown>): GuidanceResult {
  return {
    routeFeatures: compilerGuidanceRouteFeatures(guidance),
    viewGapFeatures: compilerGuidanceViewGapFeatures(guidance),
    neo4jProjectionTarget: compilerGuidanceImpliesNeo4jProjectionTarget(guidance),
    frameLogicTargetRoutes: compilerGuidanceFrameLogicTargetRoutes(guidance).sort(),
    frameLogicTarget: compilerGuidanceImpliesFrameLogicTarget(guidance),
    frameAuditFeatures: compilerGuidanceFrameAuditFeatures(guidance),
  };
}

describe('PORT-246 modal codec compiler-guidance parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-guidance-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python outputs for route, target, view-gap, and frame-audit helpers', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors).toHaveLength(3);

    const pyResults = runPythonReference(corpusPath);
    const pyById = new Map(pyResults.results.map(row => [row.id, row]));

    for (const vector of corpus.vectors) {
      const ts = evaluateTs(vector.guidance);
      expect(ts).toEqual(vector.expected);

      const py = pyById.get(vector.id);
      expect(py).toBeDefined();
      expect(ts).toEqual({
        routeFeatures: py?.routeFeatures,
        viewGapFeatures: py?.viewGapFeatures,
        neo4jProjectionTarget: py?.neo4jProjectionTarget,
        frameLogicTargetRoutes: py?.frameLogicTargetRoutes,
        frameLogicTarget: py?.frameLogicTarget,
        frameAuditFeatures: py?.frameAuditFeatures,
      });
    }
  });
});
