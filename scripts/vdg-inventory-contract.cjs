'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inventorySourceFingerprint } = require('./vdg-capture-fingerprint.cjs');

const SOURCE_ROOT = path.resolve(__dirname, '..');
const RAW_CENSUS = 'vdg/inventory/rendered-control-census.json';
function roots(options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot || SOURCE_ROOT);
  return { sourceRoot, evidenceRoot: path.resolve(options.evidenceRoot || process.env.VDG_EVIDENCE_ROOT
    || path.join(sourceRoot, 'test-results/virtual-desktop-ipfs-mcp-orb')) };
}
function assertStableInventorySource(expected, options = {}) {
  if (!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('inventory_source_unbound: live census needs a valid source_fingerprint');
  const current = inventorySourceFingerprint(roots(options));
  if (expected !== current) throw new Error('inventory_source_stale: desktop source, routing, or public fixtures changed; recollect the live DOM inventory');
  return current;
}
function assertInventorySource(census, options = {}) {
  if (census?.schema !== 'swissknife.rendered-control-census.v1' || census.collection !== 'live-dom'
    || census.source_template !== false || census.clicked !== false) throw new Error('inventory_not_live_dom: invalid rendered census');
  return assertStableInventorySource(census.source_fingerprint, options);
}
function inspectInventory(options = {}, dependencies = {}) {
  const locations = roots(options);
  try {
    const census = JSON.parse(fs.readFileSync(path.join(locations.evidenceRoot, RAW_CENSUS), 'utf8'));
    const fingerprint = assertInventorySource(census, locations);
    const check = dependencies.checkRenderedInputs || require('./prepare-vdg-rendered-inputs.cjs').checkRenderedInputs;
    check({ ...locations, freshSource: true });
    assertStableInventorySource(fingerprint, locations);
    return { schema: 'swissknife.vdg-inventory-contract.v1', current: true, source_fingerprint: fingerprint,
      work_complete: false, completion_authority: false };
  } catch (error) {
    return { schema: 'swissknife.vdg-inventory-contract.v1', current: false, reason: error.message,
      work_complete: false, completion_authority: false };
  }
}
function commitInventoryCensus(census, outputPath, options = {}) {
  const fingerprint = assertInventorySource(census, options);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(census, null, 2)}\n`, { flag: 'wx' });
    assertStableInventorySource(fingerprint, options);
    fs.renameSync(temporary, outputPath);
  } finally { fs.rmSync(temporary, { force: true }); }
}

// Only actual CLI entrypoints call this guard. Injected family algorithms stay
// pure; read-only callers never create directories, acquire locks or produce.
function ensureInventory(options = {}, dependencies = {}) {
  const locations = roots(options);
  const inspect = dependencies.inspectInventory || inspectInventory;
  const log = dependencies.log || (message => console.error(message));
  let status = inspect(locations);
  if (status.current === true) return 0;
  log(`VDG inventory stale: ${status.reason}`);
  if (options.check) return 75;
  const execute = dependencies.spawnSync || spawnSync;
  const result = execute(process.execPath, [path.join(SOURCE_ROOT, 'scripts/refresh-vdg-inventory.mjs'), '--if-stale'], {
    cwd: SOURCE_ROOT, env: { ...(options.env || process.env), VDG_EVIDENCE_ROOT: locations.evidenceRoot },
    stdio: 'inherit', shell: false, timeout: 1800000, killSignal: 'SIGTERM',
  });
  if (result.error || result.status !== 0) return Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
  status = inspect(locations);
  if (status.current === true) return 0;
  log(`VDG inventory remains stale after refresh: ${status.reason}`);
  return 75;
}
module.exports = { RAW_CENSUS, roots, assertInventorySource, assertStableInventorySource, commitInventoryCensus, inspectInventory, ensureInventory };
