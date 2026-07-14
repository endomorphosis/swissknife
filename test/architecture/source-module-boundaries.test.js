const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../..');
const manifestPath = path.join(rootDir, 'src/module-ownership.json');
const docsPath = path.join(rootDir, 'docs/source-module-boundaries.md');
const servicePublicApiDocsPath = path.join(rootDir, 'docs/service-module-public-api.md');

const expectedOutputModules = [
  'commands',
  'entrypoints',
  'components',
  'service-apps',
  'service-glasses',
  'service-integrations',
  'service-ipfs',
  'service-logic',
  'service-mcp',
  'service-platform',
  'service-proof-engine',
  'service-provers',
  'service-shared',
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
      serviceRootFileOwners: {},
      legacyCompatibilityShims: [],
      allowedImportExceptions: [],
      browserSafeSourceGlobs: [
        'src/components/browser/*.tsx',
        'src/services/mcp/protocol.ts',
      ],
      browserSafeServiceFiles: [
        'src/services/mcp/protocol.ts',
      ],
      documentedServiceDeepImports: [],
      browserPublicEntrypoints: [],
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
        publicEntrypoints: ['src/services/*.ts'],
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
      'service-logic': {
        owner: 'fixture-logic',
        path: 'src/services/logic',
        runtimeClassification: 'universal',
        allowedImports: ['services', 'shared', 'utils'],
        forbiddenImports: ['commands', 'entrypoints'],
        publicEntrypoints: [
          'src/services/logic/deontic/*.ts',
          'src/services/logic/fol/*.ts',
          'src/services/logic/dcec/*.ts',
        ],
        privateEntrypoints: [],
      },
      'service-proof-engine': {
        owner: 'fixture-proof-engine',
        path: 'src/services/proof-engine',
        runtimeClassification: 'split',
        allowedImports: ['services', 'shared', 'utils'],
        forbiddenImports: ['commands', 'entrypoints'],
        publicEntrypoints: ['src/services/proof-engine/*.ts'],
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
  writeFixtureFile(fixtureDir, 'src/services/mcp/protocol.ts', 'export const protocol = { version: 1 };\n');
  writeFixtureFile(
    fixtureDir,
    'test/architecture/intentional-entrypoints.test.js',
    'test("fixture intentional entrypoints", () => expect(true).toBe(true));\n',
  );
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
      'service-glasses',
      'service-integrations',
      'service-ipfs',
      'service-logic',
      'service-mcp',
      'service-platform',
      'service-proof-engine',
      'service-provers',
      'service-shared',
      'service-zkp',
    ]) {
      expect(auditedModules.get(moduleName)?.fileCount).toBeGreaterThan(0);
    }

    expect(audit.summary.unknownFiles).toBe(0);
    expect(audit.summary.forbiddenImports).toBe(0);
    expect(audit.summary.ownershipConflicts).toBe(0);
    expect(audit.summary.browserUnsafeImports).toBe(0);
    expect(audit.summary.rootServiceImplementationViolations).toBe(0);
  });

  it('records SWR-137 source and recovery provenance without fabricating recovery evidence', () => {
    const audit = runSourceModuleAudit();

    expect(audit.provenance).toEqual(expect.objectContaining({
      taskId: 'SWR-137',
      sourceRevision: expect.stringMatching(/^[a-f0-9]{40}$/),
      recoveryProvenance: expect.objectContaining({
        path: 'docs/phase-21-recovery-provenance.json',
        available: expect.any(Boolean),
      }),
    }));
    expect(audit.restoredServiceDuplicateInventory).toEqual(expect.objectContaining({
      taskId: 'SWR-137',
      source: expect.objectContaining({
        sourceRevision: audit.provenance.sourceRevision,
        recoveryProvenance: audit.provenance.recoveryProvenance,
      }),
    }));
  });

  it('allows a revalidation manifest to name its exact recovery provenance input', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'docs/recovered-baseline.json': '{"source":"fixture"}\n',
      },
      manifestPatch: {
        audit: {
          revalidationProvenance: {
            taskId: 'SWR-137-fixture',
            recoveryProvenancePath: 'docs/recovered-baseline.json',
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--json', 'audit.json']);

    expect(result.status).toBe(0);
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.provenance).toEqual(expect.objectContaining({
      taskId: 'SWR-137-fixture',
      sourceRevision: null,
      recoveryProvenance: {
        path: 'docs/recovered-baseline.json',
        available: true,
      },
    }));
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

  it('inventories every executable service file with hashes, ownership, importers, entrypoints, and disposition', () => {
    const audit = runSourceModuleAudit();
    const inventory = audit.restoredServiceDuplicateInventory;
    const executableFiles = [];
    const visit = directory => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(target);
        else if (/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|circom)$/.test(entry.name)) {
          executableFiles.push(path.relative(rootDir, target).split(path.sep).join('/'));
        }
      }
    };
    visit(path.join(rootDir, 'src/services'));
    executableFiles.sort();

    expect(inventory.taskId).toBe('SWR-137');
    expect(inventory.schemaVersion).toBeGreaterThanOrEqual(2);
    expect(inventory.serviceFiles.map(item => item.path)).toEqual(executableFiles);
    expect(inventory.summary.executableServiceFiles).toBe(executableFiles.length);
    for (const item of inventory.serviceFiles) {
      expect(item.contentHash.value).toMatch(/^[a-f0-9]{64}$/);
      expect(item.normalizedContentHash.value).toMatch(/^[a-f0-9]{64}$/);
      expect(item.behaviorHash.value).toMatch(/^[a-f0-9]{64}$/);
      expect(item.importers).toEqual(expect.any(Array));
      expect(item.publicEntrypoints).toEqual(expect.any(Array));
      expect(item.runtimeClass).not.toBe('unknown');
      expect(item.declaredOwner.owner).toEqual(expect.any(String));
      expect(item.canonicalOwner).toEqual(expect.objectContaining({
        module: expect.stringMatching(/^service|^services$/),
        owner: expect.any(String),
      }));
      expect(item.disposition).toEqual(expect.any(String));
      expect(item.collisionIds).toEqual(expect.any(Array));
    }

    const indexGroup = inventory.basenameCollisions.find(item => item.basename === 'index.ts');
    const indexFiles = executableFiles.filter(item => item.endsWith('/index.ts'));
    expect(indexGroup).toEqual(expect.objectContaining({
      kind: 'index-entrypoint-basename',
      disposition: 'module-scoped-index-entrypoints',
      classified: true,
      regressionTests: ['test/architecture/source-module-boundaries.test.js'],
    }));
    expect(indexGroup.paths.map(item => item.path)).toEqual(indexFiles);
    expect(inventory.policy.indexBasenamesIgnored).toBe(false);
    expect(inventory.policy.approvedIndexEntrypoints.map(item => item.path)).toEqual(indexFiles);
    expect(new Set(indexGroup.paths.map(item => item.publicContract)).size).toBe(indexFiles.length);
    for (const item of indexGroup.paths) {
      expect(item.canonicalOwner.owner).toEqual(expect.any(String));
      expect(item.publicEntrypoints.length).toBeGreaterThan(0);
    }
  });

  it('keeps source-equal relative barrels behavior-distinct behind named public contracts and a regression test', () => {
    const audit = runSourceModuleAudit();
    const inventory = audit.restoredServiceDuplicateInventory;
    const barrelGroup = inventory.normalizedContentCollisions.find(
      item => item.paths.includes('src/services/glasses/glasses-browser.ts'),
    );
    expect(barrelGroup).toEqual(expect.objectContaining({
      disposition: 'intentional-multi-entrypoint',
      classified: true,
      classification: expect.objectContaining({
        publicContracts: expect.any(Array),
        regressionTests: ['test/architecture/source-module-boundaries.test.js'],
      }),
    }));
    expect(barrelGroup.classification.publicContracts).toHaveLength(barrelGroup.paths.length);
    expect(new Set(barrelGroup.classification.publicContracts.map(item => item.contract)).size)
      .toBe(barrelGroup.paths.length);
    const records = inventory.serviceFiles.filter(item => barrelGroup.paths.includes(item.path));
    expect(new Set(records.map(item => item.behaviorHash.value)).size).toBe(records.length);
  });

  it('canonicalizes restored service shadows and preserves explicit public migration paths', () => {
    const audit = runSourceModuleAudit();
    const inventory = audit.restoredServiceDuplicateInventory;
    const migrations = manifest.audit.servicePublicApiMigrations;
    const publicEntrypoints = new Set(
      Object.values(manifest.modules).flatMap(definition => definition.publicEntrypoints ?? []),
    );
    const publicApiDocs = fs.readFileSync(servicePublicApiDocsPath, 'utf8');

    expect(migrations.length).toBeGreaterThan(0);
    expect(new Set(migrations.map(item => item.legacyPath)).size).toBe(migrations.length);
    expect(inventory.summary.unapprovedDuplicateBasenames).toBe(0);
    expect(inventory.summary.unclassifiedNormalizedContentCollisions).toBe(0);
    expect(inventory.summary.unclassifiedBehavioralEquivalenceGroups).toBe(0);
    expect(audit.summary.unresolvedMergeMarkers).toBe(0);
    expect(inventory.policy.approvedContentHashes).not.toContainEqual(expect.objectContaining({
      disposition: 'canonicalize-restored-shadow',
    }));
    expect(inventory.policy.classifiedCollisions).not.toContainEqual(expect.objectContaining({
      disposition: 'canonicalize-restored-shadow',
    }));

    for (const migration of migrations) {
      expect(migration.publicEntrypoint).toBe(migration.canonicalImplementation);
      expect(fs.existsSync(path.join(rootDir, migration.legacyPath))).toBe(false);
      expect(fs.statSync(path.join(rootDir, migration.canonicalImplementation)).isFile()).toBe(true);
      expect(fs.statSync(path.join(rootDir, migration.publicEntrypoint)).isFile()).toBe(true);
      expect(publicEntrypoints).toContain(migration.publicEntrypoint);
      expect(migration.compatibility).toBe('removed; import the canonical family API');
      expect(publicApiDocs).toContain(`\`${migration.legacyPath}\``);
      expect(publicApiDocs).toContain(`\`${migration.publicEntrypoint}\``);
    }

    for (const barrelPath of [
      'src/services/apps/index.ts',
      'src/services/logic/deontic/browser-nlp.ts',
    ]) {
      const source = readProjectFile(barrelPath)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(source).toMatch(/\bexport\b/);
      expect(source).not.toMatch(/\b(?:class|function|const|let|var|new)\b|=>/);
    }

    const proofBrowser = inventory.serviceFiles.find(
      item => item.path === 'src/services/proof-engine/proof-engine-browser.ts',
    );
    const proofIndex = inventory.serviceFiles.find(
      item => item.path === 'src/services/proof-engine/index.ts',
    );
    expect(proofBrowser.behaviorHash.value).not.toBe(proofIndex.behaviorHash.value);
    expect(readProjectFile(proofBrowser.path)).toContain('class BrowserProofEngine');
    expect(manifest.modules['service-proof-engine'].browserSafeEntrypoint).toBe(proofBrowser.path);
    expect(manifest.modules['service-provers'].browserSafeEntrypoint)
      .toBe('src/services/provers/provers-browser.ts');

    const packageJson = readJson(path.join(rootDir, 'package.json'));
    expect(packageJson.exports['./proof-engine']).toEqual(expect.objectContaining({
      browser: {
        types: './src/services/proof-engine/proof-engine-browser.ts',
        default: './src/services/proof-engine/proof-engine-browser.ts',
      },
      import: './src/services/proof-engine/proof-engine-host.ts',
      default: './src/services/proof-engine/proof-engine-host.ts',
    }));
    expect(packageJson.exports['./provers']).toEqual(expect.objectContaining({
      browser: {
        types: './src/services/provers/provers-browser.ts',
        default: './src/services/provers/provers-browser.ts',
      },
      import: './src/services/provers/provers-host.ts',
      default: './src/services/provers/provers-host.ts',
    }));
  });

  it('rejects a root service implementation even when it has an explicit owner', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/restored-root-implementation.ts': [
          'export function executeRestoredService(input) {',
          '  return { accepted: Boolean(input), executed: true };',
          '}',
          '',
        ].join('\n'),
      },
      manifestPatch: {
        audit: {
          serviceRootFileOwners: {
            'src/services/restored-root-implementation.ts': 'services',
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, [
      '--fail-on-legacy',
      '--json',
      'audit.json',
    ]);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('root service implementation violations: 1');
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.summary.unknownFiles).toBe(0);
    expect(audit.summary.rootServiceImplementationViolations).toBeGreaterThan(0);
    expect(audit.rootServiceImplementationViolations).toContainEqual(expect.objectContaining({
      file: 'src/services/restored-root-implementation.ts',
      reason: expect.stringMatching(/executable service implementation.*src\/services/i),
    }));
  });

  it('rejects an undocumented cross-family deep import of a private service implementation', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/logic/internal/private-normalizer.ts': [
          'export function privateNormalize(value) {',
          '  return String(value).trim().toLowerCase();',
          '}',
          '',
        ].join('\n'),
        'src/services/mcp/deep-import-consumer.ts': [
          "import { privateNormalize } from '../logic/internal/private-normalizer.js';",
          'export const normalizedCapability = privateNormalize(" CAPABILITY ");',
          '',
        ].join('\n'),
      },
    });
    const result = runFixtureAudit(fixtureDir, [
      '--fail-on-unknown',
      '--fail-on-forbidden',
      '--json',
      'audit.json',
    ]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toMatch(/cross-family service import.*undocumented private implementation path/i);
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.summary.undocumentedServiceDeepImports).toBeGreaterThan(0);
    expect(audit.undocumentedServiceDeepImports).toContainEqual(expect.objectContaining({
      file: 'src/services/mcp/deep-import-consumer.ts',
      target: 'src/services/logic/internal/private-normalizer.ts',
      module: 'service-mcp',
      targetModule: 'service-logic',
      reason: expect.stringMatching(/undocumented private implementation path/i),
    }));
  });

  it('allows an exact, owned, and justified cross-family deep import declaration', () => {
    const importer = 'src/services/mcp/deep-import-consumer.ts';
    const target = 'src/services/logic/internal/private-normalizer.ts';
    const fixtureDir = createAuditFixture({
      files: {
        [target]: 'export const privateNormalize = value => String(value).trim();\n',
        [importer]: [
          "import { privateNormalize } from '../logic/internal/private-normalizer.js';",
          'export const normalizedCapability = privateNormalize(" capability ");',
          '',
        ].join('\n'),
      },
      manifestPatch: {
        audit: {
          documentedServiceDeepImports: [{
            importer,
            target,
            owner: 'service-logic',
            reason: 'Fixture MCP adapter consumes the private normalizer through an explicitly reviewed boundary.',
          }],
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, [
      '--fail-on-unknown',
      '--fail-on-forbidden',
      '--json',
      'audit.json',
    ]);

    expect(result.status).toBe(0);
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.summary.undocumentedServiceDeepImports).toBe(0);
    expect(audit.undocumentedServiceDeepImports).toEqual([]);
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

  it('writes restored duplicate inventory with owners, hashes, importers, and browser classifications', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/restored-copy.ts': "import './mcp/restored-copy.js';\nexport const restoredCopy = true;\n",
        'src/services/mcp/restored-copy.ts': 'export const canonicalCopy = true;\n',
        'src/commands/uses-restored-copy.ts': "import '../services/restored-copy.js';\nexport const usesRestoredCopy = true;\n",
      },
      manifestPatch: {
        audit: {
          serviceRootFileOwners: {
            'src/services/owned-root.ts': 'services',
            'src/services/restored-copy.ts': 'services',
          },
        },
      },
    });
    const inventoryPath = path.join(fixtureDir, 'inventory.json');
    const markdownPath = path.join(fixtureDir, 'inventory.md');
    const result = runFixtureAudit(fixtureDir, [
      '--restored-service-duplicate-inventory-json',
      inventoryPath,
      '--restored-service-duplicate-inventory-md',
      markdownPath,
    ]);

    expect(result.status).toBe(0);
    const inventory = readJson(inventoryPath);
    const entry = inventory.duplicates.find(item => item.basename === 'restored-copy.ts');
    expect(entry).toEqual(expect.any(Object));
    expect(entry.disposition).toBe('remove-restored-copy');
    expect(entry.canonicalPath).toBe('src/services/mcp/restored-copy.ts');
    expect(entry.canonicalModuleOwner).toEqual(expect.objectContaining({
      module: 'service-mcp',
      owner: 'fixture-mcp',
      runtimeClassification: 'split',
      browserClassification: 'split-runtime-requires-entrypoint-review',
    }));
    expect(entry).toEqual(expect.objectContaining({
      runtimeClassification: 'split',
      browserClassification: 'split-runtime-requires-entrypoint-review',
      importers: expect.any(Array),
      importerCount: expect.any(Number),
    }));
    expect(entry.paths).toHaveLength(2);
    for (const item of entry.paths) {
      expect(item.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(item.contentHash).toEqual({
        algorithm: 'sha256',
        value: item.sha256,
      });
      expect(item).toEqual(expect.objectContaining({
        path: expect.stringMatching(/^src\/services\//),
        canonicalModuleOwner: expect.objectContaining({
          module: 'service-mcp',
          owner: 'fixture-mcp',
        }),
        disposition: 'remove-restored-copy',
        module: expect.any(String),
        runtimeClassification: expect.any(String),
        browserClassification: expect.any(String),
        importers: expect.any(Array),
      }));
    }
    const rootCopy = entry.paths.find(item => item.path === 'src/services/restored-copy.ts');
    expect(rootCopy).toEqual(expect.objectContaining({
      canonical: false,
      restoredRootCopy: true,
      restoredAfterPhase16Cleanup: true,
      phase16RestorationClassification: 'restored-root-copy-after-phase-16-cleanup',
      module: 'services',
    }));
    expect(rootCopy.importerCount).toBeGreaterThan(0);
    expect(rootCopy.importers.map(item => item.file)).toContain('src/commands/uses-restored-copy.ts');

    const canonicalCopy = entry.paths.find(item => item.path === 'src/services/mcp/restored-copy.ts');
    expect(canonicalCopy).toEqual(expect.objectContaining({
      canonical: true,
      restoredRootCopy: false,
      module: 'service-mcp',
    }));
    expect(canonicalCopy.importerCount).toBeGreaterThan(0);
    expect(canonicalCopy.importers.map(item => item.file)).toContain('src/services/restored-copy.ts');
    expect(fs.readFileSync(markdownPath, 'utf8')).toContain('### restored-copy.ts');
  });

  it('refreshes restored duplicate inventory outputs during the standard JSON audit', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/restored-copy.ts': 'export const restoredCopy = true;\n',
        'src/services/mcp/restored-copy.ts': 'export const canonicalCopy = true;\n',
      },
      manifestPatch: {
        audit: {
          serviceRootFileOwners: {
            'src/services/owned-root.ts': 'services',
            'src/services/restored-copy.ts': 'services',
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--json', 'docs/service-boundary-audit.json']);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(fixtureDir, 'docs/restored-service-duplicate-inventory.json'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'docs/restored-service-duplicate-inventory.md'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'docs/service-module-public-api.md'))).toBe(true);

    const inventory = readJson(path.join(fixtureDir, 'docs/restored-service-duplicate-inventory.json'));
    expect(inventory.summary.duplicateBasenames).toBe(1);
    expect(inventory.duplicates[0]).toEqual(expect.objectContaining({
      basename: 'restored-copy.ts',
      disposition: 'remove-restored-copy',
    }));
  });

  it('rejects broad restored duplicate exemptions under the legacy service gate', () => {
    const fixtureDir = createAuditFixture({
      manifestPatch: {
        audit: {
          restoredServiceDuplicatePolicy: {
            broadExemptionsAllowed: true,
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy']);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('broad restored service duplicate exemptions are not allowed');
  });

  it('rejects attempts to disable default non-index duplicate failures', () => {
    const fixtureDir = createAuditFixture({
      manifestPatch: {
        audit: {
          restoredServiceDuplicatePolicy: {
            nonIndexBasenameDuplicatesAreFailuresByDefault: false,
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy']);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('non-index service basename duplicates must fail by default');
  });

  it('requires approved restored duplicate multi-entrypoints to be exact and justified', () => {
    const fixtureDir = createAuditFixture({
      manifestPatch: {
        audit: {
          restoredServiceDuplicatePolicy: {
            approvedMultiEntrypoints: [
              {
                basename: 'restored-*',
                paths: ['src/services/restored-copy.ts'],
                owner: 'missing-service-owner',
              },
            ],
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy']);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('approved multi-entrypoint must name one exact duplicate basename');
    expect(output).toContain('approved multi-entrypoint must list every exact duplicate path');
    expect(output).toContain('approved multi-entrypoint must name the exact canonical module owner');
    expect(output).toContain('approved multi-entrypoint must include an explicit rationale');
  });

  it('allows only exact approved restored duplicate multi-entrypoints under the legacy service gate', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/restored-copy.ts': 'export const restoredCopy = true;\n',
        'src/services/mcp/restored-copy.ts': 'export const canonicalCopy = true;\n',
      },
      manifestPatch: {
        audit: {
          serviceRootFileOwners: {
            'src/services/owned-root.ts': 'services',
            'src/services/restored-copy.ts': 'services',
          },
          restoredServiceDuplicatePolicy: {
            approvedMultiEntrypoints: [
              {
                basename: 'restored-copy.ts',
                paths: [
                  'src/services/mcp/restored-copy.ts',
                  'src/services/restored-copy.ts',
                ],
                owner: 'service-mcp',
                publicContracts: [
                  {
                    path: 'src/services/mcp/restored-copy.ts',
                    contract: 'fixture MCP restored-copy contract',
                  },
                  {
                    path: 'src/services/restored-copy.ts',
                    contract: 'fixture root restored-copy compatibility contract',
                  },
                ],
                regressionTests: ['test/architecture/intentional-entrypoints.test.js'],
                reason: 'Fixture-only proof that exact multi-entrypoints can be approved without broad duplicate exemptions.',
              },
            ],
          },
        },
      },
    });
    const inventoryPath = path.join(fixtureDir, 'approved-inventory.json');
    const result = runFixtureAudit(fixtureDir, [
      '--fail-on-legacy',
      '--restored-service-duplicate-inventory-json',
      inventoryPath,
    ]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain('service duplicate basenames: 1');
    expect(output).toContain('unapproved service duplicate basenames: 0');
    const inventory = readJson(inventoryPath);
    const entry = inventory.duplicates.find(item => item.basename === 'restored-copy.ts');
    expect(entry).toEqual(expect.objectContaining({
      disposition: 'explicitly-approved-multi-entrypoint',
      approvedMultiEntrypoint: expect.objectContaining({
        owner: 'service-mcp',
        reason: expect.stringContaining('exact multi-entrypoints can be approved'),
      }),
    }));
    expect(inventory.summary.dispositionCounts).toEqual({
      'explicitly-approved-multi-entrypoint': 1,
    });
  });

  it('fails non-index service basename duplicates by default under the legacy service gate', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/restored-copy.ts': 'export const restoredCopy = true;\n',
        'src/services/mcp/restored-copy.ts': 'export const canonicalCopy = true;\n',
        'src/services/index.ts': 'export const rootIndex = true;\n',
        'src/services/mcp/index.ts': 'export const mcpIndex = true;\n',
      },
      manifestPatch: {
        audit: {
          serviceRootFileOwners: {
            'src/services/owned-root.ts': 'services',
            'src/services/restored-copy.ts': 'services',
            'src/services/index.ts': 'services',
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy']);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('service duplicate basenames: 1');
    expect(`${result.stdout}\n${result.stderr}`).toContain('restored-copy.ts');
    expect(`${result.stdout}\n${result.stderr}`).not.toContain('index.ts: duplicate src/services basename');
  });

  it('rejects a restored root service implementation with canonical owner and content hashes', () => {
    const restoredImplementation = 'export const restoredCopy = "same implementation restored at root";\n';
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/restored-copy.ts': restoredImplementation,
        'src/services/mcp/restored-copy.ts': restoredImplementation,
      },
      manifestPatch: {
        audit: {
          serviceRootFileOwners: {
            'src/services/owned-root.ts': 'services',
            'src/services/restored-copy.ts': 'services',
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, [
      '--fail-on-legacy',
      '--json',
      'docs/service-boundary-audit.json',
    ]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('restored service duplicate implementations: 1');
    expect(output).toContain('remove restored root copy src/services/restored-copy.ts');
    expect(output).toContain('canonical src/services/mcp/restored-copy.ts [service-mcp, sha256');
    expect(output).toContain('src/services/restored-copy.ts [services, service-implementation, sha256');
    expect(output).toContain('service duplicate content hashes: 1');
    expect(output).toContain('unapproved service duplicate content hashes: 1');

    const audit = readJson(path.join(fixtureDir, 'docs/service-boundary-audit.json'));
    expect(audit.summary).toEqual(expect.objectContaining({
      unapprovedServiceDuplicateBasenames: 1,
      serviceDuplicateContentHashes: 1,
      unapprovedServiceDuplicateContentHashes: 1,
    }));
    const duplicate = audit.restoredServiceDuplicateInventory.duplicates.find(
      item => item.basename === 'restored-copy.ts',
    );
    expect(duplicate).toEqual(expect.objectContaining({
      canonicalPath: 'src/services/mcp/restored-copy.ts',
      canonicalSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      canonicalContentHash: {
        algorithm: 'sha256',
        value: duplicate.canonicalSha256,
      },
    }));
  });

  it('rejects copied service implementation content even when basenames differ', () => {
    const copiedImplementation = 'export const copiedImplementation = "same bytes under a different basename";\n';
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/copied-implementation.ts': copiedImplementation,
        'src/services/mcp/restored-under-new-name.ts': copiedImplementation,
      },
    });
    const result = runFixtureAudit(fixtureDir, [
      '--fail-on-legacy',
      '--json',
      'docs/service-boundary-audit.json',
    ]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('service duplicate basenames: 0');
    expect(output).toContain('service duplicate content hashes: 1');
    expect(output).toContain('unapproved service duplicate content hashes: 1');
    expect(output).toContain('byte-identical service implementations require exact content-hash ownership approval');
    expect(output).toContain('content-shadow-review');

    const audit = readJson(path.join(fixtureDir, 'docs/service-boundary-audit.json'));
    expect(audit.summary).toEqual(expect.objectContaining({
      serviceDuplicateBasenames: 0,
      serviceDuplicateContentHashes: 1,
      unapprovedServiceDuplicateContentHashes: 1,
    }));
    expect(audit.serviceDuplicateContentHashDetails[0]).toEqual(expect.objectContaining({
      canonicalPath: 'src/services/mcp/copied-implementation.ts',
      canonicalModuleOwner: expect.objectContaining({
        module: 'service-mcp',
      }),
      disposition: 'content-shadow-review',
      approvedContentHash: null,
      paths: expect.arrayContaining([
        expect.objectContaining({
          path: 'src/services/mcp/copied-implementation.ts',
          canonical: true,
          contentKind: 'service-implementation',
        }),
        expect.objectContaining({
          path: 'src/services/mcp/restored-under-new-name.ts',
          canonical: false,
          contentKind: 'service-implementation',
        }),
      ]),
    }));
  });

  it('rejects a renamed copy whose comments and formatting evade raw-content hashing', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/canonical-normalized.ts': 'export const normalizedValue = { answer: 42 };\n',
        'src/services/mcp/renamed-normalized-shadow.ts': '// restored copy\nexport   const normalizedValue={answer:42};\n',
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy', '--json', 'audit.json']);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('service duplicate content hashes: 0');
    expect(output).toContain('service normalized-content collisions: 1');
    expect(output).toContain('unclassified service normalized-content collisions: 1');
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.serviceNormalizedContentCollisionDetails[0]).toEqual(expect.objectContaining({
      kind: 'normalized-content',
      disposition: 'unclassified-copy',
      paths: [
        'src/services/mcp/canonical-normalized.ts',
        'src/services/mcp/renamed-normalized-shadow.ts',
      ],
    }));
  });

  it('rejects behaviorally equivalent renamed implementations with renamed local identifiers', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/canonical-behavior.ts': 'export function original(input) { return input + 1; }\n',
        'src/services/mcp/renamed-behavior-shadow.ts': 'export function renamed(value) { return value + 1; }\n',
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy', '--json', 'audit.json']);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('service normalized-content collisions: 0');
    expect(output).toContain('service behavioral-equivalence groups: 1');
    expect(output).toContain('unclassified service behavioral-equivalence groups: 1');
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.serviceBehavioralEquivalenceDetails[0]).toEqual(expect.objectContaining({
      kind: 'behavior',
      disposition: 'unclassified-copy',
      paths: [
        'src/services/mcp/canonical-behavior.ts',
        'src/services/mcp/renamed-behavior-shadow.ts',
      ],
    }));
  });

  it.each([
    {
      family: 'deontic',
      canonicalPath: 'src/services/logic/deontic/canonical-policy-check.ts',
      restoredPath: 'src/services/logic/deontic/restored-norm-check.ts',
      canonicalSource: "export function isObligatory(policy) { return policy.mode === 'obligatory'; }\n",
      restoredSource: "export function hasDuty(rule) { return rule.mode === 'obligatory'; }\n",
    },
    {
      family: 'FOL',
      canonicalPath: 'src/services/logic/fol/canonical-term-counter.ts',
      restoredPath: 'src/services/logic/fol/renamed-formula-counter.ts',
      canonicalSource: "export function countTerms(formula) { return formula.split(' & ').length; }\n",
      restoredSource: "export function measureAtoms(source) { return source.split(' & ').length; }\n",
    },
    {
      family: 'DCEC',
      canonicalPath: 'src/services/logic/dcec/canonical-event-clock.ts',
      restoredPath: 'src/services/logic/dcec/restored-temporal-clock.ts',
      canonicalSource: 'export function nextEventTime(eventTime) { return eventTime + 17; }\n',
      restoredSource: 'export function advanceClock(timestamp) { return timestamp + 17; }\n',
    },
    {
      family: 'proof-engine',
      canonicalPath: 'src/services/proof-engine/canonical-proof-selector.ts',
      restoredPath: 'src/services/proof-engine/renamed-backend-selector.ts',
      canonicalSource: "export function selectProof(runtime) { return runtime === 'wasm' ? 'groth16' : 'typescript'; }\n",
      restoredSource: "export function chooseBackend(engine) { return engine === 'wasm' ? 'groth16' : 'typescript'; }\n",
    },
    {
      family: 'browser runtime',
      canonicalPath: 'src/services/mcp/canonical-browser-transport.ts',
      restoredPath: 'src/services/mcp/renamed-browser-network.ts',
      canonicalSource: 'export function browserTransport(enabled) { return enabled !== false ? 443 : 0; }\n',
      restoredSource: 'export function networkPort(configured) { return configured !== false ? 443 : 0; }\n',
    },
  ])('rejects a behaviorally equivalent renamed executable in the $family family', ({
    canonicalPath,
    restoredPath,
    canonicalSource,
    restoredSource,
  }) => {
    const fixtureDir = createAuditFixture({
      files: {
        [canonicalPath]: canonicalSource,
        [restoredPath]: restoredSource,
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy', '--json', 'audit.json']);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('unclassified service behavioral-equivalence groups: 1');
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.summary.unclassifiedServiceBehavioralEquivalenceGroups).toBe(1);
    expect(audit.serviceBehavioralEquivalenceDetails).toContainEqual(expect.objectContaining({
      kind: 'behavior',
      disposition: 'unclassified-copy',
      classified: false,
      paths: [canonicalPath, restoredPath].sort(),
    }));
  });

  it('keeps runtime strings out of dependency relocation normalization', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/canonical-runtime-string.ts': [
          "import './protocol.js';",
          "export function canonical(input) { return input.split('./protocol.js'); }",
          '',
        ].join('\n'),
        'src/services/mcp/host/renamed-runtime-string.ts': [
          "import '../protocol.js';",
          "export function renamed(value) { return value.split('./protocol.js'); }",
          '',
        ].join('\n'),
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--json', 'audit.json']);

    expect(result.status).toBe(0);
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.serviceBehavioralEquivalenceDetails).toContainEqual(expect.objectContaining({
      kind: 'behavior',
      paths: [
        'src/services/mcp/canonical-runtime-string.ts',
        'src/services/mcp/host/renamed-runtime-string.ts',
      ],
      classified: false,
    }));
  });

  it('recognizes restored copies across generated bare-import JavaScript suffixes', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/canonical-bare-import.ts': [
          "import { memoize } from 'lodash-es';",
          'export function canonical(value) { return memoize(value); }',
          '',
        ].join('\n'),
        'src/services/mcp/renamed-bare-import.ts': [
          "import { memoize } from 'lodash-es.js';",
          'export function renamed(input) { return memoize(input); }',
          '',
        ].join('\n'),
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--json', 'audit.json']);

    expect(result.status).toBe(0);
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.serviceBehavioralEquivalenceDetails).toContainEqual(expect.objectContaining({
      kind: 'behavior',
      paths: [
        'src/services/mcp/canonical-bare-import.ts',
        'src/services/mcp/renamed-bare-import.ts',
      ],
      classified: false,
    }));
  });

  it('distinguishes normalized-equal barrels when their relative targets have different behavior', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/first/browser.ts': "export * from './index.js';\n",
        'src/services/mcp/first/index.ts': 'export const firstContract = true;\n',
        'src/services/mcp/second/host.ts': "export * from './index.js';\n",
        'src/services/mcp/second/index.ts': 'export const secondContract = true;\n',
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--json', 'audit.json']);
    expect(result.status).toBe(0);
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    const first = audit.restoredServiceDuplicateInventory.serviceFiles.find(
      item => item.path === 'src/services/mcp/first/browser.ts',
    );
    const second = audit.restoredServiceDuplicateInventory.serviceFiles.find(
      item => item.path === 'src/services/mcp/second/host.ts',
    );
    expect(first.normalizedContentHash.value).toBe(second.normalizedContentHash.value);
    expect(first.behaviorHash.value).not.toBe(second.behaviorHash.value);
  });

  it('rejects intentional multi-entrypoint approvals without distinct contracts and regression tests', () => {
    const implementation = 'export const intentionalCopy = true;\n';
    const sha256 = crypto.createHash('sha256').update(implementation).digest('hex');
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/intentional-a.ts': implementation,
        'src/services/mcp/intentional-b.ts': implementation,
      },
      manifestPatch: {
        audit: {
          restoredServiceDuplicatePolicy: {
            approvedContentHashes: [{
              sha256,
              canonicalPath: 'src/services/mcp/intentional-a.ts',
              paths: [
                'src/services/mcp/intentional-a.ts',
                'src/services/mcp/intentional-b.ts',
              ],
              owner: 'service-mcp',
              reason: 'An explanation alone is not contract or test evidence.',
            }],
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy']);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('one distinct supported public contract for every exact path');
    expect(output).toContain('at least one executable regression test');
  });

  it('rejects documentation-only files cited as intentional multi-entrypoint regression tests', () => {
    const implementation = 'export const intentionalCopy = true;\n';
    const sha256 = crypto.createHash('sha256').update(implementation).digest('hex');
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/intentional-a.ts': implementation,
        'src/services/mcp/intentional-b.ts': implementation,
        'test/architecture/intentional-entrypoints.test.js': '// Documentation only: test("not executed", () => {}).\n',
      },
      manifestPatch: {
        audit: {
          restoredServiceDuplicatePolicy: {
            approvedContentHashes: [{
              sha256,
              canonicalPath: 'src/services/mcp/intentional-a.ts',
              paths: [
                'src/services/mcp/intentional-a.ts',
                'src/services/mcp/intentional-b.ts',
              ],
              owner: 'service-mcp',
              disposition: 'intentional-multi-entrypoint',
              publicContracts: [
                {
                  path: 'src/services/mcp/intentional-a.ts',
                  contract: 'fixture intentional A contract',
                },
                {
                  path: 'src/services/mcp/intentional-b.ts',
                  contract: 'fixture intentional B contract',
                },
              ],
              regressionTests: ['test/architecture/intentional-entrypoints.test.js'],
              reason: 'A documentation-only JavaScript file is not regression evidence.',
            }],
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy', '--json', 'audit.json']);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'intentional multi-entrypoint regression test must contain an executable test declaration',
    );
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.serviceDuplicateContentHashDetails[0]).toEqual(expect.objectContaining({
      unapproved: true,
      approvedContentHash: null,
    }));
    expect(audit.serviceNormalizedContentCollisionDetails[0]).toEqual(expect.objectContaining({
      classified: false,
      disposition: 'unclassified-copy',
    }));
    expect(audit.serviceBehavioralEquivalenceDetails[0]).toEqual(expect.objectContaining({
      classified: false,
      disposition: 'unclassified-copy',
    }));
  });

  it('does not let a stale raw-content approval classify content that drifted on the same paths', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/canonical-normalized.ts': 'export const normalizedValue = { answer: 42 };\n',
        'src/services/mcp/renamed-normalized-shadow.ts': '// drifted formatting\nexport const normalizedValue={answer:42};\n',
      },
      manifestPatch: {
        audit: {
          restoredServiceDuplicatePolicy: {
            approvedContentHashes: [{
              sha256: '0'.repeat(64),
              canonicalPath: 'src/services/mcp/canonical-normalized.ts',
              paths: [
                'src/services/mcp/canonical-normalized.ts',
                'src/services/mcp/renamed-normalized-shadow.ts',
              ],
              owner: 'service-mcp',
              disposition: 'canonicalize-restored-shadow',
              reason: 'This deliberately stale raw hash must not approve normalized or behavioral drift.',
            }],
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy', '--json', 'audit.json']);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('unclassified service normalized-content collisions: 1');
    expect(output).toContain('unclassified service behavioral-equivalence groups: 1');
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.serviceNormalizedContentCollisionDetails[0]).toEqual(expect.objectContaining({
      classified: false,
      disposition: 'unclassified-copy',
    }));
    expect(audit.serviceBehavioralEquivalenceDetails[0]).toEqual(expect.objectContaining({
      classified: false,
      disposition: 'unclassified-copy',
    }));
  });

  it('allows only exact approved service duplicate content hashes', () => {
    const copiedImplementation = 'export const copiedImplementation = "approved same bytes under a different basename";\n';
    const sha256 = crypto
      .createHash('sha256')
      .update(copiedImplementation)
      .digest('hex');
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/copied-implementation.ts': copiedImplementation,
        'src/services/mcp/restored-under-new-name.ts': copiedImplementation,
      },
      manifestPatch: {
        audit: {
          restoredServiceDuplicatePolicy: {
            approvedContentHashes: [
              {
                sha256,
                canonicalPath: 'src/services/mcp/copied-implementation.ts',
                owner: 'service-mcp',
                disposition: 'canonicalize-restored-shadow',
                paths: [
                  'src/services/mcp/copied-implementation.ts',
                  'src/services/mcp/restored-under-new-name.ts',
                ],
                reason: 'Fixture-only proof that exact content hash approvals do not allow broad duplicate exemptions.',
              },
            ],
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, [
      '--fail-on-legacy',
      '--json',
      'docs/service-boundary-audit.json',
    ]);

    expect(result.status).toBe(0);
    const audit = readJson(path.join(fixtureDir, 'docs/service-boundary-audit.json'));
    expect(audit.summary).toEqual(expect.objectContaining({
      serviceDuplicateContentHashes: 1,
      unapprovedServiceDuplicateContentHashes: 0,
    }));
    expect(audit.serviceDuplicateContentHashDetails[0]).toEqual(expect.objectContaining({
      disposition: 'canonicalize-restored-shadow',
      approvedContentHash: expect.objectContaining({
        owner: 'service-mcp',
        canonicalPath: 'src/services/mcp/copied-implementation.ts',
        reason: expect.stringContaining('exact content hash approvals'),
      }),
    }));
  });

  it('inventories modern TypeScript module extensions and executable circuit source', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/mcp/modern-module.mts': 'export const modernModule = "mts";\n',
        'src/services/mcp/common-module.cts': 'export const commonModule = "cts";\n',
        'src/services/mcp/verification-circuit.circom': 'template Verify() { signal input value; }\ncomponent main = Verify();\n',
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy', '--json', 'audit.json']);

    expect(result.status).toBe(0);
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.restoredServiceDuplicateInventory.serviceFiles.map(item => item.path)).toEqual(
      expect.arrayContaining([
        'src/services/mcp/modern-module.mts',
        'src/services/mcp/common-module.cts',
        'src/services/mcp/verification-circuit.circom',
      ]),
    );
  });

  it('rejects a new index basename collision without exact per-entrypoint evidence', () => {
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/index.ts': "export * from './owned-root.js';\n",
        'src/services/mcp/index.ts': "export * from './protocol.js';\n",
      },
      manifestPatch: {
        audit: {
          serviceRootFileOwners: {
            'src/services/owned-root.ts': 'services',
            'src/services/index.ts': 'services',
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--fail-on-legacy', '--json', 'audit.json']);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('unclassified service basename collisions: 1');
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.serviceNormalizedContentCollisionDetails).toEqual(expect.any(Array));
    expect(audit.restoredServiceDuplicateInventory.basenameCollisions[0]).toEqual(
      expect.objectContaining({
        basename: 'index.ts',
        classified: false,
        disposition: 'unclassified-copy',
      }),
    );
  });

  it('does not classify index entrypoints backed by documentation-only regression evidence', () => {
    const regressionTest = 'test/architecture/intentional-entrypoints.test.js';
    const fixtureDir = createAuditFixture({
      files: {
        'src/services/index.ts': "export * from './owned-root.js';\n",
        'src/services/mcp/index.ts': "export * from './protocol.js';\n",
        [regressionTest]: '// Documentation only: test("not executed", () => {}).\n',
      },
      manifestPatch: {
        audit: {
          serviceRootFileOwners: {
            'src/services/owned-root.ts': 'services',
            'src/services/index.ts': 'services',
          },
          restoredServiceDuplicatePolicy: {
            approvedIndexEntrypoints: [
              {
                path: 'src/services/index.ts',
                owner: 'services',
                publicContract: 'fixture root services entrypoint',
                regressionTests: [regressionTest],
              },
              {
                path: 'src/services/mcp/index.ts',
                owner: 'service-mcp',
                publicContract: 'fixture MCP services entrypoint',
                regressionTests: [regressionTest],
              },
            ],
          },
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, ['--json', 'audit.json']);

    expect(result.status).toBe(0);
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.summary.restoredServiceDuplicatePolicyViolations).toBe(2);
    expect(audit.restoredServiceDuplicateInventory.basenameCollisions[0]).toEqual(
      expect.objectContaining({
        basename: 'index.ts',
        classified: false,
        disposition: 'unclassified-copy',
        regressionTests: [],
      }),
    );
  });

  it('distinguishes approved index barrels from root index shadow implementations', () => {
    const approvedIndexEntrypoints = [
      {
        path: 'src/services/index.ts',
        owner: 'services',
        publicContract: 'fixture root services entrypoint',
        regressionTests: ['test/architecture/intentional-entrypoints.test.js'],
      },
      {
        path: 'src/services/mcp/index.ts',
        owner: 'service-mcp',
        publicContract: 'fixture MCP services entrypoint',
        regressionTests: ['test/architecture/intentional-entrypoints.test.js'],
      },
    ];
    const barrelFixtureDir = createAuditFixture({
      files: {
        'src/services/index.ts': "export * from './owned-root.js';\n",
        'src/services/mcp/index.ts': "export * from './protocol.js';\n",
      },
      manifestPatch: {
        audit: {
          restoredServiceDuplicatePolicy: { approvedIndexEntrypoints },
          serviceRootFileOwners: {
            'src/services/owned-root.ts': 'services',
            'src/services/index.ts': 'services',
          },
        },
      },
    });
    const barrelResult = runFixtureAudit(barrelFixtureDir, ['--fail-on-legacy', '--json', 'audit.json']);

    expect(barrelResult.status).toBe(0);
    const barrelAudit = readJson(path.join(barrelFixtureDir, 'audit.json'));
    expect(barrelAudit.summary).toEqual(expect.objectContaining({
      approvedServiceIndexBarrels: 2,
      serviceIndexShadowCopies: 0,
      serviceDuplicateBasenames: 0,
    }));

    const shadowFixtureDir = createAuditFixture({
      files: {
        'src/services/index.ts': 'export const hiddenRootImplementation = true;\n',
        'src/services/mcp/index.ts': "export * from './protocol.js';\n",
      },
      manifestPatch: {
        audit: {
          restoredServiceDuplicatePolicy: { approvedIndexEntrypoints },
          serviceRootFileOwners: {
            'src/services/owned-root.ts': 'services',
            'src/services/index.ts': 'services',
          },
        },
      },
    });
    const shadowResult = runFixtureAudit(shadowFixtureDir, ['--fail-on-legacy', '--json', 'audit.json']);
    const shadowOutput = `${shadowResult.stdout}\n${shadowResult.stderr}`;

    expect(shadowResult.status).not.toBe(0);
    expect(shadowOutput).toContain('service index shadow copies: 1');
    expect(shadowOutput).toContain('root service index contains implementation content instead of an approved barrel');
    const shadowAudit = readJson(path.join(shadowFixtureDir, 'audit.json'));
    expect(shadowAudit.serviceIndexClassifications.indexShadowCopies).toEqual([
      expect.objectContaining({
        path: 'src/services/index.ts',
        contentKind: 'index-shadow-copy',
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
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

  it('rejects a package browser export that transitively reaches a host-only dependency', () => {
    const browserEntrypoint = 'src/services/mcp/browser-network-entry.ts';
    const fixtureDir = createAuditFixture({
      files: {
        'package.json': `${JSON.stringify({
          name: 'source-boundary-fixture',
          exports: {
            './browser/network': {
              browser: `./${browserEntrypoint}`,
              default: `./${browserEntrypoint}`,
            },
          },
        }, null, 2)}\n`,
        [browserEntrypoint]: [
          "export { readHostNetworkState } from './host-network-state.js';",
          '',
        ].join('\n'),
        'src/services/mcp/host-network-state.ts': [
          "import fs from 'node:fs';",
          'export const readHostNetworkState = path => fs.readFileSync(path, "utf8");',
          '',
        ].join('\n'),
      },
      manifestPatch: {
        audit: {
          browserSafeSourceGlobs: [browserEntrypoint],
          browserSafeServiceFiles: [
            browserEntrypoint,
            'src/services/mcp/host-network-state.ts',
          ],
          browserPublicEntrypoints: [{
            exportName: './browser/network',
            path: browserEntrypoint,
            owner: 'service-mcp',
            publicContract: 'Fixture browser network capability',
          }],
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, [
      '--fail-on-unknown',
      '--fail-on-forbidden',
      '--json',
      'audit.json',
    ]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toMatch(/browser public entrypoint.*transitively reaches.*host-only Node builtin/i);
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.summary.browserUnsafeImports).toBeGreaterThan(0);
    expect(audit.browserUnsafeImports).toContainEqual(expect.objectContaining({
      rootEntrypoint: browserEntrypoint,
      file: 'src/services/mcp/host-network-state.ts',
      specifier: 'node:fs',
      reason: expect.stringMatching(/transitively reaches.*host-only Node builtin/i),
    }));
  });

  it('rejects a package browser export missing an exact public-entrypoint declaration', () => {
    const browserEntrypoint = 'src/services/mcp/undeclared-browser-entry.ts';
    const fixtureDir = createAuditFixture({
      files: {
        'package.json': `${JSON.stringify({
          name: 'source-boundary-fixture',
          exports: {
            './browser/undeclared': {
              browser: `./${browserEntrypoint}`,
              default: `./${browserEntrypoint}`,
            },
          },
        }, null, 2)}\n`,
        [browserEntrypoint]: 'export const browserCapability = "real-browser-capability";\n',
      },
      manifestPatch: {
        audit: {
          browserSafeSourceGlobs: [browserEntrypoint],
          browserSafeServiceFiles: [browserEntrypoint],
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, [
      '--fail-on-unknown',
      '--fail-on-forbidden',
      '--json',
      'audit.json',
    ]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toMatch(/browser public entrypoint.*not declared/i);
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.summary.browserEntrypointPolicyViolations).toBeGreaterThan(0);
    expect(audit.browserEntrypointPolicyViolations).toContainEqual(expect.objectContaining({
      exportName: './browser/undeclared',
      file: browserEntrypoint,
      reason: expect.stringMatching(/not declared in audit\.browserPublicEntrypoints/i),
    }));
  });

  it('rejects a declared browser entrypoint behavior-equivalent to an unapproved service module', () => {
    const browserEntrypoint = 'src/services/mcp/browser-capability-entry.ts';
    const equivalentModule = 'src/services/mcp/renamed-browser-capability.ts';
    const fixtureDir = createAuditFixture({
      files: {
        'package.json': `${JSON.stringify({
          name: 'source-boundary-fixture',
          exports: {
            './browser/capability': {
              browser: `./${browserEntrypoint}`,
              default: `./${browserEntrypoint}`,
            },
          },
        }, null, 2)}\n`,
        [browserEntrypoint]: 'export function browserCapability(input) { return input !== false ? 731 : 0; }\n',
        [equivalentModule]: 'export function renamedCapability(enabled) { return enabled !== false ? 731 : 0; }\n',
      },
      manifestPatch: {
        audit: {
          browserSafeSourceGlobs: [browserEntrypoint],
          browserSafeServiceFiles: [browserEntrypoint],
          browserPublicEntrypoints: [{
            exportName: './browser/capability',
            path: browserEntrypoint,
            owner: 'service-mcp',
            publicContract: 'Fixture browser capability API',
          }],
        },
      },
    });
    const result = runFixtureAudit(fixtureDir, [
      '--fail-on-unknown',
      '--fail-on-forbidden',
      '--fail-on-legacy',
      '--json',
      'audit.json',
    ]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toMatch(/browser public entrypoint.*behavior-equivalent.*without exact duplicate-policy approval/i);
    const audit = readJson(path.join(fixtureDir, 'audit.json'));
    expect(audit.summary.browserEntrypointPolicyViolations).toBeGreaterThan(0);
    expect(audit.browserEntrypointPolicyViolations).toContainEqual(expect.objectContaining({
      exportName: './browser/capability',
      file: browserEntrypoint,
      reason: expect.stringMatching(/behavior-equivalent.*without exact duplicate-policy approval/i),
      equivalentPaths: expect.arrayContaining([browserEntrypoint, equivalentModule]),
    }));
  });

  it('keeps source boundary documentation aligned with the manifest and lint gate', () => {
    const packageJson = readJson(path.join(rootDir, 'package.json'));
    const releaseGate = readProjectFile('scripts/release-readiness-gate.mjs');

    expect(docs).toContain('Dependency Direction');
    expect(docs).toContain('Browser UI');
    expect(docs).toContain('Host-only CLI code');
    expect(packageJson.scripts['lint:source-modules']).toContain('audit-source-modules.mjs');
    expect(packageJson.scripts.lint).toContain('lint:source-modules');
    expect(packageJson.scripts['services:audit']).toContain('audit-source-modules.mjs');
    expect(packageJson.scripts['services:audit']).toContain('--fail-on-legacy');
    expect(packageJson.scripts['services:audit']).toContain('--json docs/service-boundary-audit.json');
    expect(releaseGate).toContain("id: 'services-audit'");
    expect(releaseGate).toContain("run: () => runNpmScript('services:audit')");
  });
});
