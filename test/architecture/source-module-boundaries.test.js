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
  'service-apps',
  'service-bridge',
  'service-deontic',
  'service-fol',
  'service-fol-utils',
  'service-glasses',
  'service-integrations',
  'service-ipfs',
  'service-mcp',
  'service-provers',
  'service-zkp',
  'services',
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

function writeFixtureFile(fixtureDir, relativePath, content) {
  const target = path.join(fixtureDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function createAuditFixture({ files = {}, manifestPatch = {} } = {}) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swissknife-source-boundary-fixture-'));
  fs.mkdirSync(path.join(fixtureDir, 'scripts'), { recursive: true });
  fs.copyFileSync(
    path.join(rootDir, 'scripts/audit-source-modules.mjs'),
    path.join(fixtureDir, 'scripts/audit-source-modules.mjs'),
  );

  const manifest = {
    schemaVersion: 1,
    manifestVersion: 'fixture',
    audit: {
      ignoredRootFiles: ['src/module-ownership.json'],
      rootFileOwners: {
        'src/commands.ts': 'commands',
      },
      serviceRootFileOwners: {
        'src/services/owned-root.ts': 'services',
      },
      legacyCompatibilityShims: [],
      allowedImportExceptions: [],
      browserSafeSourceGlobs: [
        'src/components/browser/*.tsx',
        'src/services/mcp/protocol.ts',
      ],
      browserSafeServiceFiles: [
        'src/services/mcp/protocol.ts',
      ],
      ...manifestPatch.audit,
    },
    modules: {
      commands: {
        owner: 'fixture-commands',
        path: 'src/commands',
        runtimeClassification: 'host-only',
        allowedImports: ['shared', 'utils'],
        forbiddenImports: ['entrypoints'],
        publicEntrypoints: ['src/commands.ts'],
        privateEntrypoints: [],
      },
      services: {
        owner: 'fixture-services',
        path: 'src/services',
        rootOnly: true,
        runtimeClassification: 'split',
        allowedImports: ['shared', 'utils'],
        forbiddenImports: ['commands', 'entrypoints'],
        publicEntrypoints: ['src/services/owned-root.ts'],
        privateEntrypoints: [],
      },
      'service-mcp': {
        owner: 'fixture-mcp',
        path: 'src/services/mcp',
        runtimeClassification: 'split',
        allowedImports: ['services', 'shared', 'utils'],
        forbiddenImports: ['commands', 'entrypoints'],
        publicEntrypoints: ['src/services/mcp/*.ts'],
        privateEntrypoints: [],
      },
      'components-browser': {
        owner: 'fixture-browser-ui',
        path: 'src/components/browser',
        runtimeClassification: 'browser-safe',
        allowedImports: ['shared', 'utils'],
        forbiddenImports: ['commands', 'entrypoints', 'services'],
        publicEntrypoints: ['src/components/browser/*.tsx'],
        privateEntrypoints: [],
      },
      shared: {
        owner: 'fixture-shared',
        path: 'src/shared',
        runtimeClassification: 'universal',
        allowedImports: ['shared'],
        forbiddenImports: ['commands', 'entrypoints', 'services', 'utils'],
        publicEntrypoints: ['src/shared/*.ts'],
        privateEntrypoints: [],
      },
      utils: {
        owner: 'fixture-utils',
        path: 'src/utils',
        runtimeClassification: 'universal',
        allowedImports: ['shared'],
        forbiddenImports: ['commands', 'entrypoints', 'services'],
        publicEntrypoints: ['src/utils/*.ts'],
        privateEntrypoints: [],
      },
      ...manifestPatch.modules,
    },
  };

  writeFixtureFile(fixtureDir, 'src/module-ownership.json', `${JSON.stringify(manifest, null, 2)}\n`);
  writeFixtureFile(fixtureDir, 'src/commands.ts', 'export const commandName = "fixture";\n');
  writeFixtureFile(fixtureDir, 'src/services/owned-root.ts', 'export const ownedRoot = true;\n');
  writeFixtureFile(fixtureDir, 'src/services/mcp/protocol.ts', 'export const protocol = true;\n');
  for (const [relativePath, content] of Object.entries(files)) {
    writeFixtureFile(fixtureDir, relativePath, content);
  }

  return fixtureDir;
}

function runFixtureAudit(fixtureDir, args = ['--fail-on-unknown', '--fail-on-forbidden']) {
  return childProcess.spawnSync(
    process.execPath,
    ['scripts/audit-source-modules.mjs', ...args],
    {
      cwd: fixtureDir,
      encoding: 'utf8',
    },
  );
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
      'service-bridge',
      'service-deontic',
      'service-fol',
      'service-fol-utils',
      'service-glasses',
      'service-integrations',
      'service-ipfs',
      'service-mcp',
      'service-provers',
      'service-zkp',
    ]) {
      expect(auditedModules.get(moduleName)?.fileCount).toBeGreaterThan(0);
    }

    expect(audit.summary.unknownFiles).toBe(0);
    expect(audit.summary.forbiddenImports).toBe(0);
    expect(audit.summary.ownershipConflicts).toBe(0);
    expect(audit.summary.browserUnsafeImports).toBe(0);
  });

  it('inventories every current root service source file explicitly', () => {
    const rootServiceFiles = fs.readdirSync(path.join(rootDir, 'src/services'))
      .filter(fileName => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(fileName))
      .map(fileName => `src/services/${fileName}`)
      .sort();
    const inventoriedRootServices = Object.keys(manifest.audit.serviceRootFileOwners).sort();

    expect(inventoriedRootServices).toEqual(rootServiceFiles);
    for (const [filePath, owner] of Object.entries(manifest.audit.serviceRootFileOwners)) {
      expect(filePath).toMatch(/^src\/services\/[^/]+\.[cm]?[jt]sx?$/);
      expect(owner).toBe('services');
    }
    expect(manifest.modules.services.rootOnly).toBe(true);
  });

  it('rejects new root service wrappers that are not in the ownership inventory', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/new-root-wrapper.ts': 'export const wrapper = true;\n',
      },
    });
    const result = runFixtureAudit(fixtureDir);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('root service file is not listed');
  });

  it('rejects unowned service subdirectories', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/new-family/implementation.ts': 'export const service = true;\n',
      },
    });
    const result = runFixtureAudit(fixtureDir);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('path is not listed in src/module-ownership.json');
  });

  it('rejects forbidden imports from service files', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/owned-root.ts': "import '../commands.js';\nexport const ownedRoot = true;\n",
      },
    });
    const result = runFixtureAudit(fixtureDir);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('services forbids imports from commands');
  });

  it('rejects browser-unsafe ownership drift in browser-facing service files', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/protocol.ts': "import fs from 'node:fs';\nexport const protocol = Boolean(fs);\n",
      },
    });
    const result = runFixtureAudit(fixtureDir);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('browser-safe ownership file imports a host-only Node builtin');
  });

  it('rejects browser-facing imports of services that are not browser-safe', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/host-only.ts': 'export const hostOnly = true;\n',
        'src/components/browser/View.tsx': "import '../../services/mcp/host-only.js';\nexport const View = null;\n",
      },
    });
    const result = runFixtureAudit(fixtureDir);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('not listed in audit.browserSafeServiceFiles');
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
