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
  'src/services/deontic/browser-nlp.ts',
  'src/services/ipfs/ipfs-browser.ts',
  'src/services/mcp/browser-mcp.ts',
  'src/services/mcp/libp2p-browser-runtime.ts',
  'src/services/provers/browser-crypto.ts',
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
  './logic-language': './src/services/logic-language-pipeline.ts',
  './deontic-nlp': './src/services/deontic/browser-nlp.ts',
  './zkp': './src/services/zkp/browser-zkp.ts',
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
});
