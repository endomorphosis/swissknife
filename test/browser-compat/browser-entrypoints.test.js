const fs = require('node:fs');
const path = require('node:path');
const {
  archivedAndBackupIgnorePatterns,
  browserCompatStaticTestMatch,
  fastTestMatch,
  serviceTestMatch,
} = require('../../config/jest/test-lanes.cjs');

const rootDir = path.resolve(__dirname, '../..');

const browserEntrypoints = [
  'src/browser.ts',
  'src/ai/browser.ts',
  'src/models/browser.ts',
  'src/platform/browser.ts',
  'src/services/logic/deontic/browser-nlp.ts',
  'src/services/ipfs/ipfs-browser.ts',
  'src/services/mcp/browser-mcp.ts',
  'src/services/mcp/libp2p-browser-runtime.ts',
  'src/services/proof-engine/proof-engine-browser.ts',
  'src/services/provers/browser-crypto.ts',
  'src/services/provers/provers-browser.ts',
  'src/services/zkp/zkp-browser-schnorr.ts',
  'src/services/zkp/browser-zkp.ts',
  'src/services/zkp/browser-snarkjs-backend.ts',
  'src/utils/browser.ts',
  'web/src/apps/app-manifest-loader.ts',
  'web/src/browser-main-simple.ts',
  'web/src/browser-main-working.ts',
  'web/src/swissknife-browser-core.ts',
];

const forbiddenHostModules = [
  'child_process',
  'cluster',
  'dgram',
  'dns',
  'fs',
  'net',
  'node:child_process',
  'node:cluster',
  'node:dgram',
  'node:dns',
  'node:fs',
  'node:net',
  'node:readline',
  'node:tls',
  'node:worker_threads',
  'readline',
  'tls',
  'worker_threads',
];

const expectedPackageBrowserExports = {
  '.': './src/browser.ts',
  './browser': './src/browser.ts',
  './mcp': './src/services/mcp/browser-mcp.ts',
  './mcp/libp2p': './src/services/mcp/libp2p-browser-runtime.ts',
  './libp2p': './src/services/mcp/libp2p-browser-runtime.ts',
  './ipfs': './src/services/ipfs/ipfs-browser.ts',
  './storage': './src/storage/browser.ts',
  './workers': './src/workers/browser.ts',
  './logic-language': './src/services/logic/api/reasoning-normalization-pipeline.ts',
  './deontic-nlp': './src/services/logic/deontic/browser-nlp.ts',
  './zkp': './src/services/zkp/browser-zkp.ts',
  './proof-engine': './src/services/proof-engine/proof-engine-browser.ts',
  './provers': './src/services/provers/provers-browser.ts',
};

const forbiddenBrowserExportPathPatterns = [
  /(?:^|\/)src\/services\/nlp-predicate-extractor\.ts$/,
  /(?:^|\/)src\/services\/spacy-wasm-nlp\.ts$/,
  /(?:^|\/)src\/services\/zkp-ucan-bridge\.ts$/,
  /(?:^|\/)src\/services\/ipfs\/host\.ts$/,
  /(?:^|\/)src\/storage\/host\.ts$/,
  /(?:^|\/)src\/workers\/host\.ts$/,
  /(?:^|\/)src\/services\/mcp\/mcp-remote-deontic-engine\.ts$/,
  /(?:^|\/)src\/services\/external-prover-wrappers\.ts$/,
  /(?:^|\/)src\/services\/external-provers\.ts$/,
  /(?:^|\/)src\/services\/prover-installer\.ts$/,
  /(?:^|\/)src\/services\/zkp-provekit-/,
  /(?:^|\/)src\/services\/proof-engine\/proof-engine-host\.ts$/,
  /(?:^|\/)src\/services\/provers\/(?:external-prover-wrappers|external-provers|prover-installer|provers-host)\.ts$/,
  /(?:^|\/)src\/services\/zkp\/(?:zkp-backends|zkp-host|zkp-simulated-prover|zkp-provekit-[^/]+)\.ts$/,
];

const forbiddenBrowserExportSpecifiers = [
  ...forbiddenHostModules,
  'pyodide',
  'ws',
];

const activeLaneMatches = [
  ...fastTestMatch,
  ...serviceTestMatch,
  ...browserCompatStaticTestMatch,
];

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function collectModuleSpecifiers(source) {
  const specifiers = [];
  const importExportPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const requirePattern = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const pattern of [importExportPattern, requirePattern, dynamicImportPattern]) {
    let match = pattern.exec(source);
    while (match) {
      specifiers.push(match[1]);
      match = pattern.exec(source);
    }
  }

  return specifiers;
}

function collectRuntimeModuleSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match) {
      specifiers.push(match[1]);
      match = pattern.exec(source);
    }
  }

  return specifiers;
}

function normalizePackageTarget(target) {
  return target.startsWith('./') ? target.slice(2) : target;
}

