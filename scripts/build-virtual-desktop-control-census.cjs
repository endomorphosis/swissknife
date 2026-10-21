#!/usr/bin/env node
/**
 * VDG-011: census native virtual-desktop controls from source.
 *
 * This does not click tool buttons and does not claim a live browser launch.
 * Shell chrome is local-only. Every other control stays unclassified until a
 * later task joins it to a tool.
 */

const fs = require('node:fs');
const path = require('node:path');

require('tsx/cjs');

const { VIRTUAL_DESKTOP_APP_MANIFEST } = require('../src/services/apps/virtual-desktop-app-manifest.ts');

const projectRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(projectRoot, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const jsonPath = path.join(evidenceRoot, 'control-census.json');
const specPath = path.join(projectRoot, 'test', 'e2e', 'virtual-desktop-control-census.spec.ts');
const appsDir = path.join(projectRoot, 'web', 'js', 'apps');
const shellSource = path.join(projectRoot, 'web', 'js', 'main.js');

const SHELL_ACTIONS = [
  { action: 'minimize', name: 'Minimize', role: 'menuitem' },
  { action: 'maximize', name: 'Maximize', role: 'menuitem' },
  { action: 'close', name: 'Close', role: 'menuitem' },
];
const LOCAL_ONLY_ACTIONS = new Set(['minimize', 'maximize', 'close', 'cancel', 'cancel-evidence-persist']);
const REQUIRED = [
  'app_id',
  'launch_id',
  'selector',
  'role',
  'accessible_name',
  'data_action',
  'data_capability',
  'data_live_gateway_binding',
  'disposition',
];

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return '';
  }
}

function sourceFor(appId) {
  const direct = path.join(appsDir, `${appId}.js`);
  if (fs.existsSync(direct)) return direct;
  const names = fs.readdirSync(appsDir).filter(name => name.endsWith('.js'));
  const prefixed = names.find(name => name.startsWith(`${appId}-`) || name.startsWith(`${appId}.`));
  return prefixed ? path.join(appsDir, prefixed) : '';
}

function attr(source, name) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*["'\`]([^"'\`]*)["'\`]`, 'i'));
  return match ? match[1].trim() : '';
}

