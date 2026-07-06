/**
 * Browser-purity regression for the WASM/TypeScript prover surface.
 *
 * The browser-facing prover path must not statically import Node process,
 * filesystem, path, or crypto primitives. Native host binaries remain available
 * only through explicit injected runners.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { base64UrlEncode, sha256Hex } from '../../src/services/provers/browser-crypto';

const ROOT = resolve(__dirname, '../..');

const BROWSER_FACING_PROVER_FILES = [
  'src/services/mcp-wasm-prover-hub.ts',
  'src/services/flogic-ergoai-wrapper.ts',
  'src/services/bridge-multiview.ts',
  'src/services/bridge-types.ts',
  'src/services/cec-dcec-bridge.ts',
  'src/services/modal-compiler.ts',
  'src/services/modal-kg-bridge.ts',
  'src/services/modal-logic-codec.ts',
  'src/services/modal-synthesis.ts',
  'src/services/deontic-norms-bridge.ts',
  'src/services/deontic-formula-builder.ts',
  'src/services/fol-tdfol-bridge.ts',
  'src/services/tdfol-cec-bridge.ts',
  'src/services/temporal-deontic-api.ts',
  'src/services/temporal-deontic-rag-store.ts',
  'src/services/provers/mcp-proof-cache.ts',
  'src/services/provers/coq-jscoq-bridge.ts',
  'src/services/provers/lean4-wasm-bridge.ts',
  'src/services/provers/lurk-wasm-bridge.ts',
  'src/services/provers/multi-stark-bridge.ts',
  'src/services/zkp-attestation-bridge.ts',
  'src/services/zkp-circuits.ts',
  'src/services/zkp-onchain-pipeline.ts',
  'src/services/zkp-provekit-cache.ts',
  'src/services/zkp-provekit-public-inputs.ts',
  'src/services/zkp/zkp-simulated-prover.ts',
  'src/services/zkp/zkp-ucan-bridge.ts',
];

const FORBIDDEN_PATTERNS = [
  /from\s+['"]node:(child_process|fs|crypto|path|os)['"]/,
  /from\s+['"]crypto['"]/,
  /require\(['"]node:(child_process|fs|crypto|path|os)['"]\)/,
  /\b(execFileSync|spawnSync|appendFileSync|writeFileSync|mkdtempSync|unlinkSync|existsSync|createHash)\b/,
  /\bBuffer\.from\b/,
];

describe('WASM prover browser purity', () => {
  it('uses deterministic pure TypeScript sha256 and base64url helpers', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(base64UrlEncode('sphinx-proof')).toBe('c3BoaW54LXByb29m');
  });

  it.each(BROWSER_FACING_PROVER_FILES)('%s has no static Node host dependencies', file => {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });

  it('imports the browser-facing prover modules without host-native runners', async () => {
    await Promise.all([
      import('../../src/services/mcp-wasm-prover-hub'),
      import('../../src/services/flogic-ergoai-wrapper'),
      import('../../src/services/bridge-multiview'),
      import('../../src/services/bridge-types'),
      import('../../src/services/cec-dcec-bridge'),
      import('../../src/services/modal-compiler'),
      import('../../src/services/modal-kg-bridge'),
      import('../../src/services/modal-logic-codec'),
      import('../../src/services/modal-synthesis'),
      import('../../src/services/deontic-norms-bridge'),
      import('../../src/services/deontic-formula-builder'),
      import('../../src/services/fol-tdfol-bridge'),
      import('../../src/services/tdfol-cec-bridge'),
      import('../../src/services/temporal-deontic-api'),
      import('../../src/services/temporal-deontic-rag-store'),
      import('../../src/services/provers/mcp-proof-cache'),
      import('../../src/services/provers/coq-jscoq-bridge'),
      import('../../src/services/provers/lean4-wasm-bridge'),
      import('../../src/services/provers/lurk-wasm-bridge'),
      import('../../src/services/provers/multi-stark-bridge'),
      import('../../src/services/zkp-attestation-bridge'),
      import('../../src/services/zkp-circuits'),
      import('../../src/services/zkp-onchain-pipeline'),
      import('../../src/services/zkp-provekit-cache'),
      import('../../src/services/zkp-provekit-public-inputs'),
      import('../../src/services/zkp/zkp-simulated-prover'),
      import('../../src/services/zkp/zkp-ucan-bridge'),
    ]);
  });
});
