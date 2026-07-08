#!/usr/bin/env node

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

const report = {
  schema: 'swissknife.virtual-desktop-manifest-drift.v1',
  generated_at: new Date().toISOString(),
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
