import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function runCompare(pyEnvelope: unknown, tsEnvelope: unknown, vectors: unknown): { json: any; md: string } {
  const dir = mkdtempSync(join(tmpdir(), 'compare-conformance-'));
  const pyPath = join(dir, 'py.json');
  const tsPath = join(dir, 'ts.json');
  const vectorsDir = join(dir, 'vectors');
  const vectorsPath = join(vectorsDir, 'vectors.json');
  const outDir = join(dir, 'out');

  mkdirSync(vectorsDir, { recursive: true });
  writeFileSync(pyPath, JSON.stringify(pyEnvelope), 'utf8');
  writeFileSync(tsPath, JSON.stringify(tsEnvelope), 'utf8');
  writeFileSync(vectorsPath, JSON.stringify(vectors), 'utf8');

  const comparePath = resolve(__dirname, '../../../implementation_plan/conformance/compare.mjs');
  execFileSync('node', [comparePath, '--python', pyPath, '--ts', tsPath, '--vectors', vectorsDir, '--out-dir', outDir], {
    stdio: 'pipe',
  });

  const json = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));
  const md = readFileSync(join(outDir, 'report.md'), 'utf8');
  return { json, md };
}

describe('PORT-236 comparator hardening', () => {
  it('matches strict structured rows when status and structured signature align', () => {
    const py = {
      results: [
        {
          vectorId: 'strict-001',
          subsystem: 'fol',
          status: 'proved',
          reason: 'proved',
          proverId: 'fol-native',
          proofHash: 'proof-abc',
          derivationHash: 'derivation-abc',
          backendMode: 'simulated',
        },
      ],
    };
    const ts = JSON.parse(JSON.stringify(py));
    const vectors = {
      vectors: [
        {
          id: 'strict-001',
          expected: {
            status: 'proved',
            decided: true,
            strictStructuredParity: true,
          },
        },
      ],
    };

    const report = runCompare(py, ts, vectors).json;
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].outcome).toBe('MATCH');
    expect(report.rows[0].expectedStatusMatch).toBe(true);
    expect(report.rows[0].structuredArtifactMatch).toBe(true);
  });

  it('mismatches decided vectors when TS/Python agree but differ from expected.status', () => {
    const py = {
      results: [
        {
          vectorId: 'decided-expected-001',
          subsystem: 'temporal',
          status: 'sat',
          reason: 'sat',
          proverId: 'temporal-native',
          backendMode: 'simulated',
        },
      ],
    };
    const ts = JSON.parse(JSON.stringify(py));
    const vectors = {
      vectors: [
        {
          id: 'decided-expected-001',
          expected: {
            status: 'proved',
            decided: true,
          },
        },
      ],
    };

    const { json, md } = runCompare(py, ts, vectors);
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].expectedStatusMatch).toBe(false);
    expect(json.rows[0].outcome).toBe('MISMATCH');
    expect(md).toContain('expected-status mismatch (expected proved)');
  });

  it('mismatches strict decided rows when proof artifacts are absent', () => {
    const py = {
      results: [
        {
          vectorId: 'strict-artifact-001',
          subsystem: 'fol',
          status: 'proved',
          reason: 'proved',
          proverId: 'fol-native',
          backendMode: 'real',
        },
      ],
    };
    const ts = JSON.parse(JSON.stringify(py));
    const vectors = {
      vectors: [
        {
          id: 'strict-artifact-001',
          expected: {
            status: 'proved',
            decided: true,
            strictStructuredParity: true,
          },
        },
      ],
    };

    const { json, md } = runCompare(py, ts, vectors);
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].structuredArtifactMatch).toBe(false);
    expect(json.rows[0].structuredArtifactProblems).toEqual([
      'python.proofHash',
      'typescript.proofHash',
      'python.derivationHash',
      'typescript.derivationHash',
    ]);
    expect(json.rows[0].outcome).toBe('MISMATCH');
    expect(md).toContain('strict structured artifact missing');
  });
});
