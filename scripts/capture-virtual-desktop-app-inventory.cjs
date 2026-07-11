#!/usr/bin/env node

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
const workspaceRoot = path.resolve(root, '..');
const evidenceRoot = path.join(root, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const inventoryPath = path.join(evidenceRoot, 'app-inventory.json');
const inventoryMarkdownPath = path.join(evidenceRoot, 'app-inventory.md');
const baselinePath = path.join(
  workspaceRoot,
  'data',
  'swissknife_virtual_desktop',
  'discovery',
  'app-inventory-baseline.md',
);

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

function idsFromBrowserRuntimeMap() {
  const activeRuntimeIds = new Set(idsFromAppsSet(read('web/js/main-simple.js')));
  return expectedForSource('browser-main').filter(id => activeRuntimeIds.has(id));
}

function docAppIds() {
  return unique(
    fs.readdirSync(path.join(root, 'docs', 'applications'))
      .filter(name => name.endsWith('.md'))
      .map(name => name.replace(/\.md$/, ''))
      .filter(id => ![
        'README',
        'all-mcp-tools-policy',
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
  for (const alias of app.aliases) {
    aliasToCanonical.set(alias, app.id);
  }
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

function sourceInventory(name, sourceSet, actualIds, relPath) {
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
    ids: actual,
    missing,
    extra,
  };
}

function buildSourceInventories() {
  const indexHtml = read('web/index.html');
  const systemMenuMarker = '<!-- System Menu -->';
  const systemMenuOffset = indexHtml.indexOf(systemMenuMarker);
  const desktopHtml = systemMenuOffset >= 0 ? indexHtml.slice(0, systemMenuOffset) : indexHtml;
  const menuHtml = systemMenuOffset >= 0 ? indexHtml.slice(systemMenuOffset) : '';

  return [
    sourceInventory('web index desktop icons', 'web-index-desktop', idsFromDataApp(desktopHtml), 'web/index.html'),
    sourceInventory('web index start menu', 'web-index-start-menu', idsFromDataApp(menuHtml), 'web/index.html'),
    sourceInventory('web js main registry', 'web-js-main', idsFromAppsSet(read('web/js/main.js')), 'web/js/main.js'),
    sourceInventory('web js main-simple registry', 'web-js-main-simple', idsFromAppsSet(read('web/js/main-simple.js')), 'web/js/main-simple.js'),
    sourceInventory('browser runtime canonical app subset', 'browser-main', idsFromBrowserRuntimeMap(), 'web/js/main-simple.js'),
    sourceInventory('list-all-applications script', 'list-all-applications', idsFromObjectIdList(read('scripts/list-all-applications.cjs')), 'scripts/list-all-applications.cjs'),
    sourceInventory('batch-test-apps script', 'batch-test-apps', idsFromObjectIdList(read('scripts/batch-test-apps.cjs')), 'scripts/batch-test-apps.cjs'),
    sourceInventory('docs applications', 'docs-applications', docAppIds(), 'docs/applications'),
    sourceInventory('glasses registry', 'glasses-registry', GLASSES_APP_REGISTRY.map(entry => entry.id), 'src/services/glasses/glasses-app-control-plane.ts'),
    sourceInventory('idl generated apps', 'idl-generated', IPFS_IDL_DESCRIPTORS.map(descriptor => descriptor.name), 'src/services/idl-to-glasses-compiler.ts'),
  ];
}

function countBy(entries, key) {
  return entries.reduce((acc, entry) => {
    const value = entry[key] ?? 'unknown';
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function countArrayValues(entries, key) {
  return entries.reduce((acc, entry) => {
    for (const value of entry[key] ?? []) {
      acc[value] = (acc[value] ?? 0) + 1;
    }
    return acc;
  }, {});
}

function markdownReport(report) {
  const lines = [];
  lines.push('# SwissKnife Virtual Desktop App Inventory');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Manifest: ${report.manifest_id} (${report.manifest_version})`);
  lines.push(`Apps: ${report.app_count}`);
  lines.push(`Aliases: ${report.summary.alias_count}`);
  lines.push('');
  lines.push('## Source Sets');
  lines.push('');
  lines.push('| Source | Expected | Actual | Status | Missing | Extra |');
  lines.push('| --- | ---: | ---: | --- | --- | --- |');
  for (const source of report.source_sets) {
    lines.push(`| ${source.source_set} | ${source.expected_count} | ${source.actual_count} | ${source.ok ? 'ok' : 'drift'} | ${source.missing.join(', ') || '-'} | ${source.extra.join(', ') || '-'} |`);
  }
  lines.push('');
  lines.push('## Apps');
  lines.push('');
  lines.push('| App ID | Title | Category | Launch | Owner | Services | Glasses | Aliases |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const app of report.apps) {
    lines.push(`| ${app.id} | ${app.title} | ${app.category} | ${app.launch_kind} | ${app.owner_module} | ${app.service_families.join(', ')} | ${app.glasses_strategy.kind}:${app.glasses_strategy.handoff} | ${app.aliases.join(', ') || '-'} |`);
  }
  lines.push('');
  lines.push('## Drift Summary');
  lines.push('');
  lines.push(`Drift sources: ${report.summary.drift_source_count}`);
  if (report.summary.drift_source_count === 0) {
    lines.push('');
    lines.push('No source-set drift detected.');
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const sourceSets = buildSourceInventories();
  const apps = manifestEntries.map(app => ({
    id: app.id,
    aliases: app.aliases,
    title: app.title,
    category: app.category,
    owner_module: app.owner_module,
    launch_kind: app.launch_kind,
    component: app.component ?? null,
    source_sets: app.source_sets,
    capabilities: app.capabilities,
    service_families: app.service_families,
    glasses_strategy: app.glasses_strategy,
    required_test_coverage: app.required_test_coverage,
    notes: app.notes ?? [],
  }));
  const report = {
    schema: 'swissknife.virtual-desktop-app-inventory.v1',
    generated_at: new Date().toISOString(),
    manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
    manifest_version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
    app_count: apps.length,
    summary: {
      app_count: apps.length,
      alias_count: Array.from(aliasToCanonical.keys()).length,
      category_counts: countBy(apps, 'category'),
      launch_kind_counts: countBy(apps, 'launch_kind'),
      owner_module_counts: countBy(apps, 'owner_module'),
      service_family_counts: countArrayValues(apps, 'service_families'),
      source_count: sourceSets.length,
      drift_source_count: sourceSets.filter(source => !source.ok).length,
      visible_desktop_count: expectedForSource('web-index-desktop').length,
      generated_service_count: apps.filter(app => app.launch_kind === 'idl-generated' || app.launch_kind === 'service-surface').length,
    },
    aliases: Object.fromEntries(Array.from(aliasToCanonical.entries()).sort()),
    source_sets: sourceSets,
    apps,
  };

  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  const markdown = markdownReport(report);
  fs.writeFileSync(inventoryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(inventoryMarkdownPath, markdown, 'utf8');
  fs.writeFileSync(baselinePath, markdown, 'utf8');

  console.log(JSON.stringify({
    inventory_path: path.relative(root, inventoryPath),
    inventory_markdown_path: path.relative(root, inventoryMarkdownPath),
    baseline_path: path.relative(workspaceRoot, baselinePath),
    app_count: report.app_count,
    drift_source_count: report.summary.drift_source_count,
  }, null, 2));

  if (report.summary.drift_source_count > 0) {
    process.exit(1);
  }
}

main();