function accessibleName(tag, inner) {
  return attr(tag, 'aria-label')
    || attr(tag, 'title')
    || inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function controlsFromSource(source) {
  const found = [];
  const seen = new Set();
  const buttonRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let match;
  while ((match = buttonRe.exec(source))) {
    const tag = match[1];
    const action = attr(tag, 'data-action');
    const binding = attr(tag, 'data-live-gateway-binding');
    const name = accessibleName(tag, match[2]);
    const className = attr(tag, 'class');
    const selector = action
      ? `[data-action="${action}"]`
      : binding
        ? `[data-live-gateway-binding="${binding}"]`
        : name
          ? `button[aria-label="${name}"]`
          : '';
    // Dialog templates and uninterpolated source strings are not controls of
    // the open window. Counting them makes a live click look for nodes that
    // are not in the document.
    if (!selector || selector.includes('${') || name.includes('${') || selector.includes('\n') || name.includes('\n') || /\biv-governed-/.test(className) || seen.has(selector)) continue;
    seen.add(selector);
    found.push({
      selector,
      role: attr(tag, 'role') || 'button',
      accessible_name: name,
      data_action: action,
      data_capability: attr(tag, 'data-capability'),
      data_live_gateway_binding: binding,
      disposition: LOCAL_ONLY_ACTIONS.has(action) ? 'local-only' : 'unclassified',
    });
  }
  const actionRe = /data-action\s*=\s*["'`]([^"'`]+)["'`]/gi;
  while ((match = actionRe.exec(source))) {
    const action = match[1].trim();
    const selector = `[data-action="${action}"]`;
    if (!action || seen.has(selector)) continue;
    seen.add(selector);
    const windowText = source.slice(Math.max(0, match.index - 180), match.index + 180);
    found.push({
      selector,
      role: attr(windowText, 'role') || 'button',
      accessible_name: accessibleName(windowText, ''),
      data_action: action,
      data_capability: attr(windowText, 'data-capability'),
      data_live_gateway_binding: attr(windowText, 'data-live-gateway-binding'),
      disposition: LOCAL_ONLY_ACTIONS.has(action) ? 'local-only' : 'unclassified',
    });
  }
  return found;
}

function rowFor(appId, launchId, control, source) {
  return {
    app_id: appId,
    launch_id: launchId,
    selector: control.selector,
    role: control.role,
    accessible_name: control.accessible_name,
    data_action: control.data_action,
    data_capability: control.data_capability,
    data_live_gateway_binding: control.data_live_gateway_binding,
    disposition: control.disposition,
    evidence: 'source-template',
    source: path.relative(repoRoot, source),
    clicked: false,
  };
}

function shellRows(appId, launchId) {
  return SHELL_ACTIONS.map(control => rowFor(appId, launchId, {
    selector: `[data-action="${control.action}"]`,
    role: control.role,
    accessible_name: control.name,
    data_action: control.action,
    data_capability: '',
    data_live_gateway_binding: '',
    disposition: 'local-only',
  }, shellSource));
}

function buildRows() {
  const rows = [];
  const missingSources = [];
  for (const app of VIRTUAL_DESKTOP_APP_MANIFEST.apps) {
    const source = sourceFor(app.id);
    const native = source ? controlsFromSource(readText(source)) : [];
    if (!source) missingSources.push(app.id);
    const launchIds = [app.id, ...(app.aliases || [])];
    for (const launchId of launchIds) {
      rows.push(...shellRows(app.canonical_id || app.id, launchId));
      for (const control of native) {
        rows.push(rowFor(app.canonical_id || app.id, launchId, control, source));
      }
    }
  }
  return { rows, missingSources };
}

function assertCensus(rows) {
  const launchIds = new Set();
  for (const app of VIRTUAL_DESKTOP_APP_MANIFEST.apps) {
    launchIds.add(app.id);
    for (const alias of app.aliases || []) launchIds.add(alias);
  }
  const seen = new Set(rows.map(row => row.launch_id));
  const missing = [...launchIds].filter(id => !seen.has(id));
  if (missing.length) {
    throw new Error(`census missed launch ids: ${missing.join(', ')}`);
  }
  for (const row of rows) {
    for (const key of REQUIRED) {
      if (typeof row[key] !== 'string') throw new Error(`row missing ${key}`);
    }
    if (row.disposition !== 'local-only' && row.disposition !== 'unclassified') {
      throw new Error(`bad disposition ${row.disposition}`);
    }
    if (row.clicked !== false) throw new Error('census clicked a control');
  }
}

function writeSpec() {
  const spec = `import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const censusPath = path.resolve(
  __dirname,
  '../../test-results/virtual-desktop-ipfs-mcp-orb/control-census.json',
);

test('virtual desktop control census names every launch id', () => {
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  expect(census.schema).toBe('swissknife.virtual-desktop-control-census.v1');
  expect(census.collection).toBe('source-template');
  expect(census.clicked).toBe(false);
  expect(census.rows.length).toBeGreaterThan(0);
  for (const row of census.rows) {
    expect(row.app_id).toEqual(expect.any(String));
    expect(row.launch_id).toEqual(expect.any(String));
    expect(row.selector).toEqual(expect.any(String));
    expect(row.role).toEqual(expect.any(String));
    expect(row.accessible_name).toEqual(expect.any(String));
    expect(row.data_action).toEqual(expect.any(String));
    expect(row.data_capability).toEqual(expect.any(String));
    expect(row.data_live_gateway_binding).toEqual(expect.any(String));
    expect(['unclassified', 'local-only']).toContain(row.disposition);
    expect(row.clicked).toBe(false);
  }
  const launchIds = new Set(census.rows.map(row => row.launch_id));
  for (const id of census.launch_ids) expect(launchIds.has(id)).toBe(true);
});
`;
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, spec);
}

function main() {
  const { rows, missingSources } = buildRows();
  assertCensus(rows);
  const launchIds = [];
  for (const app of VIRTUAL_DESKTOP_APP_MANIFEST.apps) {
    launchIds.push(app.id, ...(app.aliases || []));
  }
  const payload = {
    schema: 'swissknife.virtual-desktop-control-census.v1',
    generated_at: new Date().toISOString(),
    collection: 'source-template',
    clicked: false,
    app_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
    launch_ids: launchIds,
    missing_sources: missingSources,
    row_count: rows.length,
    rows,
  };
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeSpec();
  process.stdout.write(`${JSON.stringify({
    decision: 'census_written',
    app_count: payload.app_count,
    launch_count: launchIds.length,
    row_count: rows.length,
    missing_sources: missingSources,
    clicked: false,
    outputs: [
      path.relative(projectRoot, jsonPath),
      path.relative(projectRoot, specPath),
    ],
  }, null, 2)}\n`);
}

main();
