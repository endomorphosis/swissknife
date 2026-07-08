/**
 * Browser-purity regression for the WASM/TypeScript service surfaces.
 *
 * Browser-facing paths must not statically import Node process, filesystem,
 * path, or crypto primitives. Native host binaries remain available only
 * through explicit host entrypoints or injected runners.
 */

import { dirname, resolve } from 'node:path';
import { base64UrlDecode, base64UrlEncode, md5Hex, sha256Hex } from '../../src/services/shared/browser-crypto';

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

const BROWSER_FACING_SERVICE_FILES = [
  'src/services/mcp/mcp-wasm-prover-hub.ts',
  'src/services/mcp/browser.ts',
  'src/services/mcp/libp2p-browser-runtime.ts',
  'src/services/mcp/mcp-deontic-interface-broker.ts',
  'src/services/mcp/mcp-descriptor-inspector.ts',
  'src/services/mcp/mcp-descriptor-trust.ts',
  'src/services/mcp/mcp-discovery.ts',
  'src/services/mcp/mcp-generated-app-quality-gates.ts',
  'src/services/mcp/mcp-generated-app-state.ts',
  'src/services/mcp/mcp-idl.ts',
  'src/services/mcp/mcp-interface-registry.ts',
  'src/services/mcp/mcp-ipfs-ui-descriptors.ts',
  'src/services/mcp/mcp-orb-capability-router.ts',
  'src/services/mcp/mcp-envelope.ts',
  'src/services/mcp/mcp-p2p-session.ts',
  'src/services/mcp/mcp-pubsub-bus.ts',
  'src/services/mcp/mcp-scheduler.ts',
  'src/services/mcp/mcp-transport.ts',
  'src/services/mcp/policy-audit-log.ts',
  'src/services/mcp/swissknife-mcp-capability-registry.ts',
  'src/services/integrations/flogic-ergoai-wrapper.ts',
  'src/services/logic/bridges/bridge-multiview.ts',
  'src/services/logic/shared/bridge-types.ts',
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
  'src/services/zkp/groth16-cec-expansion.ts',
  'src/services/zkp/browser.ts',
  'src/services/zkp/zkp-attestation-bridge.ts',
  'src/services/zkp/zkp-circuits.ts',
  'src/services/zkp/zkp-canonicalization-runtime.ts',
  'src/services/zkp/zkp-onchain-pipeline.ts',
  'src/services/zkp/zkp-provekit-cache.ts',
  'src/services/zkp/zkp-provekit-public-inputs.ts',
  'src/services/zkp/zkp-statement.ts',
  'src/services/provers/mcp-proof-cache.ts',
  'src/services/provers/browser.ts',
  'src/services/provers/coq-jscoq-bridge.ts',
  'src/services/provers/lean4-wasm-bridge.ts',
  'src/services/provers/lurk-wasm-bridge.ts',
  'src/services/provers/multi-stark-bridge.ts',
  'src/services/zkp/zkp-simulated-prover.ts',
  'src/services/zkp/zkp-ucan-bridge.ts',
  'src/services/zkp/zkp-browser-schnorr.ts',
  'src/services/zkp/browser-snarkjs-backend.ts',
  'src/services/platform/browser.ts',
];

