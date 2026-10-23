'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fileHash(filename) { try { return hash(fs.readFileSync(filename)); } catch { return 'missing'; } }
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const CLOCKS = ['generated_at', 'updated_at', 'observed_at', 'collected_at', 'timestamp'];
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const ordered = values => values.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
function inventoryProjection(value, family, definition) {
  const apps = new Set(definition.apps);
  // Unknown/ambiguous scope is global: it cannot silently disappear from the
  // capture identity. The final family validator still reads the full inputs.
  const relevant = row => !text(row?.app_id) || apps.has(row.app_id) || row.family === family;
  const clocks = value => omit(value, CLOCKS);
  const fresh = value.provenance?.adapter === 'fresh-vdg-live-dom@1';
  const census = value.schema === 'swissknife.virtual-desktop-control-census.v1' && value.collection === 'live-dom';
  const matrix = value.schema === 'swissknife.virtual-desktop-control-tool-matrix.v1' && value.collection === 'live-dom-current-contract-join';
  if (fresh && (census || matrix)) {
    if (!Array.isArray(value.rows) || value.row_count !== value.rows.length
      || !Array.isArray(value.app_ids) || !value.app_ids.every(text)
      || !Array.isArray(value.launch_ids) || !value.launch_ids.every(text)
      || !Array.isArray(value.provenance.sources)
      || value.rows.some(row => !object(row) || !['app_id', 'launch_id', 'selector', 'family'].every(key => text(row[key]))
        || !value.app_ids.includes(row.app_id) || !value.launch_ids.includes(row.launch_id))
      || (census && value.app_count !== value.app_ids.length)
      || (matrix && (!object(value.family_lanes) || !Array.isArray(value.uncovered_app_visible_tools)
        || value.uncovered_app_visible_count !== null))) return null;
    const rows = value.rows.filter(relevant);
    const launches = new Set(rows.map(row => row.launch_id));
    const provenance = { ...clocks(value.provenance), sources: value.provenance.sources.map(source => {
      if (!object(source)) return source;
      // These two hashes cover all families. Actual source bytes remain bound
      // below; the live inventory is represented by its selected rows here.
      return ['vdg/inventory/rendered-control-census.json', 'src/services/apps/all-app-executable-backend-contract.ts'].includes(source.path)
        ? omit(clocks(source), ['semantic_sha256']) : source;
    }) };
    const result = { ...omit(clocks(value), ['rows', 'row_count', 'app_count', 'app_ids', 'launch_ids', 'family_lanes',
      'disposition_counts', 'uncovered_app_visible_tools', 'uncovered_app_visible_count', 'input_fingerprint']),
    provenance, app_ids: value.app_ids.filter(app => apps.has(app)).sort(),
    launch_ids: value.launch_ids.filter(launch => apps.has(launch) || launches.has(launch)).sort(),
    rows: ordered(rows), row_count: rows.length };
    if (census) result.app_count = result.app_ids.length;
    if (matrix) {
      if (Object.values(value.family_lanes).some(list => !Array.isArray(list) || !list.every(text))) return null;
      result.family_lanes = Object.fromEntries(Object.entries(value.family_lanes).filter(([name, list]) => name === family || list.some(app => apps.has(app))));
      result.uncovered_app_visible_tools = ordered(value.uncovered_app_visible_tools.filter(relevant));
      result.uncovered_app_visible_count = null;
    }
    return result;
  }
  if (value.schema === 'swissknife.all-app-live-binding-gap-ledger.v1'
    && value.provenance?.adapter === 'vdg-current-exact-binding-ledger@1') {
    if (!Array.isArray(value.tools) || !Array.isArray(value.gaps) || !Array.isArray(value.applications)
      || !Array.isArray(value.backend_owners) || !object(value.summary)
      || value.applications.some(app => !object(app) || !text(app.app_id) || !Array.isArray(app.aliases))
      || value.backend_owners.some(owner => !object(owner))
      || value.gaps.some(gap => !object(gap))
      || value.tools.some(tool => !object(tool) || !text(tool.owner) || !text(tool.name) || !object(tool.binding)
        || !Array.isArray(tool.binding.rows) || tool.binding.rows.some(row => !object(row) || !text(row.app_id))
        || tool.binding.app_visible_row_count !== tool.binding.rows.length
        || tool.binding.state !== (tool.binding.rows.length ? 'explicitly-bound' : 'not-app-visible'))
      || value.summary.exact_tool_record_count !== value.tools.length
      || value.summary.app_visible_binding_count !== value.tools.reduce((count, tool) => count + tool.binding.rows.length, 0)
      || value.summary.gap_count !== value.gaps.length) return null;
    const gaps = value.gaps.filter(relevant);
    const tools = value.tools.flatMap(tool => {
      const rows = tool.binding.rows.filter(relevant);
      const disposition = tool.disposition;
      const dispositionApplies = disposition?.kind === 'app_visible' && relevant(disposition);
      const gapApplies = gaps.some(gap => gap.owner === tool.owner && [tool.name, tool.tool_id].includes(gap.tool_id));
      if (!rows.length && !dispositionApplies && !gapApplies) return [];
      return [{ ...omit(clocks(tool), ['history']), binding: { ...clocks(tool.binding), rows: ordered(rows),
        app_visible_row_count: rows.length, state: rows.length ? 'explicitly-bound' : 'not-app-visible' } }];
    });
    return { ...omit(clocks(value), ['tools', 'gaps', 'applications', 'backend_owners', 'summary']),
      provenance: omit(clocks(value.provenance), ['historical_path', 'historical_sha256', 'discovery_sha256',
        'contract_sha256', 'matrix_sha256', 'catalog_sha256']),
      applications: ordered(value.applications.filter(relevant)),
      backend_owners: ordered(value.backend_owners.map(owner => omit(clocks(owner), ['tool_count']))),
      tools: ordered(tools), gaps: ordered(gaps),
      summary: { ...value.summary, exact_tool_record_count: tools.length,
        app_visible_binding_count: tools.reduce((count, tool) => count + tool.binding.rows.length, 0), gap_count: gaps.length } };
  }
  return null;
}
function inventoryHash(filename, family, definition) {
  let bytes;
  try { bytes = fs.readFileSync(filename); } catch { return 'missing'; }
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return hash(bytes); }
  const projection = object(value) ? inventoryProjection(value, family, definition) : null;
  // A historical, future or malformed producer retains full byte identity.
  return projection ? hash(JSON.stringify(canonical(projection))) : hash(bytes);
}
function captureInputFingerprint(family, transport, options = {}) {
  if (!object(options.definition) || !Array.isArray(options.definition.apps)) throw new Error('capture fingerprint requires a declared family definition');
  const sourceRoot = options.sourceRoot || path.resolve(__dirname, '..');
  const evidenceRoot = options.evidenceRoot || path.join(sourceRoot, 'test-results/virtual-desktop-ipfs-mcp-orb');
  const shared = [
    'scripts/run-vdg-family.mjs', 'scripts/vdg-capture-fingerprint.cjs', 'scripts/build-gui-mcp-coverage.cjs', 'scripts/vdg-evidence.cjs', 'scripts/vdg-connector-artifacts.cjs',
    'scripts/check-vdg-capture.cjs', 'scripts/vdg-capture-observations.cjs',
    'scripts/vdg-capture-checkpoint.cjs',
    'scripts/vdg-inventory-contract.cjs',
    'scripts/vdg-atomic-json.cjs', 'scripts/build-vdg-inputs.cjs', 'scripts/prepare-vdg-rendered-inputs.cjs',
    'scripts/run-rendered-census.mjs', 'scripts/rendered-control-rows.mjs', 'scripts/refresh-vdg-inventory.mjs',
    'scripts/vdg-current-binding-ledger.cjs', 'scripts/refresh-vdg-owner-discovery.cjs',
    'vite.web.config.ts', 'build-tools/configs/vite.web.config.ts', 'scripts/ipfs-kit-kubo-tools.cjs', 'scripts/ipfs-kit-artifact-cat.cjs', 'scripts/ipfs-kit-governed-tools.cjs',
    'src/services/ipfs/mcp-ipfs-kit-tools-manifest.json', 'src/services/ipfs/mcp-ipfs-kit-descriptor-pack.ts',
    'src/services/ipfs/mcp-ipfs-kit-governed-tools-manifest.json',
    'src/services/ipfs/mcp-ipfs-datasets-descriptor-pack.ts', 'src/services/ipfs/mcp-ipfs-accelerate-descriptor-pack.ts',
    'scripts/start-ipfs-kit-mcp-compat.cjs', 'scripts/start-ipfs-datasets-mcp-compat.cjs', 'scripts/start-ipfs-accelerate-mcp-compat.cjs',
    'scripts/all-tools-evidence-lib.cjs', 'scripts/mcpplusplus-profile-e-http.cjs', 'scripts/ipfs_mcp_libp2p_bridge.py',
    'scripts/mcpplusplus-artifact-store.cjs', 'build-tools/configs/playwright.vdg.config.ts', 'build-tools/configs/playwright.live-click.config.ts',
    'test/e2e/helpers/live-click-session.ts', 'test/e2e/helpers/live-click-call-evidence.cjs', 'test/e2e/helpers/mcp-invocation-observer.ts', 'test/e2e/helpers/vdg-family-capture.ts',
    'src/services/apps/all-app-executable-backend-contract.ts', 'src/services/apps/virtual-desktop-app-manifest.ts',
    'src/services/mcp/all-tools-disposition-catalog.ts', 'src/services/mcp/all-app-tool-mediator.ts', 'src/services/mcp/all-app-tool-gateway.ts',
    'src/services/mcp/virtual-desktop-live-gateway.ts', 'web/src/live-tool-gateway-panel.ts', 'web/js/live-tool-gateway.js', 'web/js/main-simple.js',
    'web/js/apps/accelerate-datasets-capabilities.js', 'web/js/apps/system-network-local-capabilities.js',
    'web/js/apps/network-native-tools.js',
    'web/js/core/mcp-plus-plus-desktop-client.js',
    'web/js/core/mcp-descriptor-registry.js',
    '../external/ipfs_datasets/ipfs_datasets_py/core_operations/dataset_loader.py',
    '../external/ipfs_datasets/ipfs_datasets_py/mcp_server/tools/ipfs_tools/get_from_ipfs.py',
    '../external/ipfs_datasets/ipfs_datasets_py/search/search_tools_api.py',
    '../external/ipfs_datasets/ipfs_datasets_py/mcp_server/tools/search_tools/search_tools.py',
    '../external/ipfs_datasets/ipfs_datasets_py/vector_stores/management_engine.py',
    '../external/ipfs_datasets/ipfs_datasets_py/mcp_server/tools/dataset_tools/process_dataset.py',
    '../external/ipfs_datasets/ipfs_datasets_py/mcp_server/tools/dataset_tools/browse_datasets.py',
    '../external/ipfs_accelerate/ipfs_accelerate_py/api_backends/api_models_registry.py',
    '../external/ipfs_accelerate/ipfs_accelerate_py/hf_model_server/monitoring/health.py',
    '../external/ipfs_accelerate/ipfs_accelerate_py/hf_model_server/monitoring/metrics.py',
    '../external/ipfs_accelerate/ipfs_accelerate_py/hf_model_server/hardware/detector.py',
    '../external/ipfs_accelerate/ipfs_accelerate_py/llm_router.py',
    '../external/ipfs_accelerate/ipfs_accelerate_py/p2p_tasks/task_queue.py',
    '../external/ipfs_accelerate/ipfs_accelerate_py/datasets_integration/workflow.py',
    '../external/ipfs_accelerate/ipfs_accelerate_py/datasets_integration/provenance.py',
    '../external/ipfs_accelerate/ipfs_accelerate_py/mcp_server/tools/inference_tools/native_inference_tools.py',
    ...(options.definition?.spec ? [`test/e2e/families/${options.definition.spec}`] : []),
  ];
  const overrides = { 'mcp-plus-plus': 'mcp-plus-plus-explorer' };
  let appFiles;
  if (options.sourceOnly) {
    try { appFiles = fs.readdirSync(path.join(sourceRoot, 'web/js/apps'), { withFileTypes: true })
      .filter(entry => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith('.js')).map(entry => `web/js/apps/${entry.name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; appFiles = []; }
  } else appFiles = options.definition.apps.map(app => `web/js/apps/${overrides[app] || app}.js`);
  const files = [...shared, ...appFiles];
  const sources = [...new Set(files)].sort().map(relative => [relative, fileHash(path.join(sourceRoot, relative))]);
  if (!options.sourceOnly) for (const relative of ['control-tool-matrix.json', 'control-census.json', 'all-tools-disposition-catalog.json', 'all-app-live-binding-gap-ledger.json', 'capability-matrix.json']) sources.push([relative,
    ['control-tool-matrix.json', 'control-census.json', 'all-app-live-binding-gap-ledger.json'].includes(relative)
      ? inventoryHash(path.join(evidenceRoot, relative), family, options.definition) : fileHash(path.join(evidenceRoot, relative))]);
  // Actual input fixtures and routing are part of the execution contract;
  // changing a task/model/CID or selecting a different owner needs new proof.
  sources.push(['public-payload-fixtures', process.env.SWISSKNIFE_VDG_PAYLOAD_FIXTURES ? fileHash(process.env.SWISSKNIFE_VDG_PAYLOAD_FIXTURES) : 'unconfigured']);
  sources.push(['owner-routing', hash(JSON.stringify(Object.fromEntries([
    'SWISSKNIFE_IPFS_KIT_MCP_URL', 'SWISSKNIFE_IPFS_DATASETS_MCP_URL', 'SWISSKNIFE_IPFS_ACCELERATE_MCP_URL',
    'IPFS_DATASETS_PY_ROOT', 'IPFS_ACCELERATE_PY_ROOT',
    'MCPPLUSPLUS_PEER_ANNOUNCE_DIR',
  ].map(name => [name, process.env[name] || 'default']))))]);
  return hash(JSON.stringify({ family, transport, sources }));
}
function inventorySourceFingerprint(options = {}) {
  return captureInputFingerprint('vdg-inventory', 'source-only', { ...options, sourceOnly: true, definition: { apps: [] } });
}
module.exports = { captureInputFingerprint, inventorySourceFingerprint };
