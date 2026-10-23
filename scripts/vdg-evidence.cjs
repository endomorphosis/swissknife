'use strict';

/** VDG acceptance is derived from originating clicks and connector receipts.
 * Existing VOG reports are inputs, never authority for a VDG GO decision.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadConnectorArtifacts } = require('./vdg-connector-artifacts.cjs');
const { controlKey } = require('./vdg-capture-observations.cjs');
const { writeAtomicJson } = require('./vdg-atomic-json.cjs');

const FAMILIES = Object.freeze({
  'vdg-storage': { target: 'storage', spec: 'storage-media-mcp-invoke.spec.ts', task: 'VDG-031', apps: ['file-manager', 'ipfs-explorer', 'image-viewer', 'media-player', 'cinema', 'peertube'] },
  'vdg-datasets': { target: 'datasets', spec: 'datasets-mcp-invoke.spec.ts', task: 'VDG-032', apps: ['notes', 'datasets-browser', 'model-browser', 'vibecode', 'ai-chat'] },
  'vdg-accelerate': { target: 'accelerate', spec: 'accelerate-mcp-invoke.spec.ts', task: 'VDG-033', apps: ['device-manager', 'huggingface', 'training-manager', 'accelerate-panel', 'neural-network-designer', 'neural-photoshop'] },
  'vdg-network': { target: 'network', spec: 'network-mcp-invoke.spec.ts', task: 'VDG-034', apps: ['p2p-network', 'p2p-chat', 'p2p-chat-unified', 'friends-list', 'navi'] },
  'vdg-control': { target: 'control', spec: 'control-plane-mcp-invoke.spec.ts', task: 'VDG-035', apps: ['mcp-control', 'mcp-plus-plus', 'idl-explorer', 'agent-supervisor', 'system-monitor', 'github', 'api-keys', 'orb-auto-ui'] },
  'vdg-local': { target: 'local', spec: 'local-negative-mcp.spec.ts', task: 'VDG-036', apps: ['calculator', 'clock', 'terminal', 'glasses-preview', 'settings', 'todo', 'calendar', 'cron', 'task-manager', 'music-studio', 'music-studio-unified', 'strudel', 'strudel-ai-daw', 'oauth-login', 'openrouter'] },
});
const DISPOSITIONS = new Set(['invoke', 'confirm-then-invoke', 'deny', 'local-only', 'external-provider', 'unsupported']);
const INVOKE = new Set(['invoke', 'confirm-then-invoke', 'deny']);
const ZERO = new Set(['local-only', 'external-provider', 'unsupported']);
const ROUTE = '/mcp/tools/call';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const EVIDENCE_ROOT = path.join(PROJECT_ROOT, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const text = value => typeof value === 'string' && value.trim().length > 0;
const array = value => Array.isArray(value) ? value : [];
const key = controlKey;
const toolName = value => String(value || '').replace(/^mcp\+\+[:/]/, '').split(/[:/]/).at(-1);
const sourceHash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function completeObservation(observation) {
  return observation && observation.route === ROUTE
    && ['tool_id', 'transport', 'correlation_id', 'policy_outcome', 'receipt_id', 'event_dag_cid'].every(name => text(observation[name]))
    && ['http', 'libp2p'].includes(observation.transport)
    && ['allow', 'deny', 'require_confirmation'].includes(observation.policy_outcome)
    && ['gateway-button', 'native-control'].includes(observation.origin)
    && typeof observation.dry_run === 'boolean';
}

function connectorMatches(row, observation, connector) {
  return connector && connector.method === 'POST' && connector.route === ROUTE
    && connector.app_id === row.app_id
    && (connector.artifact_verified === true || (connector.status >= 200 && connector.status < 300 && connector.owner_result_verified === true))
    && text(connector.owner)
    && ['tool_id', 'transport', 'correlation_id', 'policy_outcome', 'receipt_id', 'event_dag_cid', 'outcome', 'dry_run'].every(name => connector[name] === observation[name]);
}

function validateFamily({ family, matrix, reports = [], connectors = [], catalog, capabilityMatrix, contract, ledger, inputProblems = [], connectorProblems = [] }) {
  const definition = FAMILIES[family];
  if (!definition) throw new Error(`unknown VDG family ${family}`);
  const gaps = [];
  const add = (code, row = {}, extra = {}) => gaps.push({ code, app_id: row.app_id || '', launch_id: row.launch_id || '', selector: row.selector || '', ...extra });
  for (const problem of inputProblems) add('input_unavailable', {}, problem);
  for (const problem of connectorProblems) add('connector_evidence_rejected', problem, { reason: problem.reason, correlation_id: problem.correlation_id });
  if (!matrix || matrix.schema !== 'swissknife.virtual-desktop-control-tool-matrix.v1') add('control_matrix_missing_or_invalid');
  const expected = array(matrix?.rows).filter(row => row.family === family);
  if (!expected.length) add('family_controls_missing');
  const expectedKeys = new Set();
  for (const row of expected) {
    if (expectedKeys.has(key(row))) add('duplicate_control_declaration', row);
    expectedKeys.add(key(row));
    if (!DISPOSITIONS.has(row.disposition)) add('invalid_disposition', row, { disposition: row.disposition });
    if (!definition.apps.includes(row.app_id)) add('control_in_wrong_family', row);
  }
  const entries = array(catalog?.entries);
  const catalogReady = catalog?.schema === 'swissknife.all-tools-disposition-catalog.v1' && entries.length > 0;
  if (!catalogReady) add('visibility_catalog_missing_or_invalid');
  if (!contract || !array(contract.apps).length) add('executable_contract_missing_or_invalid');
  if (!ledger || ledger.schema !== 'swissknife.all-app-live-binding-gap-ledger.v1') add('binding_ledger_missing_or_invalid');
  // Only the current rendered exact-binding adapter describes this capture's
  // obligations. Historical inventories retain their own independent gaps.
  if (ledger?.provenance?.adapter === 'vdg-current-exact-binding-ledger@1') {
    for (const gap of array(ledger.gaps)) {
      if (definition.apps.includes(gap.app_id)) {
        add('current_binding_ledger_gap', gap, { reason: gap.code, owner: gap.owner || '', tool_id: gap.tool_id || '' });
      }
    }
  }
  for (const gap of array(matrix?.uncovered_app_visible_tools)) {
    add('uncovered_app_visible_tool', {}, { tool_id: gap.tool_id || '', owner: gap.owner || '' });
  }

  // Catalog identities include the owner. Equal tool names across owners are
  // deliberately not merged or treated as substitute execution evidence.
  const forbidden = new Set(entries.filter(entry => entry.disposition?.kind === 'server_only').map(entry => `${entry.owner}:${entry.tool_id}`));
  const visitVisibility = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visitVisibility); return; }
    const visibility = value.visibility || value.disposition;
    if (['supervisor_only', 'desktop_mobile_only', 'supervisor_only_internal', 'desktop_mobile_only_internal'].includes(visibility) && text(value.tool_id)) {
      forbidden.add(value.owner ? `${value.owner}:${toolName(value.tool_id)}` : value.tool_id);
    }
    for (const [name, values] of Object.entries(value)) {
      if (['supervisor_only_tool_ids', 'desktop_mobile_only_tool_ids'].includes(name)) array(values).forEach(id => forbidden.add(id));
      else visitVisibility(values);
    }
  };
  visitVisibility(capabilityMatrix);

  const rows = [];
  const seenReports = new Set();
  for (const report of reports) {
    if (report?.schema !== 'swissknife.virtual-desktop-live-click.v1' || report.target !== definition.target) { add('family_live_report_invalid'); continue; }
    const fingerprint = sourceHash(report);
    if (seenReports.has(fingerprint)) continue;
    seenReports.add(fingerprint);
    if (report.owner_health !== 'up') add('backend_owner_unavailable');
    // A prior report's GO flag is deliberately ignored: each row is rechecked.
    rows.push(...array(report.rows));
  }
  if (!rows.length) add('originating_clicks_missing');
  const matches = new Map();
  const accepted = [];
  let observedCalls = 0;
  for (const row of rows) {
    const errorsBefore = gaps.length;
    if (!definition.apps.includes(row.app_id)) { add('click_in_wrong_family', row); continue; }
    if (row.clicked !== true || row.visibility !== 'visible') add('originating_click_missing', row);
    if (array(row.failure_reasons).length) add('live_click_failed', row, { failure_reasons: row.failure_reasons });
    if (array(row.pageerrors).length) add('app_runtime_error', row);
    // Disabled or deliberately withheld controls are useful negatives, but are
    // not evidence that an interactive native control was actually activated.
    if (row.result_surface === 'local family withholds tool call') add('control_withheld_without_click', row);
    const matchingKey = row.resolved_from ? key({ ...row, selector: row.resolved_from }) : key(row);
    const declaration = expected.find(item => key(item) === matchingKey);
    const disposition = declaration?.disposition || row.disposition;
    if (!DISPOSITIONS.has(disposition)) add('control_disposition_unresolved', row, { disposition });
    if (declaration && row.disposition !== disposition) add('control_disposition_mismatch', row, { declared: disposition, observed: row.disposition });
    const existing = matches.get(matchingKey) || [];
    existing.push(row);
    matches.set(matchingKey, existing);
    if (!Number.isInteger(row.mcp_call_count) || row.mcp_call_count < 0) add('mcp_call_count_invalid', row);
    const observations = array(row.observations).length ? row.observations : row.observation ? [row.observation] : [];
    observedCalls += observations.length;
    if (ZERO.has(disposition)) {
      if (row.mcp_call_count !== 0 || observations.length !== 0) add('negative_control_invoked_mcp', row);
      if (disposition === 'external-provider' && row.external_provider_outcome !== 'external-provider') add('external_provider_outcome_missing', row);
    }
    if (INVOKE.has(disposition) || observations.length > 0) {
      if (row.mcp_call_count < 1 || !observations.length) add('originating_invocation_missing', row);
      if (row.mcp_call_count !== observations.length) add('unaccounted_connector_calls', row);
      const declaredBinding = declaration?.data_native_gateway_binding || declaration?.data_live_gateway_binding || '';
      const projectedBinding = declaredBinding && declaration.tool_id === `mcp++:${declaredBinding}` ? declaredBinding : '';
      const exactPrimary = declaration?.tool_id && !projectedBinding ? toolName(declaration.tool_id) : '';
      if (exactPrimary && !observations.some(observation => observation.tool_id === exactPrimary)) add('exact_tool_name_mismatch', row, { expected_tool_id: declaration.tool_id });
      if (declaredBinding && !observations.some(observation => connectors.some(connector => connectorMatches(row, observation, connector) && connector.binding_id === declaredBinding))) add('executable_binding_mismatch', row, { binding_id: declaredBinding });
      for (const observation of observations) {
        if (!completeObservation(observation)) { add('invocation_fields_missing', row); continue; }
        if (!row.selector.includes('data-live-gateway-binding') && observation.origin !== 'native-control') add('native_control_origin_missing', row);
        const matching = [...new Map(connectors.filter(connector => connectorMatches(row, observation, connector)).map(connector => [JSON.stringify([connector.app_id, connector.owner, connector.tool_id, connector.transport, connector.correlation_id, connector.receipt_id, connector.event_dag_cid]), connector])).values()];
        if (matching.length !== 1) { add('connector_receipt_not_matched', row, { correlation_id: observation.correlation_id, match_count: matching.length }); continue; }
        const connector = matching[0];
        const binding = array(contract?.apps).find(app => app.app_id === row.app_id)?.backend_bindings?.find(item => item.binding_id === connector.binding_id);
        const companion = Boolean((exactPrimary && observation.tool_id !== exactPrimary) || (declaredBinding && connector.binding_id !== declaredBinding));
        if (declaredBinding || companion) {
          if (!binding || binding.owner !== connector.owner) add(companion ? 'companion_binding_not_proven' : 'executable_binding_mismatch', row, { binding_id: connector.binding_id, owner: connector.owner });
          else if (!array(binding.tool_selection?.preferred_tool_ids).includes(observation.tool_id)) add('exact_tool_selection_not_proven', row, { binding_id: connector.binding_id, tool_id: observation.tool_id });
        }
        if (binding && !array(binding.transport_policy?.allowed_transports).includes(observation.transport)) add('undeclared_transport_invoked', row, { transport: observation.transport, binding_id: connector.binding_id });
        const identity = `${connector.owner}:${observation.tool_id}`;
        if (forbidden.has(identity) || forbidden.has(observation.tool_id)) add('forbidden_tool_invocation', row, { owner: connector.owner, tool_id: observation.tool_id });
        if (disposition === 'deny') {
          if (observation.outcome !== 'denied' || observation.policy_outcome !== 'deny') add('denial_not_observed', row);
        } else {
          if (observation.outcome !== 'executed') add('owner_did_not_execute', row, { outcome: observation.outcome });
          const reviewedSafeRead = row.app_id === 'mcp-control' && binding?.mediated_intent?.mutates_remote_state === false
            && ['read', 'safe_read', 'read_only'].includes(binding?.mediated_intent?.policy_class);
          if (observation.dry_run !== true && !reviewedSafeRead) add('mutating_invocation_not_dry_run', row);
        }
        if (disposition === 'confirm-then-invoke' || observation.policy_outcome === 'require_confirmation') {
          const confirmation = array(row.confirmations).find(proof => proof.correlation_id === observation.correlation_id) || row.confirmation;
          if (confirmation?.calls_before_confirmation !== 0 || confirmation?.confirmed !== true || confirmation?.control_clicked !== true) add('confirmation_order_not_proven', row);
        }
        accepted.push({ ...observation, owner: connector.owner, app_id: row.app_id, binding_id: connector.binding_id || '', valid: gaps.length === errorsBefore });
      }
    }
    // An extra dynamically discovered tool row must be classified by the
    // census/join task. The label "unlisted" cannot silently become invoke.
    if (!declaration && row.disposition === 'unlisted') add('dynamic_tool_requires_disposition', row);
  }
  for (const declaration of expected) {
    if (!matches.has(key(declaration))) add('control_not_observed', declaration);
  }
  const allFamilyApps = new Set(Object.values(FAMILIES).flatMap(item => item.apps));
  for (const app of array(contract?.apps)) {
    if (!allFamilyApps.has(app.app_id)) add('app_family_unassigned', { app_id: app.app_id });
  }
  const apps = array(contract?.apps).filter(app => definition.apps.includes(app.app_id));
  for (const appId of definition.apps) {
    if (!expected.some(row => row.app_id === appId)) add('app_missing_from_control_matrix', { app_id: appId });
    if (!rows.some(row => row.app_id === appId && row.clicked === true && row.visibility === 'visible')) add('app_not_launched', { app_id: appId });
  }
  for (const app of apps) {
    for (const alias of array(app.aliases)) {
      if (!rows.some(row => row.app_id === app.app_id && row.launch_id === alias && row.clicked === true)) add('app_alias_not_launched', { app_id: app.app_id, launch_id: alias });
    }
  }

  const requirements = [];
  for (const entry of entries) {
    if (entry.disposition?.kind !== 'app_operation' || !definition.apps.includes(entry.disposition.app_id)) continue;
    const appId = entry.disposition.app_id;
    const binding = apps.find(app => app.app_id === appId)?.backend_bindings?.find(item => item.binding_id === entry.disposition.binding_id);
    const transports = array(binding?.transport_policy?.allowed_transports).length
      ? binding.transport_policy.allowed_transports
      : array(entry.reachability?.approved_transports);
    if (!transports.length) add('app_visible_tool_transport_undeclared', { app_id: appId }, { owner: entry.owner, tool_id: entry.tool_id });
    if (family === 'vdg-local') add('local_family_tool_declaration_conflict', { app_id: appId }, { owner: entry.owner, tool_id: entry.tool_id });
    for (const transport of transports) requirements.push({ app_id: appId, owner: entry.owner, tool_id: entry.tool_id, transport });
  }
  for (const tool of array(ledger?.tools)) {
    const bindings = array(tool.binding?.rows).filter(binding => binding.app_visible === true || binding.visibility === 'app_visible');
    if (Number(tool.binding?.app_visible_row_count) > 0 && !bindings.length) add('app_visible_tool_bindings_missing', {}, { owner: tool.owner, tool_id: tool.name || toolName(tool.tool_id) });
    for (const binding of bindings) {
      if (!definition.apps.includes(binding.app_id)) continue;
      const app = apps.find(item => item.app_id === binding.app_id);
      const declaredBinding = app?.backend_bindings?.find(item => item.binding_id === binding.binding_id);
      const transports = array(declaredBinding?.transport_policy?.allowed_transports).length
        ? declaredBinding.transport_policy.allowed_transports
        : array(binding.transports);
      if (!transports.length) add('app_visible_tool_transport_undeclared', binding, { owner: tool.owner, tool_id: tool.name || toolName(tool.tool_id) });
      for (const transport of transports) requirements.push({ app_id: binding.app_id, owner: tool.owner, tool_id: tool.name || toolName(tool.tool_id), transport });
    }
  }
  const uniqueRequirements = [...new Map(requirements.map(row => [JSON.stringify(row), row])).values()];
  for (const requirement of uniqueRequirements) {
    if (!accepted.some(observation => observation.valid && observation.outcome === 'executed' && ['app_id', 'owner', 'tool_id', 'transport'].every(name => observation[name] === requirement[name]))) add('app_visible_tool_transport_uncovered', requirement, requirement);
  }
  // Server-only catalog entries are global negatives; one reviewed control
  // family probe per exact identity proves policy holds before owner dispatch.
  if (family === 'vdg-control') {
    const negatives = reports.flatMap(report => array(report.governed_negatives));
    for (const identity of forbidden) {
      if (!negatives.some(row => row.tool_identity === identity && row.clicked === true && row.mcp_call_count === 0 && row.outcome === 'denied')) add('withheld_tool_negative_missing', {}, { tool_id: identity });
    }
  }
  const unique = [...new Map(gaps.map(gap => [JSON.stringify(gap), gap])).values()];
  return {
    schema: 'swissknife.virtual-desktop-gui-mcp-family.v1',
    generated_at: new Date().toISOString(),
    family,
    task_id: definition.task,
    target: definition.target,
    decision: unique.length ? 'no_go' : 'GO',
    passed: unique.length === 0,
    clicked: rows.length > 0 && rows.every(row => row.clicked === true && row.visibility === 'visible'),
    control_count: expected.length,
    observed_control_count: matches.size,
    observed_invocation_count: observedCalls,
    executed_tool_count: accepted.filter(row => row.valid && row.outcome === 'executed').length,
    required_tool_transport_count: uniqueRequirements.length,
    verified_connector_count: accepted.length,
    gap_count: unique.length,
    gap_counts: unique.reduce((counts, gap) => { counts[gap.code] = (counts[gap.code] || 0) + 1; return counts; }, {}),
    gaps: unique,
    reasons: [...new Set(unique.map(gap => gap.code))],
    repair_tasks: [...new Set(unique.map(gap => gap.code.includes('control_matrix') || ['control_not_observed', 'app_missing_from_control_matrix', 'app_alias_not_launched'].includes(gap.code) ? 'VDG-011'
      : ['invalid_disposition', 'control_disposition_mismatch', 'dynamic_tool_requires_disposition', 'control_disposition_unresolved', 'uncovered_app_visible_tool', 'local_family_tool_declaration_conflict'].includes(gap.code) ? 'VDG-012'
        : ['connector_receipt_not_matched', 'confirmation_order_not_proven', 'visibility_catalog_missing_or_invalid'].includes(gap.code) ? 'VDG-013' : definition.task))],
    work_complete: false,
    completion_authority: false,
  };
}

function loadFamilyEvidence(family, options = {}) {
  const definition = FAMILIES[family];
  if (!definition) throw new Error(`usage: ${Object.keys(FAMILIES).join('|')}`);
  const evidenceRoot = path.resolve(options.evidenceRoot || process.env.VDG_EVIDENCE_ROOT || EVIDENCE_ROOT);
  const problems = [];
  const provenance = [];
  const read = (relative, optional = false, expectedSha256 = null) => {
    const filename = path.join(evidenceRoot, relative);
    try {
      const bytes = fs.readFileSync(filename);
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      if (expectedSha256 && sha256 !== expectedSha256) {
        problems.push({ path: relative, reason: 'capture_report_hash_mismatch' });
        return null;
      }
      const value = JSON.parse(bytes.toString('utf8'));
      provenance.push({ path: relative, sha256 });
      return value;
    } catch (error) {
      if (!optional) problems.push({ path: relative, reason: error.code === 'ENOENT' ? 'missing' : 'unreadable' });
      return null;
    }
  };
  const matrix = read('control-tool-matrix.json');
  const catalog = read('all-tools-disposition-catalog.json');
  const ledger = read('all-app-live-binding-gap-ledger.json');
  const capabilityMatrix = read('capability-matrix.json', true);
  let contract;
  try {
    const { require: tsxRequire } = require('tsx/cjs/api');
    const filename = path.join(PROJECT_ROOT, 'src/services/apps/all-app-executable-backend-contract.ts');
    contract = tsxRequire(filename, __filename).ALL_APP_EXECUTABLE_BACKEND_CONTRACT;
    provenance.push({ path: 'src/services/apps/all-app-executable-backend-contract.ts', sha256: sourceHash(contract) });
  } catch (error) { problems.push({ path: 'src/services/apps/all-app-executable-backend-contract.ts', reason: String(error.message).slice(0, 200) }); }
  const connectorReport = read(`vdg/connectors/${definition.target}.json`, true);
  const manifestValid = connectorReport?.schema === 'swissknife.virtual-desktop-gui-mcp-connectors.v1' && connectorReport.target === definition.target;
  if (connectorReport && !manifestValid) problems.push({ path: `vdg/connectors/${definition.target}.json`, reason: 'connector_manifest_invalid' });
  const latestRuns = new Map((manifestValid ? array(connectorReport.runs) : []).map(run => [run.transport, run]));
  const additional = [];
  // Resolve lazily: the acquisition checker imports this module's family table.
  const { checkCapture } = require('./check-vdg-capture.cjs');
  for (const run of latestRuns.values()) {
    if (!['http', 'libp2p'].includes(run.transport)) {
      problems.push({ path: `vdg/connectors/${definition.target}.json`, reason: 'capture_transport_invalid' });
      continue;
    }
    try {
      // Validate the manifest's exact safe run path, source binding, raw report
      // hash, completion metadata and control census before reading any report.
      const acquisition = checkCapture(family, run.transport, { evidenceRoot, sourceRoot: options.sourceRoot });
      const report = read(acquisition.report_path, false, acquisition.report_sha256);
      if (report) additional.push(report);
    } catch (error) {
      problems.push({ path: `vdg/connectors/${definition.target}.json`,
        reason: /source binding is stale or missing/.test(error.message)
          ? 'capture_inputs_changed_or_unbound' : 'capture_acquisition_rejected',
        detail: String(error.message).slice(0, 200) });
    }
  }
  // Once a VDG capture exists it supersedes legacy VOG input. Earlier runs
  // remain on disk for audit; retry success can replace a failed capture.
  const legacy = additional.length ? null : read(`live-clicks/${definition.target}.json`);
  const reports = additional.length ? additional : legacy ? [legacy] : [];
  if (legacy) problems.push({ path: `live-clicks/${definition.target}.json`, reason: 'legacy_capture_source_binding_missing' });
  const artifactProof = loadConnectorArtifacts(reports.flatMap(report => array(report.rows)), { artifactRoot: options.artifactRoot });
  const networkProof = manifestValid ? array(connectorReport.observations) : [];
  const unresolvedProof = artifactProof.problems.filter(problem => !networkProof.some(observation => observation.correlation_id === problem.correlation_id && observation.owner_result_verified === true));
  const result = validateFamily({ family, matrix, catalog, ledger, capabilityMatrix, contract, reports, connectors: [...networkProof, ...artifactProof.observations], connectorProblems: unresolvedProof, inputProblems: problems });
  result.verified_artifact_observation_count = artifactProof.observations.length;
  result.evidence_sources = provenance;
  result.input_fingerprint = sourceHash(provenance);
  return result;
}

function writeFamilyEvidence(family, options = {}) {
  const evidence = loadFamilyEvidence(family, options);
  const evidenceRoot = path.resolve(options.evidenceRoot || process.env.VDG_EVIDENCE_ROOT || EVIDENCE_ROOT);
  const output = path.join(evidenceRoot, 'vdg', 'families', `${FAMILIES[family].target}.json`);
  writeAtomicJson(output, evidence);
  return evidence;
}

module.exports = { FAMILIES, EVIDENCE_ROOT, validateFamily, completeObservation, connectorMatches, loadFamilyEvidence, writeFamilyEvidence };