const UNIQUE_BROWSER_FACING_SERVICE_FILES = [...new Set(BROWSER_FACING_SERVICE_FILES)];

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
  /\bexport\s+[^'"]*from\s+['"]([^'"]+)['"]/g,
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
    root.replace(/\.js$/, '.ts'),
    root.replace(/\.js$/, '.tsx'),
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
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(base64UrlEncode('sphinx-proof')).toBe('c3BoaW54LXByb29m');
    expect(new TextDecoder().decode(base64UrlDecode('c3BoaW54LXByb29m'))).toBe('sphinx-proof');
  });

  it('builds browser libp2p defaults with real transports and GossipSub', async () => {
    const { createMcpLibp2pConfig } = await import('../../src/services/mcp/libp2p-browser-runtime');
    const { enabled, unavailable } = await createMcpLibp2pConfig({
      bootstrapMultiaddrs: ['/ip4/127.0.0.1/tcp/4001/ws/p2p/12D3KooWMockPeer'],
      mdns: false,
      dht: false,
    });
    expect(enabled.transports).toEqual(expect.arrayContaining(['websockets', 'webrtc']));
    expect(enabled.services).toEqual(expect.arrayContaining(['noise', 'yamux', 'identify', 'gossipsub']));
    expect(enabled.peerDiscovery).toContain('bootstrap');
    expect(unavailable).toHaveLength(0);
  });

  it.each(UNIQUE_BROWSER_FACING_SERVICE_FILES)('%s has no static Node host dependencies', file => {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });

  it('imports the browser-facing prover modules without host-native runners', async () => {
    await Promise.all([
      import('../../src/services/mcp/mcp-wasm-prover-hub'),
      import('../../src/services/mcp/browser'),
      import('../../src/services/mcp/libp2p-browser-runtime'),
      import('../../src/services/mcp/mcp-deontic-interface-broker'),
      import('../../src/services/mcp/mcp-descriptor-inspector'),
      import('../../src/services/mcp/mcp-descriptor-trust'),
      import('../../src/services/mcp/mcp-discovery'),
      import('../../src/services/mcp/mcp-generated-app-quality-gates'),
      import('../../src/services/mcp/mcp-generated-app-state'),
      import('../../src/services/mcp/mcp-idl'),
      import('../../src/services/mcp/mcp-interface-registry'),
      import('../../src/services/mcp/mcp-ipfs-ui-descriptors'),
      import('../../src/services/mcp/mcp-orb-capability-router'),
      import('../../src/services/mcp/mcp-envelope'),
      import('../../src/services/mcp/mcp-p2p-session'),
      import('../../src/services/mcp/mcp-pubsub-bus'),
      import('../../src/services/mcp/mcp-scheduler'),
      import('../../src/services/mcp/mcp-transport'),
      import('../../src/services/mcp/policy-audit-log'),
      import('../../src/services/mcp/swissknife-mcp-capability-registry'),
      import('../../src/services/integrations/flogic-ergoai-wrapper'),
      import('../../src/services/logic/bridges/bridge-multiview'),
      import('../../src/services/logic/shared/bridge-types'),
      import('../../src/services/logic/bridges/cec-dcec-bridge'),
      import('../../src/services/logic/modal/modal-compiler'),
      import('../../src/services/logic/modal/modal-kg-bridge'),
      import('../../src/services/logic/modal/modal-logic-codec'),
      import('../../src/services/logic/modal/modal-synthesis'),
      import('../../src/services/logic/bridges/deontic-norms-bridge'),
      import('../../src/services/logic/deontic/deontic-formula-builder'),
      import('../../src/services/logic/bridges/fol-tdfol-bridge'),
      import('../../src/services/logic/bridges/tdfol-cec-bridge'),
      import('../../src/services/logic/tdfol/temporal-deontic-api'),
      import('../../src/services/logic/tdfol/temporal-deontic-rag-store'),
      import('../../src/services/integrations/flogic-zkp-integration'),
      import('../../src/services/zkp/ethereum-zkp-bridge'),
      import('../../src/services/zkp/groth16-cec-expansion'),
      import('../../src/services/zkp/browser'),
      import('../../src/services/zkp/zkp-attestation-bridge'),
      import('../../src/services/zkp/zkp-circuits'),
      import('../../src/services/zkp/zkp-canonicalization-runtime'),
      import('../../src/services/zkp/zkp-onchain-pipeline'),
      import('../../src/services/zkp/zkp-provekit-cache'),
      import('../../src/services/zkp/zkp-provekit-public-inputs'),
      import('../../src/services/zkp/zkp-statement'),
      import('../../src/services/provers/mcp-proof-cache'),
      import('../../src/services/provers/browser'),
      import('../../src/services/provers/coq-jscoq-bridge'),
      import('../../src/services/provers/lean4-wasm-bridge'),
      import('../../src/services/provers/lurk-wasm-bridge'),
      import('../../src/services/provers/multi-stark-bridge'),
      import('../../src/services/zkp/zkp-simulated-prover'),
      import('../../src/services/zkp/zkp-ucan-bridge'),
      import('../../src/services/zkp/zkp-browser-schnorr'),
      import('../../src/services/zkp/browser-snarkjs-backend'),
      import('../../src/services/platform/browser'),
    ]);
  });

  it('has no static Node host dependencies in transitive service imports', () => {
    const files = reachableServiceFiles(UNIQUE_BROWSER_FACING_SERVICE_FILES);
    expect(files.length).toBeGreaterThanOrEqual(UNIQUE_BROWSER_FACING_SERVICE_FILES.length);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of TRANSITIVE_FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
