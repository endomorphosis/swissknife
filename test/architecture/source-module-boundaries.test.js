const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../..');
const manifestPath = path.join(rootDir, 'src/module-ownership.json');
const docsPath = path.join(rootDir, 'docs/source-module-boundaries.md');

const expectedOutputModules = [
  'commands',
  'entrypoints',
  'components',
  'storage',
  'tasks',
  'workers',
  'utils',
  'shared',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function runSourceModuleAudit() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swissknife-source-modules-'));
  const outputPath = path.join(tempDir, 'audit.json');

  childProcess.execFileSync(
    process.execPath,
    [
      'scripts/audit-source-modules.mjs',
      '--fail-on-unknown',
      '--fail-on-forbidden',
      '--json',
      outputPath,
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  return readJson(outputPath);
}

describe('source module boundaries', () => {
  const manifest = readJson(manifestPath);
  const docs = fs.readFileSync(docsPath, 'utf8');

  it('documents ownership for every SWR-007 output directory', () => {
    for (const moduleName of expectedOutputModules) {
      const definition = manifest.modules[moduleName];
      expect(definition).toEqual(expect.any(Object));
      expect(definition.owner).toEqual(expect.any(String));
      expect(definition.purpose).toEqual(expect.any(String));
      expect(definition.runtimeClassification).toEqual(expect.any(String));
      expect(definition.allowedImports).toEqual(expect.any(Array));
      expect(definition.forbiddenImports).toEqual(expect.any(Array));
      expect(definition.publicEntrypoints.length).toBeGreaterThan(0);
      expect(fs.statSync(path.join(rootDir, definition.path)).isDirectory()).toBe(true);
      expect(docs).toContain(`\`${moduleName}\``);
    }
  });

  it('keeps host CLI, browser UI, storage, workers, and shared utilities in distinct layers', () => {
    expect(manifest.modules.commands.runtimeClassification).toBe('host-only');
    expect(manifest.modules.commands.browserReachability).toBe('forbidden');
    expect(manifest.modules.entrypoints.runtimeClassification).toBe('host-only');

    expect(manifest.modules.components.runtimeClassification).toBe('host-ui');
    expect(manifest.modules.hooks.runtimeClassification).toBe('host-ui');
    expect(manifest.modules.screens.runtimeClassification).toBe('host-ui');

    expect(manifest.modules['components-browser'].runtimeClassification).toBe('browser-safe');
    expect(manifest.modules['hooks-browser'].runtimeClassification).toBe('browser-safe');
    expect(manifest.modules['screens-browser'].runtimeClassification).toBe('browser-safe');

    expect(manifest.modules.storage.runtimeClassification).toBe('split');
    expect(manifest.modules.workers.runtimeClassification).toBe('split');
    expect(manifest.modules.shared.runtimeClassification).toBe('universal');
    expect(manifest.modules.utils.runtimeClassification).toBe('split');

    expect(manifest.modules.shared.allowedImports).toEqual(['shared']);
    expect(manifest.modules.shared.forbiddenImports).toEqual(expect.arrayContaining([
      'commands',
      'services',
      'storage',
      'tasks',
      'utils',
      'workers',
    ]));
    expect(manifest.modules.utils.allowedImports).toEqual(['shared']);
    expect(manifest.modules.utils.forbiddenImports).toEqual(expect.arrayContaining([
      'commands',
      'services',
      'storage',
      'tasks',
      'workers',
    ]));
  });

  it('assigns nested browser and service submodules with longest-path ownership', () => {
    const audit = runSourceModuleAudit();
    const auditedModules = new Map(audit.modules.map(item => [item.module, item]));

    for (const moduleName of [
      'components-browser',
      'hooks-browser',
      'screens-browser',
      'service-apps',
      'service-glasses',
      'service-ipfs',
      'service-mcp',
    ]) {
      expect(auditedModules.get(moduleName)?.fileCount).toBeGreaterThan(0);
    }

    expect(audit.summary.unknownFiles).toBe(0);
    expect(audit.summary.forbiddenImports).toBe(0);
  });

  it('keeps source boundary documentation aligned with the manifest and lint gate', () => {
    const packageJson = readJson(path.join(rootDir, 'package.json'));

    expect(docs).toContain('Dependency Direction');
    expect(docs).toContain('Browser UI');
    expect(docs).toContain('Host-only CLI code');
    expect(packageJson.scripts['lint:source-modules']).toContain('audit-source-modules.mjs');
    expect(packageJson.scripts.lint).toContain('lint:source-modules');
  });
});
