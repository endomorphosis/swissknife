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
  compilerGuidanceFeatureStrings,
  compilerGuidanceFrameAuditFeatures,
  compilerGuidanceFrameLogicTargetRoutes,
  compilerGuidanceImpliesFrameLogicTarget,
  compilerGuidanceImpliesNeo4jProjectionTarget,
  compilerGuidanceRouteFeatures,
  compilerGuidanceViewGapFeatures,
} from '../../src/services/logic/modal/modal-logic-codec';

interface GuidanceResult {
  routeFeatures: string[];
  viewGapFeatures: string[];
  neo4jProjectionTarget: boolean;
  frameLogicTargetRoutes: string[];
  frameLogicTarget: boolean;
  frameAuditFeatures: string[];
  featureStrings: string[];
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
  return JSON.parse(nodeFs.readFileSync(path, 'utf8')) as GuidanceCorpus;
}

function runPythonReference(corpusPath: string): PyResultFile {
  const tempDir = nodeFs.mkdtempSync(join(tmpdir(), 'modal-codec-guidance-py-'));
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
    return JSON.parse(nodeFs.readFileSync(outPath, 'utf8')) as PyResultFile;
  } finally {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
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
    featureStrings: compilerGuidanceFeatureStrings(guidance),
  };
}

describe('PORT-246 modal codec compiler-guidance parity (cross-language)', () => {
  const corpusPath = resolve(process.cwd(), '../implementation_plan/conformance/modal-codec-guidance-vectors.json');
  const corpus = loadCorpus();

  it('matches expected and Python outputs for route, target, view-gap, and frame-audit helpers', () => {
    expect(corpus.schemaVersion).toBe('2026-07-05');
    expect(corpus.vectors).toHaveLength(4);

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
        featureStrings: py?.featureStrings,
      });
    }
  });
});
