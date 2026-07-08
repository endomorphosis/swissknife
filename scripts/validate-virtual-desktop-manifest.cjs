#!/usr/bin/env node

<<<<<<< HEAD
const fs = require('fs');
const path = require('path');

require('tsx/cjs');

const {
  VIRTUAL_DESKTOP_APP_MANIFEST,
} = require('../src/services/apps/virtual-desktop-app-manifest.ts');
const {
  GLASSES_APP_REGISTRY,
} = require('../src/services/glasses/glasses-app-control-plane.ts');
const {
  IPFS_IDL_DESCRIPTORS,
} = require('../src/services/glasses/idl-to-glasses-compiler.ts');

const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, 'test-results', 'virtual-desktop-ipfs-mcp-orb', 'manifest-drift.json');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function unique(values) {
  return Array.from(new Set(values)).sort();
}

function idsFromDataApp(text) {
  return unique(Array.from(text.matchAll(/data-app="([^"]+)"/g), match => match[1])
    .filter(id => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)));
}

function idsFromAppsSet(text) {
  return unique(Array.from(text.matchAll(/apps\.set\(['"]([^'"]+)['"]/g), match => match[1]));
}

function idsFromObjectIdList(text) {
  return unique(Array.from(text.matchAll(/\{\s*id:\s*['"]([^'"]+)['"]/g), match => match[1]));
}

function idsFromBrowserMain(text) {
  return unique(Array.from(text.matchAll(/['"]([a-z0-9-]+)['"]:\s*\(\)\s*=>\s*open/g), match => match[1]));
}

function docAppIds() {
  return unique(
    fs.readdirSync(path.join(root, 'docs', 'applications'))
      .filter(name => name.endsWith('.md'))
      .map(name => name.replace(/\.md$/, ''))
      .filter(id => ![
        'README',
        'app-capability-policy',
        'backend-dependencies',
        'composite-ipfs-workflows',
        'features-matrix',
      ].includes(id)),
  );
}

const manifestEntries = VIRTUAL_DESKTOP_APP_MANIFEST.apps;
const aliasToCanonical = new Map();
for (const app of manifestEntries) {
  for (const alias of app.aliases) aliasToCanonical.set(alias, app.id);
}

function canonicalize(id) {
  return aliasToCanonical.get(id) ?? id;
}

function normalizeIds(ids) {
  return unique(ids.map(canonicalize));
}

function expectedForSource(sourceSet) {
  return unique(
    manifestEntries
      .filter(app => app.source_sets.includes(sourceSet))
      .map(app => app.id),
  );
}

function compareSource(name, sourceSet, actualIds, relPath) {
  const actual = normalizeIds(actualIds);
  const expected = expectedForSource(sourceSet);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter(id => !actualSet.has(id));
  const extra = actual.filter(id => !expectedSet.has(id));
  return {
    name,
    source_set: sourceSet,
    path: relPath,
    expected_count: expected.length,
    actual_count: actual.length,
    ok: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}

const indexHtml = read('web/index.html');
const systemMenuMarker = '<!-- System Menu -->';
const systemMenuOffset = indexHtml.indexOf(systemMenuMarker);
const desktopHtml = systemMenuOffset >= 0 ? indexHtml.slice(0, systemMenuOffset) : indexHtml;
const menuHtml = systemMenuOffset >= 0 ? indexHtml.slice(systemMenuOffset) : '';

const strictSources = [
  compareSource('web index desktop icons', 'web-index-desktop', idsFromDataApp(desktopHtml), 'web/index.html'),
  compareSource('web index start menu', 'web-index-start-menu', idsFromDataApp(menuHtml), 'web/index.html'),
  compareSource('web js main registry', 'web-js-main', idsFromAppsSet(read('web/js/main.js')), 'web/js/main.js'),
  compareSource('web js main-simple registry', 'web-js-main-simple', idsFromAppsSet(read('web/js/main-simple.js')), 'web/js/main-simple.js'),
  compareSource('browser-main runtime map', 'browser-main', idsFromBrowserMain(read('web/src/browser-main.ts')), 'web/src/browser-main.ts'),
  compareSource('list-all-applications script', 'list-all-applications', idsFromObjectIdList(read('scripts/list-all-applications.cjs')), 'scripts/list-all-applications.cjs'),
  compareSource('batch-test-apps script', 'batch-test-apps', idsFromObjectIdList(read('scripts/batch-test-apps.cjs')), 'scripts/batch-test-apps.cjs'),
  compareSource('docs applications', 'docs-applications', docAppIds(), 'docs/applications'),
  compareSource('glasses registry', 'glasses-registry', GLASSES_APP_REGISTRY.map(entry => entry.id), 'src/services/glasses/glasses-app-control-plane.ts'),
  compareSource('idl generated apps', 'idl-generated', IPFS_IDL_DESCRIPTORS.map(descriptor => descriptor.name), 'src/services/idl-to-glasses-compiler.ts'),
];

const playwrightLists = [
  {
    path: 'test/e2e/comprehensive-desktop-app-testing.test.ts',
    ids: idsFromDataApp(read('test/e2e/comprehensive-desktop-app-testing.test.ts')),
    expected_source_set: 'list-all-applications',
  },
  {
    path: 'test/e2e/desktop-applications-documentation.test.ts',
    ids: idsFromDataApp(read('test/e2e/desktop-applications-documentation.test.ts')),
    expected_source_set: 'docs-applications',
  },
  {
    path: 'test/e2e/validate-all-applications.test.ts',
    ids: idsFromDataApp(read('test/e2e/validate-all-applications.test.ts')),
    expected_source_set: null,
  },
];

const canonicalIds = new Set(manifestEntries.map(app => app.id));
const aliasIds = new Set(aliasToCanonical.keys());
const playwrightReports = playwrightLists.map(list => {
  const normalized = normalizeIds(list.ids);
  const unknown = unique(list.ids.filter(id => !canonicalIds.has(id) && !aliasIds.has(id)));
  const expected = list.expected_source_set ? expectedForSource(list.expected_source_set) : [];
  const expectedSet = new Set(expected);
  const normalizedSet = new Set(normalized);
  const missing = list.expected_source_set ? expected.filter(id => !normalizedSet.has(id)) : [];
  const extra = list.expected_source_set ? normalized.filter(id => !expectedSet.has(id)) : [];
  return {
    path: list.path,
    expected_source_set: list.expected_source_set,
    actual_count: normalized.length,
    unknown,
    missing,
    extra,
    ok: unknown.length === 0 && missing.length === 0 && extra.length === 0,
  };
});

const errors = [];
for (const source of strictSources) {
  if (!source.ok) {
    errors.push(`${source.name} drift: missing=[${source.missing.join(', ')}] extra=[${source.extra.join(', ')}]`);
  }
}
for (const list of playwrightReports.filter(report => report.expected_source_set)) {
  if (!list.ok) {
    errors.push(`${list.path} drift: missing=[${list.missing.join(', ')}] extra=[${list.extra.join(', ')}] unknown=[${list.unknown.join(', ')}]`);
  }
}

const warnings = playwrightReports
  .filter(report => !report.expected_source_set && report.unknown.length > 0)
  .map(report => `${report.path} contains legacy or unknown app selectors: ${report.unknown.join(', ')}`);
=======
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const inventoryPath = path.join(evidenceRoot, 'app-inventory.json');
const driftPath = path.join(evidenceRoot, 'manifest-drift.json');
const validationTargets = [
  {
    path: 'test/e2e/validate-all-applications.test.ts',
    expected_source_set: 'app-inventory',
  },
];

const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const existing = fs.existsSync(driftPath)
  ? JSON.parse(fs.readFileSync(driftPath, 'utf8'))
  : {};
const canonicalIds = inventory.apps.map(app => app.id);
const allowedIds = new Set([...canonicalIds, ...Object.keys(inventory.aliases ?? {})]);
const warnings = [];
const errors = [];

const playwrightAppLists = validationTargets.map(target => {
  const absolutePath = path.join(projectRoot, target.path);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const actualIds = [...source.matchAll(/data-app="([^"]+)"/g)]
    .map(match => match[1])
    .filter(id => !id.includes('$'));
  const uniqueActualIds = [...new Set(actualIds)];
  const unknown = uniqueActualIds.filter(id => !allowedIds.has(id));
  const missing = canonicalIds.filter(id => !uniqueActualIds.includes(id));
  const duplicate = uniqueActualIds.filter(id => actualIds.filter(candidate => candidate === id).length > 1);
  const ok = unknown.length === 0 && missing.length === 0 && duplicate.length === 0;

  if (!ok) {
    warnings.push(`${target.path} does not match the current app inventory selectors.`);
  }

  return {
    path: target.path,
    expected_source_set: target.expected_source_set,
    expected_count: canonicalIds.length,
    actual_count: uniqueActualIds.length,
    unknown,
    missing,
    extra: unknown,
    duplicate,
    ok,
  };
});

const mergedPlaywrightLists = [
  ...(existing.playwright_app_lists ?? []).filter(
    entry => !validationTargets.some(target => target.path === entry.path),
  ),
  ...playwrightAppLists,
];
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

const report = {
  schema: 'swissknife.virtual-desktop-manifest-drift.v1',
  generated_at: new Date().toISOString(),
<<<<<<< HEAD
  manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
  manifest_version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
  valid: errors.length === 0,
  errors,
  warnings,
  strict_sources: strictSources,
  playwright_app_lists: playwrightReports,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (!report.valid) {
  console.error(JSON.stringify({ valid: report.valid, errors: report.errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  valid: report.valid,
  strict_source_count: strictSources.length,
  warnings: warnings.length,
  report_path: path.relative(root, reportPath),
}, null, 2));
=======
  manifest_id: inventory.manifest_id,
  manifest_version: inventory.manifest_version,
  valid: errors.length === 0 && warnings.length === 0,
  errors,
  warnings,
  strict_sources: existing.strict_sources ?? [],
  playwright_app_lists: mergedPlaywrightLists,
};

fs.mkdirSync(evidenceRoot, { recursive: true });
fs.writeFileSync(driftPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  valid: report.valid,
  error_count: report.errors.length,
  warning_count: report.warnings.length,
  checked_playwright_lists: playwrightAppLists.length,
  output: path.relative(projectRoot, driftPath),
}, null, 2));

if (!report.valid) process.exitCode = 1;
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