function resolveBrowserExportTarget(exportsEntry) {
  if (typeof exportsEntry === 'string') return exportsEntry;
  if (!exportsEntry || typeof exportsEntry !== 'object' || Array.isArray(exportsEntry)) return undefined;
  for (const condition of ['browser', 'import', 'default']) {
    const target = resolveBrowserExportTarget(exportsEntry[condition]);
    if (target) return target;
  }
  return undefined;
}

function candidatePaths(basePath) {
  const extension = path.extname(basePath);
  const candidates = [];
  if (extension) {
    candidates.push(basePath);
    if (extension === '.js' || extension === '.jsx' || extension === '.mjs') {
      const withoutExtension = basePath.slice(0, -extension.length);
      candidates.push(`${withoutExtension}.ts`, `${withoutExtension}.tsx`, `${withoutExtension}.jsx`);
    }
  } else {
    candidates.push(
      basePath,
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      `${basePath}.jsx`,
      path.join(basePath, 'index.ts'),
      path.join(basePath, 'index.tsx'),
      path.join(basePath, 'index.js'),
      path.join(basePath, 'index.jsx'),
    );
  }
  return [...new Set(candidates)];
}

function resolveLocalSpecifier(specifier, importerPath) {
  const cleanSpecifier = specifier.replace(/[?#].*$/, '');
  if (!cleanSpecifier.startsWith('.') && !cleanSpecifier.startsWith('/')) return null;
  const basePath = cleanSpecifier.startsWith('/')
    ? path.join(rootDir, 'web', cleanSpecifier.slice(1))
    : path.resolve(path.dirname(path.join(rootDir, importerPath)), cleanSpecifier);

  for (const candidate of candidatePaths(basePath)) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.relative(rootDir, candidate).split(path.sep).join('/');
    }
  }

  return null;
}

function collectBrowserExportGraph(entrypoint) {
  const visited = new Set();
  const imports = [];
  const stack = [entrypoint];

  while (stack.length > 0) {
    const relativePath = stack.pop();
    if (visited.has(relativePath)) continue;
    visited.add(relativePath);
    const source = readProjectFile(relativePath);

    for (const specifier of collectRuntimeModuleSpecifiers(source)) {
      imports.push({ importer: relativePath, specifier });
      const localTarget = resolveLocalSpecifier(specifier, relativePath);
      if (localTarget && !visited.has(localTarget)) {
        stack.push(localTarget);
      }
    }
  }

  return {
    files: Array.from(visited).sort(),
    imports,
  };
}

