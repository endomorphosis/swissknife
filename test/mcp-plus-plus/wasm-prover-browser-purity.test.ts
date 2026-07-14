/**
 * Browser-purity regression for the WASM/TypeScript prover surface.
 *
 * The browser-facing prover path must not statically import Node process,
 * filesystem, path, or crypto primitives. Native host binaries remain available
 * only through explicit injected runners.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { base64UrlEncode, sha256Hex } from '../../src/services/provers/browser-crypto';
import {
  DEFAULT_BROWSER_ZKP_BACKEND_ID,
  createDefaultBrowserZkpBackend,
  generateDefaultBrowserZkpProof,
  verifyDefaultBrowserZkpProof,
} from '../../src/services/zkp/browser-zkp';

const ROOT = resolve(__dirname, '../..');

const BROWSER_FACING_PROVER_FILES = [
  'src/services/mcp/mcp-wasm-prover-hub.ts',
  'src/services/integrations/flogic-ergoai-wrapper.ts',
  'src/services/logic/bridges/bridge-multiview.ts',
  'src/services/logic/bridges/bridge-types.ts',
  'src/services/logic/bridges/cec-dcec-bridge.ts',
  'src/services/logic/modal/modal-compiler.ts',
  'src/services/logic/modal/modal-kg-bridge.ts',
  'src/services/logic/modal/modal-logic-codec.ts',
  'src/services/logic/modal/modal-synthesis.ts',
  'src/services/logic/bridges/deontic-norms-bridge.ts',
  'src/services/logic/deontic/deontic-formula-builder.ts',
  'src/services/logic/bridges/fol-tdfol-bridge.ts',
  'src/services/logic/bridges/tdfol-cec-bridge.ts',
  'src/services/logic/tdfol/temporal-deontic-api.ts',
  'src/services/logic/tdfol/temporal-deontic-rag-store.ts',
  'src/services/integrations/flogic-zkp-integration.ts',
  'src/services/zkp/ethereum-zkp-bridge.ts',
  'src/services/zkp/zkp-attestation-bridge.ts',
  'src/services/zkp/zkp-circuits.ts',
  'src/services/zkp/zkp-onchain-pipeline.ts',
  'src/services/zkp/zkp-provekit-cache.ts',
  'src/services/zkp/zkp-provekit-public-inputs.ts',
  'src/services/zkp/zkp-statement.ts',
  'src/services/provers/mcp-proof-cache.ts',
  'src/services/provers/coq-jscoq-bridge.ts',
  'src/services/provers/lean4-wasm-bridge.ts',
  'src/services/provers/lurk-wasm-bridge.ts',
  'src/services/provers/multi-stark-bridge.ts',
  'src/services/zkp/zkp-ucan-bridge.ts',
  'src/services/zkp/zkp-browser-schnorr.ts',
  'src/services/zkp/browser-snarkjs-backend.ts',
  'src/services/zkp/browser-zkp-policy.ts',
  'src/services/zkp/browser-zkp.ts',
];

const UNIQUE_BROWSER_FACING_PROVER_FILES = [...new Set(BROWSER_FACING_PROVER_FILES)];

const FORBIDDEN_PATTERNS = [
  /from\s+['"]node:(child_process|fs|crypto|path|os)['"]/,
  /from\s+['"]crypto['"]/,
  /require\(['"]node:(child_process|fs|crypto|path|os)['"]\)/,
  /\b(execFileSync|spawnSync|appendFileSync|writeFileSync|mkdtempSync|unlinkSync|existsSync|createHash)\b/,
  /\bBuffer\.from\b/,
  /['"]\.\/zkp-backends(?:\.js)?['"]/,
];

const TRANSITIVE_FORBIDDEN_PATTERNS = [
  /from\s+['"]node:(child_process|fs|crypto|path|os)['"]/,
  /from\s+['"]crypto['"]/,
  /require\(['"]node:(child_process|fs|crypto|path|os)['"]\)/,
  /\bcreateHash\s*\(/,
  /\bBuffer\.from\s*\(/,
];

const FORBIDDEN_DEFAULT_SIMULATION_PATTERNS = [
  /from\s+['"][^'"]*zkp-simulated-prover(?:\.js)?['"]/,
  /new\s+ZkpSimulatedProver\s*\(/,
  /\bopts\.backend\s*\?\?\s*['"]simulated['"]/,
  /\bbackend\s*=\s*['"]simulated['"]/,
];

const STATIC_IMPORT_PATTERNS = [
  /\bimport\s+[^'"]*from\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const SERVICES_ROOT = resolve(ROOT, 'src/services');
const EXPLICIT_SIMULATED_ZKP_FIXTURES = [
  'test/mcp-plus-plus/fixtures/explicit-simulated-zkp-fixture.ts',
];

function localServiceImports(source: string): string[] {
  const imports = new Set<string>();
  for (const pattern of STATIC_IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const spec = String(match[1] ?? '').trim();
      if (spec.startsWith('.')) imports.add(spec);
    }
  }
  return [...imports];
}

function resolveServiceImport(fromAbsPath: string, spec: string): string | null {
  const root = resolve(dirname(fromAbsPath), spec);
  const candidates = [
    root,
    `${root}.ts`,
    `${root}.tsx`,
    `${root}.js`,
    resolve(root, 'index.ts'),
    resolve(root, 'index.tsx'),
    resolve(root, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (!candidate.startsWith(SERVICES_ROOT) || !existsSync(candidate)) continue;
    return candidate;
  }
  return null;
}

function reachableServiceFiles(entryRelativePaths: string[]): string[] {
  const queue = entryRelativePaths.map(path => resolve(ROOT, path));
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (!current.startsWith(SERVICES_ROOT) || seen.has(current)) continue;
    seen.add(current);
    const source = readFileSync(current, 'utf8');
    for (const spec of localServiceImports(source)) {
      const imported = resolveServiceImport(current, spec);
      if (imported && !seen.has(imported)) queue.push(imported);
    }
  }
  return [...seen];
}

describe('WASM prover browser purity', () => {
  it('uses deterministic pure TypeScript sha256 and base64url helpers', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(base64UrlEncode('sphinx-proof')).toBe('c3BoaW54LXByb29m');
  });

  it.each(UNIQUE_BROWSER_FACING_PROVER_FILES)('%s has no static Node host dependencies', file => {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });

  it.each(UNIQUE_BROWSER_FACING_PROVER_FILES)('%s does not opt into simulated ZKP defaults', file => {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    for (const pattern of FORBIDDEN_DEFAULT_SIMULATION_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });

  it('keeps simulated ZKP helpers out of browser-facing service imports', () => {
    const files = reachableServiceFiles(UNIQUE_BROWSER_FACING_PROVER_FILES);
    expect(files.map(file => file.replace(`${ROOT}/`, ''))).not.toContain('src/services/zkp/zkp-simulated-prover.ts');

    for (const fixture of EXPLICIT_SIMULATED_ZKP_FIXTURES) {
      const source = readFileSync(resolve(ROOT, fixture), 'utf8');
      expect(source).toMatch(/zkp-simulated-prover/);
      expect(source).toMatch(/explicit/i);
    }
  });

  it('uses the real browser Schnorr/WASM backend by default and rejects simulated proofs', async () => {
    expect(DEFAULT_BROWSER_ZKP_BACKEND_ID).toBe('browser-schnorr-wasm');
    expect(createDefaultBrowserZkpBackend().constructor.name).toBe('BrowserSchnorrZkpBackend');
    expect(() => createDefaultBrowserZkpBackend({ backend: 'simulated' })).toThrow(/test-only|real browser/i);

    const proof = await generateDefaultBrowserZkpProof(JSON.stringify({
      statement: 'O(log_access)',
      publicInputs: { policy: 'audit' },
      privateWitness: { derivation: ['axiom:audit', 'rule:obligation'] },
    }));
    const proofDict = proof.toDict();
    expect(proofDict.metadata).toMatchObject({ backend: 'browser-schnorr-wasm' });
    await expect(verifyDefaultBrowserZkpProof(JSON.stringify(proofDict))).resolves.toBe(true);

    await expect(verifyDefaultBrowserZkpProof(JSON.stringify({
      verifier_id: 'simulated-zkp-v0.1',
      backend: 'simulated',
      is_simulation: true,
      proof_b64: 'fixture',
    }))).resolves.toBe(false);
  });

  it('imports the browser-facing prover modules without host-native runners', async () => {
    await Promise.all([
      import('../../src/services/mcp/mcp-wasm-prover-hub'),
      import('../../src/services/integrations/flogic-ergoai-wrapper.js'),
      import('../../src/services/logic/bridges/bridge-multiview.js'),
      import('../../src/services/logic/bridges/bridge-types.js'),
      import('../../src/services/logic/bridges/cec-dcec-bridge.js'),
      import('../../src/services/logic/modal/modal-compiler.js'),
      import('../../src/services/logic/modal/modal-kg-bridge.js'),
      import('../../src/services/logic/modal/modal-logic-codec.js'),
      import('../../src/services/logic/modal/modal-synthesis.js'),
      import('../../src/services/logic/bridges/deontic-norms-bridge.js'),
      import('../../src/services/logic/deontic/deontic-formula-builder.js'),
      import('../../src/services/logic/bridges/fol-tdfol-bridge.js'),
      import('../../src/services/logic/bridges/tdfol-cec-bridge.js'),
      import('../../src/services/logic/tdfol/temporal-deontic-api.js'),
      import('../../src/services/logic/tdfol/temporal-deontic-rag-store.js'),
      import('../../src/services/integrations/flogic-zkp-integration.js'),
      import('../../src/services/zkp/ethereum-zkp-bridge.js'),
      import('../../src/services/zkp/zkp-attestation-bridge.js'),
      import('../../src/services/zkp/zkp-circuits.js'),
      import('../../src/services/zkp/zkp-onchain-pipeline.js'),
      import('../../src/services/zkp/zkp-provekit-cache.js'),
      import('../../src/services/zkp/zkp-provekit-public-inputs.js'),
      import('../../src/services/zkp/zkp-statement.js'),
      import('../../src/services/provers/mcp-proof-cache'),
      import('../../src/services/provers/coq-jscoq-bridge'),
      import('../../src/services/provers/lean4-wasm-bridge'),
      import('../../src/services/provers/lurk-wasm-bridge'),
      import('../../src/services/provers/multi-stark-bridge'),
      import('../../src/services/zkp/zkp-ucan-bridge'),
      import('../../src/services/zkp/zkp-browser-schnorr.js'),
      import('../../src/services/zkp/browser-snarkjs-backend'),
      import('../../src/services/zkp/browser-zkp-policy'),
      import('../../src/services/zkp/browser-zkp'),
    ]);
  });

  it('has no static Node host dependencies in transitive service imports', () => {
    const files = reachableServiceFiles(UNIQUE_BROWSER_FACING_PROVER_FILES);
    expect(files.length).toBeGreaterThanOrEqual(UNIQUE_BROWSER_FACING_PROVER_FILES.length);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of TRANSITIVE_FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
