const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');

function projectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('browser proof runtime evidence contract', () => {
  const evidence = JSON.parse(projectFile('docs/browser-proof-runtime-evidence.json'));
  const observedResult = JSON.parse(projectFile('test-results/browser-proof-runtime/observed-three-engine-runtime.json'));
  const runtimeConfig = projectFile('build-tools/configs/vitest.browser-proof-runtime.config.ts');
  const runtimeTests = projectFile('test/browser-proof-runtime/browser-theorem-runtime.test.ts');
  const runtimeRunner = projectFile('scripts/run-browser-proof-runtime.mjs');
  const schnorrSource = projectFile('src/services/zkp/zkp-browser-schnorr.ts');
  const wasmAssets = JSON.parse(projectFile('src/services/zkp/artifacts/browser-wasm-assets.json'));

  test('records a real three-engine runtime result without a fabricated proof blob', () => {
    expect(evidence.schema).toBe('swissknife.browser-proof-runtime-evidence-contract.v1');
    expect(evidence.task_id).toBe('SWR-139');
    expect(evidence.live_execution_attestation).toBe(true);
    expect(evidence.required_engines).toEqual(['chromium', 'firefox', 'webkit']);
    expect(evidence.observed_execution).toMatchObject({
      command: 'npm run test:browser-proof-runtime',
      outcome: 'passed',
      assertion_count: 81,
      assertions_per_engine: 27,
      engines: { chromium: 'passed', firefox: 'passed', webkit: 'passed' },
      generated_and_verified_artifacts: {
        theorem: { generation_kind: 'proved', verification_kind: 'valid', backend: 'typescript-truth-table' },
        zkp: { verification_result: true, backend: 'browser-schnorr-wasm', wasm_instantiated: true },
      },
    });
    expect(JSON.stringify(evidence)).not.toMatch(/proofData"\s*:\s*"[0-9a-f]+/i);
    expect(evidence.attestation_note).toMatch(/proof bytes.*not copied/i);
    expect(observedResult).toMatchObject({
      schema: 'swissknife.browser-proof-runtime-observed-result.v1',
      command: evidence.observed_execution.command,
      outcome: 'passed',
      assertion_count: evidence.observed_execution.assertion_count,
      assertions_per_engine: evidence.observed_execution.assertions_per_engine,
    });
    expect(observedResult.engines.map(engine => engine.name)).toEqual(evidence.required_engines);
    expect(observedResult.engines).toEqual(evidence.required_engines.map(name => ({
      name,
      outcome: 'passed',
      assertion_count: evidence.observed_execution.assertions_per_engine,
    })));
    expect(observedResult.source_fingerprints).toMatchObject({
      runtime_config_sha256: crypto.createHash('sha256').update(runtimeConfig).digest('hex'),
      runtime_test_sha256: crypto.createHash('sha256').update(runtimeTests).digest('hex'),
      runner_sha256: crypto.createHash('sha256').update(runtimeRunner).digest('hex'),
      vitest_output_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  test('ties the contract to the Playwright engines and the audited browser implementations', () => {
    for (const browser of evidence.required_engines) {
      expect(runtimeConfig).toContain(`browser: '${browser}'`);
    }
    expect(runtimeTests).toContain("describe('TypeScript theorem proof artifacts'");
    expect(runtimeTests).toContain("describe('browser WASM ZKP backend'");
    expect(runtimeTests).toContain('instantiateSchnorrWasmHelper');
    expect(runtimeTests).toContain('verifyDefaultBrowserZkpProof');
    expect(evidence.theorem_runtime.default_backend).toMatchObject({
      id: 'typescript-truth-table', execution: 'typescript',
    });
    expect(evidence.zkp_runtime.default_backend).toMatchObject({
      id: 'browser-schnorr-wasm', proof_system: 'schnorr-fiat-shamir',
    });
    const base64 = /BROWSER_SCHNORR_WASM_BASE64 = '([^']+)'/.exec(schnorrSource)?.[1];
    expect(base64).toBeDefined();
    const sha256 = crypto.createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');
    expect(evidence.zkp_runtime.default_backend.wasm_helper_sha256).toBe(sha256);
    const schnorrAsset = wasmAssets.assets.find(asset => asset.id === 'zkp.schnorr.field-helper.v1');
    expect(schnorrAsset?.integrity.sha256).toBe(sha256);
  });

  test('retains negative proof, worker, and backend-selection evidence', () => {
    expect(evidence.theorem_runtime.negative_cases.map(item => item.id)).toEqual(expect.arrayContaining([
      'refuted-formula', 'tampered-evaluation', 'malformed-formula-or-envelope',
    ]));
    expect(evidence.zkp_runtime.negative_cases).toEqual(expect.arrayContaining([
      'tampered statement', 'tampered response', 'malformed proof JSON', 'fabricated proof envelope',
    ]));
    expect(evidence.worker_boundary.failure_receipts).toEqual(expect.arrayContaining([
      'BROWSER_PROOF_WORKER_FAILED',
      'BROWSER_PROOF_WORKER_TIMEOUT',
      'BROWSER_PROOF_WORKER_PROTOCOL_ERROR',
    ]));
    expect(evidence.theorem_runtime.forbidden_or_unavailable_selection).toEqual(expect.arrayContaining([
      'simulated', 'python-reference-runner', 'host-native', 'mock-success',
    ]));
    expect(evidence.zkp_runtime.forbidden_default_selection).toEqual(expect.arrayContaining([
      'simulated', 'python-reference-runner', 'host-native', 'mock-success',
    ]));
  });
});