describe('browser compatibility lane', () => {
  it('keeps archived and backup files outside active Jest lanes', () => {
    expect(archivedAndBackupIgnorePatterns).toEqual(
      expect.arrayContaining([
        '<rootDir>/test/archived/',
        '<rootDir>/cleanup-archive/',
        '<rootDir>/emergency-archive/',
        '\\.bak$',
        '\\.backup$',
      ]),
    );

    for (const testPath of activeLaneMatches) {
      expect(testPath).not.toMatch(/archived|cleanup-archive|emergency-archive|backup-files/);
      expect(testPath).not.toMatch(/\.(bak|backup|old|orig|tmp)$/);
      expect(testPath).not.toMatch(/(?:_|-)timeout[-_]fixed\.test\.(js|ts)$/);
    }
  });

  it('does not route active npm gates through archived configs or backup tests', () => {
    const pkg = JSON.parse(readProjectFile('package.json'));
    const activeScripts = [
      'test',
      'test:fast',
      'test:service',
      'test:browser-compat',
      'test:browser-compat:static',
      'test:browser-compat:runtime',
      'test:e2e',
      'test:e2e:mcp',
      'test:release',
      'release:prepare',
    ];

    for (const scriptName of activeScripts) {
      const script = pkg.scripts[scriptName];
      expect(script).toEqual(expect.any(String));
      expect(script).not.toMatch(/cleanup-archive|emergency-archive|config\/archive|test\/archived/);
      expect(script).not.toMatch(/\.(bak|backup|old|orig|tmp)(?:\s|$)/);
    }
  });

  it('only lists browser entrypoints that still live in the active source tree', () => {
    // SWR-029 guardrail: SWR-026 archives corrupt/superseded web files under
    // `web/legacy-archive/`. If a future cleanup archives one of the paths
    // below without updating this list, fail with a clear assertion message
    // instead of a raw ENOENT from readFileSync deep in the next test.
    for (const relativePath of browserEntrypoints) {
      expect(relativePath).not.toMatch(/legacy-archive/);
      const exists = fs.existsSync(path.join(rootDir, relativePath));
      expect({ relativePath, exists }).toEqual({ relativePath, exists: true });
    }
  });

  it('keeps browser entrypoints free of host-only imports', () => {
    for (const relativePath of browserEntrypoints) {
      const source = readProjectFile(relativePath);
      const specifiers = collectModuleSpecifiers(source);
      expect(specifiers).not.toEqual(expect.arrayContaining(forbiddenHostModules));
    }
  });

  it('locks package browser exports to audited browser-safe entrypoints', () => {
    const pkg = JSON.parse(readProjectFile('package.json'));
    expect(pkg.browser).toBe('./src/browser.ts');
    expect(pkg.files).toEqual(expect.arrayContaining([
      'src',
      'docs/browser-distribution-policy.md',
    ]));

    for (const [subpath, expectedTarget] of Object.entries(expectedPackageBrowserExports)) {
      const actualTarget = resolveBrowserExportTarget(pkg.exports[subpath]);
      expect({ subpath, actualTarget }).toEqual({ subpath, actualTarget: expectedTarget });
      expect(fs.existsSync(path.join(rootDir, normalizePackageTarget(actualTarget)))).toBe(true);
    }

    // Both spellings predate the family ownership manifest. They are public
    // compatibility aliases, not two browser libp2p implementations.
    expect(resolveBrowserExportTarget(pkg.exports['./libp2p']))
      .toBe(resolveBrowserExportTarget(pkg.exports['./mcp/libp2p']));
    expect(pkg.exports['./browser'].types).toBe('./src/browser.ts');
    expect(pkg.exports['./mcp'].types).toBe('./src/services/mcp/browser-mcp.ts');
  });

  it('keeps package browser export graphs free of host-only modules and quarantined adapters', () => {
    const pkg = JSON.parse(readProjectFile('package.json'));

    for (const subpath of Object.keys(expectedPackageBrowserExports)) {
      const target = normalizePackageTarget(resolveBrowserExportTarget(pkg.exports[subpath]));
      const graph = collectBrowserExportGraph(target);

      for (const filePath of graph.files) {
        for (const forbiddenPattern of forbiddenBrowserExportPathPatterns) {
          expect(filePath).not.toMatch(forbiddenPattern);
        }
      }

      for (const item of graph.imports) {
        expect({ subpath, ...item }).not.toEqual(
          expect.objectContaining({
            specifier: expect.stringMatching(new RegExp(`^(node:)?(${forbiddenBrowserExportSpecifiers.join('|')})$`)),
          }),
        );
      }
    }
  });

  it('preserves real default libp2p, typed remote MCP, and TS/WASM-only proof selection', () => {
    const libp2p = readProjectFile('src/services/mcp/libp2p-browser-runtime.ts');
    expect(libp2p).toMatch(/return value !== false/);
    expect(libp2p).toMatch(/defaultEnabled:\s*true/);
    expect(libp2p).toMatch(/simulatedTransports:\s*false/);
    for (const packageName of [
      '@libp2p/webrtc',
      '@libp2p/websockets',
      '@libp2p/circuit-relay-v2',
      '@chainsafe/libp2p-noise',
      '@chainsafe/libp2p-yamux',
    ]) {
      expect(libp2p).toContain(`import('${packageName}')`);
    }

    const remoteGateway = readProjectFile('src/services/mcp/agent-supervisor-console-gateway.ts');
    expect(remoteGateway).toContain('interface AgentSupervisorGatewayTransport');
    expect(remoteGateway).toContain("const READ_TRANSPORTS = ['mcp', 'mcp++', 'libp2p']");
    expect(remoteGateway).toContain('createUnavailableAgentSupervisorTransport()');
    expect(remoteGateway).toContain("'transport_unavailable'");
    expect(remoteGateway).not.toMatch(/(?:child_process|spawn\s*\(|execFile\s*\(|python(?:3)?\s+-m)/i);

    const theorem = readProjectFile('src/services/provers/provers-browser.ts');
    expect(theorem).toContain("DEFAULT_BROWSER_PROVER_BACKEND = 'typescript-truth-table'");
    expect(theorem).toContain("execution: 'typescript'");
    expect(theorem).toContain("code: 'BROWSER_PROVER_BACKEND_UNAVAILABLE'");

    const zkp = readProjectFile('src/services/zkp/browser-zkp.ts');
    const schnorr = readProjectFile('src/services/zkp/zkp-browser-schnorr.ts');
    expect(zkp).toContain('DEFAULT_BROWSER_ZKP_BACKEND_ID = BROWSER_SCHNORR_BACKEND_ID');
    expect(zkp).toContain('assertProductionBrowserZkpBackendId');
    expect(schnorr).toContain('WebAssembly.instantiate(BROWSER_SCHNORR_WASM_BYTES)');
  });

  it('records live canonical browser closure evidence rather than a path-only inventory', () => {
    const inventory = readProjectFile('docs/browser-compatibility-inventory.md');
    expect(inventory).toContain('## Canonical Browser Public API Closure');
    expect(inventory).toContain('This is a live source-and-graph check');
    expect(inventory).toContain('`typed-remote-mcp-boundary`');
    expect(inventory).toContain('`typescript-theorem-default`');
    expect(inventory).toContain('`wasm-zkp-instantiation`');
    expect(inventory).toContain('Canonical package browser export violations: 0');
  });
});
