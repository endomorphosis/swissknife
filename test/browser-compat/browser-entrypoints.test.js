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
  'src/ai/browser.ts',
  'src/models/browser.ts',
  'src/platform/browser.ts',
  'src/services/ipfs/browser.ts',
  'src/services/mcp/libp2p-browser-runtime.ts',
  'src/services/provers/browser-crypto.ts',
  'src/services/zkp-browser-schnorr.ts',
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
});
