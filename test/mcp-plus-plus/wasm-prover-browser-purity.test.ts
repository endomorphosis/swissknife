/**
 * Browser-purity regression for the WASM/TypeScript prover surface.
 *
 * The browser-facing prover path must not statically import Node process,
 * filesystem, path, or crypto primitives. Native host binaries remain available
 * only through explicit injected runners.
 */

import { dirname, resolve } from 'node:path';
import { base64UrlEncode, sha256Hex } from '../../src/services/provers/browser-crypto';

const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
} | undefined;

if (!nodeFs) {
  throw new Error('node:fs builtin module is required for browser-purity source inspection');
}

const { existsSync, readFileSync } = nodeFs;
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
  'src/services/flogic-zkp-integration.ts',
  'src/services/sprint68-eth-bridge.ts',
  'src/services/zkp-attestation-bridge.ts',
  'src/services/zkp-circuits.ts',
  'src/services/zkp-onchain-pipeline.ts',
  'src/services/zkp-provekit-cache.ts',
  'src/services/zkp-provekit-public-inputs.ts',
  'src/services/zkp-statement.ts',
  'src/services/provers/mcp-proof-cache.ts',
  'src/services/provers/coq-jscoq-bridge.ts',
  'src/services/provers/lean4-wasm-bridge.ts',
  'src/services/provers/lurk-wasm-bridge.ts',
  'src/services/provers/multi-stark-bridge.ts',
  'src/services/zkp/zkp-simulated-prover.ts',
  'src/services/zkp/zkp-ucan-bridge.ts',
  'src/services/zkp-browser-schnorr.ts',
  'src/services/zkp/browser-snarkjs-backend.ts',
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

const STATIC_IMPORT_PATTERNS = [
  /\bimport\s+[^'"]*from\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const SERVICES_ROOT = resolve(ROOT, 'src/services');

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
      import('../../src/services/flogic-zkp-integration'),
      import('../../src/services/sprint68-eth-bridge'),
      import('../../src/services/zkp-attestation-bridge'),
      import('../../src/services/zkp-circuits'),
      import('../../src/services/zkp-onchain-pipeline'),
      import('../../src/services/zkp-provekit-cache'),
      import('../../src/services/zkp-provekit-public-inputs'),
      import('../../src/services/zkp-statement'),
      import('../../src/services/provers/mcp-proof-cache'),
      import('../../src/services/provers/coq-jscoq-bridge'),
      import('../../src/services/provers/lean4-wasm-bridge'),
      import('../../src/services/provers/lurk-wasm-bridge'),
      import('../../src/services/provers/multi-stark-bridge'),
      import('../../src/services/zkp/zkp-simulated-prover'),
      import('../../src/services/zkp/zkp-ucan-bridge'),
      import('../../src/services/zkp-browser-schnorr'),
      import('../../src/services/zkp/browser-snarkjs-backend'),
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
