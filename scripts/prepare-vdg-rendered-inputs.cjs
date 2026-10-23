#!/usr/bin/env node
'use strict';

/** Reuse a verified live DOM inventory without importing a VOG GO decision.
 * This projection does not click controls, invoke tools, or resolve VDG gaps.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EVIDENCE_ROOT = path.resolve(__dirname, '../test-results/virtual-desktop-ipfs-mcp-orb');
const SOURCES = ['vog/rendered-control-census.json', 'vog/orb-idl-control-matrix.json'];
const OUTPUTS = ['control-census.json', 'control-tool-matrix.json'];
const ADAPTER = 'prepare-vdg-rendered-inputs@1';
const DISPOSITIONS = new Set(['invoke', 'confirm-then-invoke', 'deny', 'local-only', 'external-provider', 'unsupported']);
const FAMILIES = new Set(['storage', 'datasets', 'accelerate', 'network', 'control', 'local']);
const IDL_METHODS = new Set(['read_status', 'read_receipts', 'request_action', 'request_fallback', 'request_prompt_steering', 'none']);
const text = value => typeof value === 'string' && value.trim().length > 0;
const key = row => JSON.stringify([row.app_id, row.launch_id, row.selector]);
const same = (left, right) => JSON.stringify(semanticValue(left)) === JSON.stringify(semanticValue(right));

function semanticValue(value, field = '', parent = '') {
  if (Array.isArray(value)) {
    const result = value.map(item => semanticValue(item));
    if (field === 'rows' || field === 'app_ids' || field === 'launch_ids' || parent === 'family_lanes') {
      result.sort((left, right) => {
        const first = JSON.stringify(left);
        const second = JSON.stringify(right);
        return first < second ? -1 : first > second ? 1 : 0;
      });
    }
    return result;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter(name => name !== 'generated_at')
      .map(name => [name, semanticValue(value[name], name, field)]));
  }
  return value;
}

function semanticHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(semanticValue(value))).digest('hex');
}

function fail(message) { throw new Error(message); }
function familyName(value) {
  const match = typeof value === 'string' && value.match(/^vog-(.+)$/);
  if (!match || !FAMILIES.has(match[1])) fail(`invalid VOG family: ${value}`);
  return `vdg-${match[1]}`;
}
function assertRows(payload, label) {
  if (!Array.isArray(payload.rows) || !payload.rows.length) fail(`${label} has no control rows`);
  if (payload.row_count !== payload.rows.length) fail(`${label} row_count does not match rows`);
  const keys = new Set();
  const launches = new Map();
  for (const row of payload.rows) {
    if (!row || !['app_id', 'launch_id', 'selector'].every(field => text(row[field]))) fail(`${label} row identity is incomplete`);
    if (/\$\{|escapeHTML|\{\{|<%/i.test(row.selector)) fail(`${label} contains a template selector`);
    if ((row.clicked !== undefined && row.clicked !== false) || (row.source_template !== undefined && row.source_template !== false)
      || row.collection === 'source-template' || row.evidence === 'source-template') fail(`${label} row is not unclicked live DOM evidence`);
    const identity = key(row);
    if (keys.has(identity)) fail(`${label} contains duplicate control ${identity}`);
    keys.add(identity);
    if (launches.has(row.launch_id) && launches.get(row.launch_id) !== row.app_id) fail(`${label} launch id names more than one app`);
    launches.set(row.launch_id, row.app_id);
  }
  return keys;
}
function counts(rows, field) {
  return rows.reduce((result, row) => { result[row[field]] = (result[row[field]] || 0) + 1; return result; }, {});
}

function validateSources(census, matrix) {
  if (!census || census.schema !== 'swissknife.rendered-control-census.v1'
    || census.collection !== 'live-dom' || census.source_template !== false || census.clicked !== false) {
    fail('rendered census must declare the live-dom schema, source_template:false, and clicked:false');
  }
  if (!matrix || matrix.schema !== 'swissknife.orb-idl-control-matrix.v1' || matrix.collection !== 'census-ledger-join' || matrix.clicked !== false
    || (matrix.source_template !== undefined && matrix.source_template !== false)) fail('VOG matrix schema or unclicked evidence is invalid');
  const censusKeys = assertRows(census, 'rendered census');
  const matrixKeys = assertRows(matrix, 'VOG matrix');
  if (censusKeys.size !== matrixKeys.size || [...censusKeys].some(identity => !matrixKeys.has(identity))) {
    fail('VOG matrix must cover the exact census app/launch/selector keys; alias loss is not allowed');
  }
  for (const row of census.rows) {
    if (!text(row.role) || typeof row.accessible_name !== 'string') fail('rendered census row role or accessible_name is missing');
  }
  const appIds = [...new Set(census.rows.map(row => row.app_id))].sort();
  if (census.app_count !== appIds.length) fail('rendered census app_count does not match rows');
  if (!Array.isArray(matrix.app_ids) || new Set(matrix.app_ids).size !== matrix.app_ids.length
    || !same([...matrix.app_ids].sort(), appIds)) fail('VOG matrix app_ids do not match the live census');
  if (!matrix.family_lanes || typeof matrix.family_lanes !== 'object' || Array.isArray(matrix.family_lanes)) fail('VOG matrix family_lanes are missing');
  const familyForApp = new Map();
  for (const [family, apps] of Object.entries(matrix.family_lanes)) {
    familyName(family);
    if (!Array.isArray(apps) || apps.some(app => !text(app)) || new Set(apps).size !== apps.length) fail('VOG matrix family membership is invalid');
    for (const app of apps) {
      if (familyForApp.has(app)) fail(`app appears in multiple VOG families: ${app}`);
      familyForApp.set(app, family);
    }
  }
  if (!same([...familyForApp.keys()].sort(), appIds)) fail('VOG family app membership does not match the live census');
  for (const row of matrix.rows) {
    familyName(row.family);
    if (familyForApp.get(row.app_id) !== row.family) fail(`control family does not match app membership: ${row.app_id}`);
    if (!DISPOSITIONS.has(row.disposition) || !text(row.reason)) fail(`control disposition or reason is invalid: ${key(row)}`);
    if (row.clicked !== false) fail('VOG matrix rows must have clicked:false');
    if (row.idl_method !== undefined && !IDL_METHODS.has(row.idl_method)) fail(`control IDL method is invalid: ${key(row)}`);
    if (['invoke', 'confirm-then-invoke', 'deny'].includes(row.disposition) && !text(row.tool_id)) fail(`invoking control is missing tool_id: ${key(row)}`);
  }
  if (matrix.disposition_counts !== undefined && !same(matrix.disposition_counts, counts(matrix.rows, 'disposition'))) fail('VOG matrix disposition_counts do not match rows');
  if (matrix.uncovered_app_visible_tools !== undefined && !Array.isArray(matrix.uncovered_app_visible_tools)) fail('VOG source gap rows are invalid');
  if (matrix.uncovered_app_visible_count !== undefined && matrix.uncovered_app_visible_count !== (matrix.uncovered_app_visible_tools || []).length) fail('VOG source gap count does not match source gap rows');
  return { appIds, launchIds: [...new Set(census.rows.map(row => row.launch_id))].sort() };
}

function deriveRenderedInputs(census, matrix) {
  const { appIds, launchIds } = validateSources(census, matrix);
  const joined = new Map(matrix.rows.map(row => [key(row), row]));
  const provenance = {
    adapter: ADAPTER,
    sources: [census, matrix].map((source, index) => ({ path: SOURCES[index], semantic_sha256: semanticHash(source) })),
    live_dom: { collection: 'live-dom', source_template: false, clicked: false,
      row_count: census.rows.length, app_count: appIds.length, launch_count: launchIds.length },
    source_coverage_claims: {
      authority: 'historical-only; current VDG contract validation is required',
      decision: matrix.decision ?? null,
      uncovered_app_visible_count: matrix.uncovered_app_visible_count ?? null,
    },
  };
  const common = { source_template: false, clicked: false, decision: 'no_go', coverage_status: 'not_evaluated',
    provenance, input_fingerprint: semanticHash(provenance), work_complete: false, completion_authority: false };
  const censusRows = census.rows.map(row => {
    const binding = joined.get(key(row));
    return { ...structuredClone(row),
      data_action: binding.data_action || row.data_action || '',
      data_capability: binding.data_capability || row.data_capability || '',
      data_live_gateway_binding: binding.data_live_gateway_binding || row.data_live_gateway_binding || '',
      disposition: binding.disposition, evidence: 'live-dom', source_template: false, clicked: false };
  });
  const matrixRows = matrix.rows.map(row => ({ ...structuredClone(row), family: familyName(row.family) }));
  const censusOutput = { schema: 'swissknife.virtual-desktop-control-census.v1', collection: 'live-dom', ...common,
    app_count: appIds.length, app_ids: appIds, launch_ids: launchIds, row_count: censusRows.length, rows: censusRows };
  const matrixOutput = { schema: 'swissknife.virtual-desktop-control-tool-matrix.v1', collection: 'live-dom-census-matrix-join', ...common,
    app_ids: appIds, launch_ids: launchIds,
    family_lanes: Object.fromEntries(Object.entries(matrix.family_lanes).map(([family, apps]) => [familyName(family), [...apps]])),
    row_count: matrixRows.length, disposition_counts: counts(matrixRows, 'disposition'),
    uncovered_app_visible_tools: structuredClone(matrix.uncovered_app_visible_tools || []),
    uncovered_app_visible_count: null, rows: matrixRows };
  return { census: censusOutput, matrix: matrixOutput };
}

function loadInputs(evidenceRoot, freshSource = false, options = {}) {
  if (freshSource) {
    const census = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'vdg/inventory/rendered-control-census.json'), 'utf8'));
    const sourceFingerprint = require('./vdg-inventory-contract.cjs').assertInventorySource(census, options);
    const { require: tsxRequire } = require('tsx/cjs/api');
    const filename = path.resolve(__dirname, '../src/services/apps/all-app-executable-backend-contract.ts');
    const { ALL_APP_EXECUTABLE_BACKEND_CONTRACT } = tsxRequire(filename, __filename);
    const inputs = require('./build-vdg-inputs.cjs').deriveFreshInputs(census, ALL_APP_EXECUTABLE_BACKEND_CONTRACT);
    inputs.catalog = tsxRequire(path.resolve(__dirname, '../src/services/mcp/all-tools-disposition-catalog.ts'), __filename).ALL_TOOLS_DISPOSITION_CATALOG;
    const discovery = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'vdg/inventory/owner-tools.json'), 'utf8'));
    if (!/^vdg\/inventory\/history\/[a-f0-9]{64}\.json$/.test(discovery.historical_path || '')) fail('historical ledger archive path invalid');
    const historicalBytes = fs.readFileSync(path.join(evidenceRoot, discovery.historical_path));
    if (crypto.createHash('sha256').update(historicalBytes).digest('hex') !== path.basename(discovery.historical_path, '.json')) fail('historical ledger archive hash mismatch');
    inputs.ledger = require('./vdg-current-binding-ledger.cjs').deriveCurrentBindingLedger({ historical: JSON.parse(historicalBytes),
      historicalPath: discovery.historical_path, discovery, contract: ALL_APP_EXECUTABLE_BACKEND_CONTRACT, matrix: inputs.matrix, catalog: inputs.catalog });
    require('./vdg-inventory-contract.cjs').assertStableInventorySource(sourceFingerprint, options);
    inputs.inventorySourceFingerprint = sourceFingerprint;
    return inputs;
  }
  for (const relative of ['vdg/inventory/rendered-control-census.json', ...OUTPUTS]) {
    let existing;
    try { existing = JSON.parse(fs.readFileSync(path.join(evidenceRoot, relative), 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT' || (error instanceof SyntaxError && !relative.startsWith('vdg/inventory/'))) continue;
      throw error;
    }
    if (existing.provenance?.adapter === 'fresh-vdg-live-dom@1'
      || (relative.startsWith('vdg/inventory/') && existing.schema === 'swissknife.rendered-control-census.v1'
        && existing.collection === 'live-dom' && existing.source_template === false)) fail('legacy_projection_superseded_requires_fresh_source: current VDG inventory requires --fresh-source');
  }
  const source = SOURCES.map(relative => {
    try { return JSON.parse(fs.readFileSync(path.join(evidenceRoot, relative), 'utf8')); }
    catch (error) { fail(`cannot read ${relative}: ${error.code || error.message}`); }
  });
  return deriveRenderedInputs(...source);
}

function checkRenderedInputs(options = {}) {
  const evidenceRoot = path.resolve(options.evidenceRoot || process.env.VDG_EVIDENCE_ROOT || EVIDENCE_ROOT);
  const expected = loadInputs(evidenceRoot, options.freshSource, options);
  for (const [relative, value] of [[OUTPUTS[0], expected.census], [OUTPUTS[1], expected.matrix], ...(expected.catalog ? [['all-tools-disposition-catalog.json', expected.catalog]] : []), ...(expected.ledger ? [['all-app-live-binding-gap-ledger.json', expected.ledger]] : [])]) {
    let actual;
    try { actual = JSON.parse(fs.readFileSync(path.join(evidenceRoot, relative), 'utf8')); }
    catch (error) { fail(`cannot read generated ${relative}: ${error.code || error.message}`); }
    if (!same(actual, value)) fail(`generated ${relative} differs from validated live sources or provenance`);
  }
  if (options.freshSource) require('./vdg-inventory-contract.cjs').assertStableInventorySource(expected.inventorySourceFingerprint, options);
  return expected;
}

function prepareRenderedInputs(options = {}) {
  const evidenceRoot = path.resolve(options.evidenceRoot || process.env.VDG_EVIDENCE_ROOT || EVIDENCE_ROOT);
  const outputs = loadInputs(evidenceRoot, options.freshSource, options);
  const pending = [];
  try {
    for (const [relative, value] of [[OUTPUTS[0], outputs.census], [OUTPUTS[1], outputs.matrix], ...(outputs.catalog ? [['all-tools-disposition-catalog.json', outputs.catalog]] : []), ...(outputs.ledger ? [['all-app-live-binding-gap-ledger.json', outputs.ledger]] : [])]) {
      const filename = path.join(evidenceRoot, relative);
      const temporary = `${filename}.${process.pid}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
      pending.push({ filename, temporary });
    }
    if (options.freshSource) require('./vdg-inventory-contract.cjs').assertStableInventorySource(outputs.inventorySourceFingerprint, options);
    for (const { filename, temporary } of pending) fs.renameSync(temporary, filename);
  } finally {
    for (const { temporary } of pending) fs.rmSync(temporary, { force: true });
  }
  return outputs;
}

function main(argv = process.argv.slice(2)) {
  let check = false;
  let evidenceRoot;
  let freshSource = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--check') check = true;
    else if (argv[index] === '--fresh-source') freshSource = true;
    else if (argv[index] === '--evidence-root' && argv[index + 1] && !argv[index + 1].startsWith('--')) evidenceRoot = argv[++index];
    else fail('usage: prepare-vdg-rendered-inputs.cjs [--check] [--evidence-root PATH]');
  }
  const result = check ? checkRenderedInputs({ evidenceRoot, freshSource }) : prepareRenderedInputs({ evidenceRoot, freshSource });
  console.log(`VDG live DOM inputs ${check ? 'verified' : 'prepared'}: apps=${result.census.app_count} controls=${result.census.row_count}; coverage not evaluated`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { deriveRenderedInputs, validateSources, semanticHash, checkRenderedInputs, prepareRenderedInputs, main };
