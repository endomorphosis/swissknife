#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outPath = path.join(evidenceRoot, 'capability-matrix.json');
const markdownPath = path.join(evidenceRoot, 'capability-matrix.md');
const appBackendContractPath = path.join(evidenceRoot, 'app-backend-contract.json');
const docsPath = path.join(projectRoot, 'docs', 'virtual-desktop-all-tools-app-coverage.md');
const inputProblems = [];

const artifacts = {
  appInventory: readJson('all-tools-app-inventory.json'),
  bindings: readJson('all-tools-app-bindings.json'),
  policy: readJson('all-tools-policy-matrix.json'),
  execution: readJson('all-tools-execution-report.json'),
  idl: readJson('all-tools-idl-coverage.json'),
  glasses: readJson('all-tools-glasses-coverage.json'),
  appFamilyCoverage: readJson('all-tools-app-family-coverage.json'),
};

const policyRules = artifacts.policy.rules ?? artifacts.policy.tools ?? [];
const bindingRows = artifacts.bindings.rows ?? artifacts.bindings.bindings ?? [];
const policyByToolId = new Map(policyRules.map(rule => [rule.tool_id, rule]));
const fixtureByToolId = new Map((artifacts.execution.fixtures ?? []).map(fixture => [fixture.tool_id, fixture]));
const descriptorsByApp = groupBy(artifacts.idl.descriptors ?? [], descriptor => descriptor.app_id ?? descriptor.generated_ui_profile?.app_id);
const projectionsByApp = groupBy(artifacts.glasses.projections ?? [], projection => projection.app_id);
const familiesByApp = new Map((artifacts.appFamilyCoverage.app_families ?? []).map(family => [family.app_id, family]));
const bindingStateByApp = new Map((artifacts.bindings.app_binding_states ?? []).map(state => [state.app_id, state]));
const bindingsByApp = groupBy(bindingRows, row => row.app_id ?? 'unassigned');

const rows = artifacts.appInventory.apps.map(app => {
  const appBindings = bindingsByApp.get(app.id) ?? [];
  const visibleBindings = appBindings.filter(row => row.app_visible);
  const desktopMobileOnlyBindings = appBindings.filter(row => row.visibility === 'desktop_mobile_only' || row.normalized_disposition === 'unsafe_without_human_review');
  const supervisorOnlyBindings = appBindings.filter(row => row.visibility === 'supervisor_only' || row.normalized_disposition === 'server_internal');
  const descriptors = descriptorsByApp.get(app.id) ?? [];
  const projections = projectionsByApp.get(app.id) ?? [];
  const family = familiesByApp.get(app.id);
  const bindingState = bindingStateByApp.get(app.id) ?? {
    binding_state: app.binding_state ?? (appBindings.length > 0 ? 'tool_backed' : 'manifest_only'),
    rationale: app.binding_rationale ?? 'Derived from app inventory.',
    coverage_status: appBindings.length > 0 ? 'covered' : 'manifest_only',
  };
  const policyRows = visibleBindings
    .map(row => policyByToolId.get(row.tool_id))
    .filter(Boolean);
  const fixtureRows = visibleBindings
    .map(row => fixtureByToolId.get(row.tool_id))
    .filter(Boolean);
  const adapterRequiredTools = visibleBindings.filter(row => isAdapterRequired(row.tool_id));

  return {
    app_id: app.id,
    title: app.title,
    category: app.category,
    owner_module: app.owner_module,
    launch_kind: app.launch_kind,
    component: app.component,
    binding_state: bindingState.binding_state,
    binding_rationale: bindingState.rationale,
    binding_coverage_status: bindingState.coverage_status,
    manifest_service_families: app.service_families ?? [],
    manifest_capabilities: app.capabilities ?? [],
    all_tools: {
      bound_tool_count: appBindings.length,
      app_visible_tool_count: visibleBindings.length,
      existing_capability_count: countWhere(visibleBindings, row => row.capability_source === 'registry'),
      generated_capability_count: countWhere(visibleBindings, row => row.capability_source === 'generated'),
      desktop_mobile_only_count: desktopMobileOnlyBindings.length,
      supervisor_only_count: supervisorOnlyBindings.length,
      adapter_required_tool_count: adapterRequiredTools.length,
      adapter_required_tool_ids: adapterRequiredTools.map(row => row.tool_id),
      service_counts: countBy(visibleBindings, row => row.service_id),
      app_visible_service_counts: countBy(visibleBindings, row => row.service_id),
      desktop_mobile_only_service_counts: countBy(desktopMobileOnlyBindings, row => row.service_id),
      supervisor_only_service_counts: countBy(supervisorOnlyBindings, row => row.service_id),
      policy_class_counts: countBy(policyRows, row => row.policy_class),
      receipt_required_count: countWhere(policyRows, row => row.receipt_policy !== 'none'),
      confirmation_required_count: countWhere(policyRows, row => row.confirmation_policy !== 'none'),
      execution_fixture_count: fixtureRows.length,
      execution_receipt_fixture_count: countWhere(fixtureRows, row => row.receipt_refs?.length > 0 || row.receipt_required),
      app_visible_tool_ids: visibleBindings.map(row => row.tool_id),
      desktop_mobile_only_tool_ids: desktopMobileOnlyBindings.map(row => row.tool_id),
      supervisor_only_tool_ids: supervisorOnlyBindings.map(row => row.tool_id),
    },
    orb_idl: {
      descriptor_count: descriptors.length,
      method_count: sum(descriptors, descriptor => descriptor.method_count ?? 0),
      interface_cids: descriptors.map(descriptor => descriptor.interface_cid),
      descriptor_ids: descriptors.map(descriptor => descriptor.descriptor_id),
    },
    glasses: {
      projection_count: projections.length,
      displayable_projection_count: countWhere(projections, projection => projection.displayable),
      hardware_free_replay_state_count: sum(projections, projection => projection.replay?.length ?? projection.replay_states?.length ?? 0),
      adapter_required_projection_count: countWhere(projections, projection => projection.adapter_required),
      behavior_counts: countBy(projections, projection => projection.behavior),
      handoff_kind: app.glasses_strategy?.handoff ?? null,
      fallback: app.glasses_strategy?.fallback ?? [],
    },
    app_family_coverage: family
      ? {
          state_coverage: family.state_coverage ?? [],
          fallback_covered: (family.state_coverage ?? []).includes('fallback'),
          blocked_covered: (family.state_coverage ?? []).includes('blocked'),
          degraded_covered: (family.state_coverage ?? []).includes('degraded'),
          adapter_required_accelerate_count: family.adapter_required_tool_ids?.length ?? 0,
        }
      : {
          state_coverage: [],
          fallback_covered: false,
          blocked_covered: false,
          degraded_covered: false,
          adapter_required_accelerate_count: 0,
        },
  };
});

const appVisibleRows = rows.filter(row => row.all_tools.app_visible_tool_count > 0);
const boundRows = rows.filter(row => row.all_tools.bound_tool_count > 0);
const matrix = {
  schema: 'swissknife.virtual-desktop-all-tools-capability-matrix.v1',
  generated_at: new Date().toISOString(),
  status: inputProblems.length === 0 ? 'complete' : 'incomplete',
  decision: inputProblems.length === 0 ? 'go' : 'no_go',
  input_evidence: {
    required_count: 7,
    available_count: 7 - inputProblems.length,
    problems: inputProblems,
  },
  generated_from: [
    'all-tools-app-inventory.json',
    'all-tools-app-bindings.json',
    'all-tools-policy-matrix.json',
    'all-tools-execution-report.json',
    'all-tools-idl-coverage.json',
    'all-tools-glasses-coverage.json',
    'all-tools-app-family-coverage.json',
  ],
  matrix_id: 'org.hallucinate.swissknife.virtual-desktop-all-tools-capability-matrix',
  version: '2026-07-08',
  app_count: rows.length,
  app_with_bound_tool_count: boundRows.length,
  app_with_app_visible_tool_count: appVisibleRows.length,
  all_tools_bound_tool_count: sum(rows, row => row.all_tools.bound_tool_count),
  app_visible_tool_count: sum(rows, row => row.all_tools.app_visible_tool_count),
  desktop_mobile_only_tool_count: sum(rows, row => row.all_tools.desktop_mobile_only_count),
  supervisor_only_tool_count: sum(rows, row => row.all_tools.supervisor_only_count),
  adapter_required_tool_count: sum(rows, row => row.all_tools.adapter_required_tool_count),
  descriptor_count: sum(rows, row => row.orb_idl.descriptor_count),
  projection_count: sum(rows, row => row.glasses.projection_count),
  hardware_free_replay_state_count: sum(rows, row => row.glasses.hardware_free_replay_state_count),
  service_counts: mergeCounts(rows.map(row => row.all_tools.service_counts)),
  app_binding_state_counts: countBy(rows, row => row.binding_state),
  app_status_counts: {
    manifest_only_count: rows.filter(row => row.binding_state === 'manifest_only').length,
    not_applicable_count: rows.filter(row => row.binding_state === 'not_applicable').length,
    tool_backed_count: rows.filter(row => row.binding_state === 'tool_backed').length,
    missing_concrete_binding_count: rows.filter(row => row.binding_state === 'tool_backed' && row.all_tools.bound_tool_count === 0).length,
    all_tools_bound_count: appVisibleRows.length,
    all_tools_any_binding_count: boundRows.length,
    idl_enabled_count: rows.filter(row => row.orb_idl.descriptor_count > 0).length,
    glasses_projected_count: rows.filter(row => row.glasses.projection_count > 0).length,
  },
  rows,
};

matrix.matrix_cid = `sha256:${crypto
  .createHash('sha256')
  .update(JSON.stringify({ ...matrix, generated_at: undefined, matrix_cid: undefined }))
  .digest('hex')}`;

fs.mkdirSync(evidenceRoot, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(matrix, null, 2)}\n`);
const markdown = renderMarkdown(matrix);
fs.writeFileSync(markdownPath, markdown);
// The capability matrix is diagnostic when historical generated inputs have
// not been restored.  Do not replace a valid, tracked backend contract with
// an empty projection in that case; the release aggregator will fail closed
// and name the missing evidence instead.
let appBackendContract = null;
if (matrix.status === 'complete') {
  appBackendContract = buildAppBackendContract(matrix);
  fs.writeFileSync(appBackendContractPath, `${JSON.stringify(appBackendContract, null, 2)}\n`);
  fs.mkdirSync(path.dirname(docsPath), { recursive: true });
  fs.writeFileSync(docsPath, renderCoverageDoc(matrix, appBackendContract));
}

console.log(JSON.stringify({
  schema: matrix.schema,
  app_count: matrix.app_count,
  app_with_bound_tool_count: matrix.app_with_bound_tool_count,
  app_visible_tool_count: matrix.app_visible_tool_count,
  adapter_required_tool_count: matrix.adapter_required_tool_count,
  descriptor_count: matrix.descriptor_count,
  projection_count: matrix.projection_count,
  decision: matrix.decision,
  input_problem_count: inputProblems.length,
  desktop_mobile_only_tool_count: matrix.desktop_mobile_only_tool_count,
  supervisor_only_tool_count: matrix.supervisor_only_tool_count,
  output: path.relative(projectRoot, outPath),
  app_backend_contract: path.relative(projectRoot, appBackendContractPath),
  app_backend_contract_updated: matrix.status === 'complete',
  docs: path.relative(projectRoot, docsPath),
  docs_updated: matrix.status === 'complete',
}, null, 2));

function readJson(fileName) {
  const filePath = path.join(evidenceRoot, fileName);
  if (!fs.existsSync(filePath)) {
    inputProblems.push({
      file: fileName,
      code: 'missing',
      reason: `Required capability-matrix input is missing: ${path.relative(projectRoot, filePath)}.`,
    });
    return emptyArtifact(fileName);
  }
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!hasRequiredShape(fileName, value)) {
      inputProblems.push({
        file: fileName,
        code: 'invalid_shape',
        reason: `Required capability-matrix input has no usable row collection: ${path.relative(projectRoot, filePath)}.`,
      });
      return emptyArtifact(fileName);
    }
    return value;
  } catch (error) {
    inputProblems.push({
      file: fileName,
      code: 'invalid_json',
      reason: `Required capability-matrix input is invalid JSON: ${error instanceof Error ? error.message : String(error)}.`,
    });
    return emptyArtifact(fileName);
  }
}

function hasRequiredShape(fileName, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (fileName === 'all-tools-app-inventory.json') return Array.isArray(value.apps);
  if (fileName === 'all-tools-app-bindings.json') return Array.isArray(value.rows) || Array.isArray(value.bindings);
  if (fileName === 'all-tools-policy-matrix.json') return Array.isArray(value.rules) || Array.isArray(value.tools);
  if (fileName === 'all-tools-execution-report.json') return Array.isArray(value.fixtures);
  if (fileName === 'all-tools-idl-coverage.json') return Array.isArray(value.descriptors);
  if (fileName === 'all-tools-glasses-coverage.json') return Array.isArray(value.projections);
  if (fileName === 'all-tools-app-family-coverage.json') return Array.isArray(value.app_families);
  return true;
}

function emptyArtifact(fileName) {
  if (fileName === 'all-tools-app-inventory.json') return { apps: [], aliases: {} };
  if (fileName === 'all-tools-app-bindings.json') return { rows: [], bindings: [], app_binding_states: [] };
  if (fileName === 'all-tools-policy-matrix.json') return { rules: [], tools: [] };
  if (fileName === 'all-tools-execution-report.json') return { fixtures: [] };
  if (fileName === 'all-tools-idl-coverage.json') return { descriptors: [], tool_coverage: [] };
  if (fileName === 'all-tools-glasses-coverage.json') return { projections: [] };
  if (fileName === 'all-tools-app-family-coverage.json') return { app_families: [] };
  return {};
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    if (!key) return counts;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function mergeCounts(countMaps) {
  return countMaps.reduce((merged, counts) => {
    for (const [key, value] of Object.entries(counts)) {
      merged[key] = (merged[key] ?? 0) + value;
    }
    return merged;
  }, {});
}

function countWhere(items, predicate) {
  return items.filter(predicate).length;
}

function sum(items, valueFn) {
  return items.reduce((total, item) => total + valueFn(item), 0);
}

function isAdapterRequired(toolId) {
  return artifacts.idl.tool_coverage?.some(row => row.tool_id === toolId && row.adapter_required) ?? false;
}

function buildAppBackendContract(matrix) {
  const bindingsByToolId = new Map(bindingRows.map(row => [row.tool_id, row]));
  const policyById = new Map(policyRules.map(rule => [rule.tool_id, rule]));
  const idlToolCoverageByToolId = groupBy(artifacts.idl.tool_coverage ?? [], row => row.tool_id);
  const appInventoryById = new Map((artifacts.appInventory.apps ?? []).map(app => [app.id, app]));
  const aliases = artifacts.appInventory.aliases ?? {};
  const apps = matrix.rows.map(row => {
    const app = appInventoryById.get(row.app_id) ?? {};
    const appBindings = (bindingsByApp.get(row.app_id) ?? [])
      .slice()
      .sort((a, b) => `${a.service_id}:${a.name}`.localeCompare(`${b.service_id}:${b.name}`));
    const backendCapabilities = appBindings.map(binding => {
      const policy = policyById.get(binding.tool_id) ?? {};
      const idlCoverage = idlToolCoverageByToolId.get(binding.tool_id) ?? [];
      const mcpPlusPlusEligible = idlCoverage.length > 0 || binding.app_visible || row.orb_idl.descriptor_count > 0;
      return {
        capability_id: binding.capability_id,
        tool_id: binding.tool_id,
        service: binding.service_id,
        name: binding.name,
        category: binding.category,
        source_role: binding.role,
        visibility: binding.visibility,
        app_visible: Boolean(binding.app_visible),
        mcp_transport: binding.role === 'static_descriptor' ? 'eligible' : 'required',
        mcp_plus_plus_transport: mcpPlusPlusEligible ? 'eligible' : 'not-eligible',
        policy_class: binding.policy_class ?? policy.policy_class,
        confirmation_policy: binding.confirmation_policy ?? policy.confirmation_policy ?? 'none',
        receipt_strategy: receiptStrategyFor(binding, policy),
        receipt_required: (binding.receipt_policy ?? policy.receipt_policy) !== 'none',
        result_renderer: binding.result_renderer,
        glasses_exposure: binding.glasses_exposure,
        fallback: binding.non_app_reason ?? binding.glasses_fallback ?? policy.fallback ?? 'descriptor preview with receipt link',
      };
    });
    const descriptorState = row.orb_idl.descriptor_count > 0
      ? app.launch_kind === 'idl-generated' ? 'generated' : 'manual'
      : 'not-required';
    const localOnly = backendCapabilities.length === 0;
    return {
      canonical_id: row.app_id,
      aliases: Object.entries(aliases)
        .filter(([, canonical]) => canonical === row.app_id)
        .map(([alias]) => alias)
        .sort(),
      title: row.title,
      category: row.category,
      launch_owner: {
        owner_module: row.owner_module,
        launch_kind: row.launch_kind,
        component: row.component ?? null,
      },
      backend_state: row.binding_state,
      backend_rationale: row.binding_rationale,
      backend_capability_count: backendCapabilities.length,
      backend_capabilities: backendCapabilities,
      local_only_rationale: localOnly ? row.binding_rationale : null,
      orb_idl_state: {
        state: descriptorState,
        descriptor_count: row.orb_idl.descriptor_count,
        method_count: row.orb_idl.method_count,
        interface_cids: row.orb_idl.interface_cids,
        descriptor_ids: row.orb_idl.descriptor_ids,
        mcp_plus_plus_transport: row.orb_idl.descriptor_count > 0 ? 'eligible' : 'not-eligible',
        receipt_required: backendCapabilities.some(capability => capability.receipt_required),
      },
      glasses_strategy: {
        handoff: row.glasses.handoff_kind,
        fallback: row.glasses.fallback,
        projection_count: row.glasses.projection_count,
        displayable_projection_count: row.glasses.displayable_projection_count,
        behavior_counts: row.glasses.behavior_counts,
      },
      ux_scenarios: uxScenariosFor(row, backendCapabilities),
    };
  });
  const localOnlyApps = apps.filter(app => app.backend_capability_count === 0);
  const contract = {
    schema: 'swissknife.virtual-desktop-app-backend-contract.v1',
    contract_id: 'org.hallucinate.swissknife.virtual-desktop-app-backend-contract',
    generated_at: matrix.generated_at,
    generated_from: matrix.generated_from,
    app_count: apps.length,
    canonical_app_count: new Set(apps.map(app => app.canonical_id)).size,
    alias_count: Object.keys(aliases).length,
    backend_capability_count: apps.reduce((sum, app) => sum + app.backend_capability_count, 0),
    local_only_app_count: localOnlyApps.length,
    service_counts: mergeCounts(apps.map(app => countBy(app.backend_capabilities, capability => capability.service))),
    policy_class_counts: mergeCounts(apps.map(app => countBy(app.backend_capabilities, capability => capability.policy_class))),
    receipt_strategy_counts: mergeCounts(apps.map(app => countBy(app.backend_capabilities, capability => capability.receipt_strategy))),
    coverage: {
      omitted_app_count: 0,
      apps_with_launch_owner_count: apps.filter(app => app.launch_owner.owner_module && app.launch_owner.launch_kind).length,
      apps_with_orb_idl_state_count: apps.filter(app => app.orb_idl_state.state).length,
      apps_with_glasses_strategy_count: apps.filter(app => app.glasses_strategy.handoff !== undefined).length,
      apps_with_ux_scenarios_count: apps.filter(app => app.ux_scenarios.success && app.ux_scenarios.fallback && app.ux_scenarios.error).length,
      local_only_apps_with_rationale_count: localOnlyApps.filter(app => app.local_only_rationale).length,
    },
    legacy_aliases: aliases,
    apps,
  };
  contract.contract_cid = `sha256:${crypto
    .createHash('sha256')
    .update(JSON.stringify({ ...contract, generated_at: undefined, contract_cid: undefined }))
    .digest('hex')}`;
  return contract;
}

function receiptStrategyFor(binding, policy) {
  const receiptPolicy = binding.receipt_policy ?? policy.receipt_policy ?? 'none';
  const confirmationPolicy = binding.confirmation_policy ?? policy.confirmation_policy ?? 'none';
  if (receiptPolicy === 'none') return 'none';
  if (confirmationPolicy !== 'none') return 'confirmation-receipt';
  if (binding.app_visible) return 'event-dag-receipt';
  return 'receipt-required';
}

function uxScenariosFor(row, backendCapabilities) {
  const services = Array.from(new Set(backendCapabilities.map(capability => capability.service))).sort();
  const serviceLabel = services.length > 0 ? services.join(', ') : 'local browser state';
  return {
    success: `${row.app_id} renders the expected result and exposes receipt links for ${serviceLabel}.`,
    fallback: backendCapabilities.length > 0
      ? `${row.app_id} shows descriptor, dry-run, mobile confirmation, cached, or audio-summary fallback according to policy.`
      : `${row.app_id} explains its local-only rationale and continues without remote tool dispatch.`,
    error: `${row.app_id} shows a policy-aware error with retry, blocked-state, or receipt details.`,
  };
}

function renderMarkdown(matrix) {
  const lines = [];
  lines.push('# SwissKnife Virtual Desktop All-Tools Capability Matrix');
  lines.push('');
  lines.push(`Generated: ${matrix.generated_at}`);
  lines.push(`Matrix CID: \`${matrix.matrix_cid}\``);
  lines.push(`Decision: **${matrix.decision.toUpperCase().replace('_', '-')}**`);
  lines.push('');
  if (matrix.input_evidence.problems.length > 0) {
    lines.push('## Input blockers');
    lines.push('');
    for (const problem of matrix.input_evidence.problems) {
      lines.push(`- \`${problem.file}\` (${problem.code}): ${problem.reason}`);
    }
    lines.push('');
  }
  lines.push('## Summary');
  lines.push(`- Apps: ${matrix.app_count}`);
  lines.push(`- Apps with all-tools bindings: ${matrix.app_with_bound_tool_count}`);
  lines.push(`- Apps with app-visible tools: ${matrix.app_with_app_visible_tool_count}`);
  lines.push(`- App-visible tools: ${matrix.app_visible_tool_count}`);
  lines.push(`- Desktop/mobile-only tools: ${matrix.desktop_mobile_only_tool_count}`);
  lines.push(`- Supervisor-only tools: ${matrix.supervisor_only_tool_count}`);
  lines.push(`- Adapter-required tools: ${matrix.adapter_required_tool_count}`);
  lines.push(`- ORB/IDL descriptors: ${matrix.descriptor_count}`);
  lines.push(`- Meta glasses projections: ${matrix.projection_count}`);
  lines.push(`- Hardware-free replay states: ${matrix.hardware_free_replay_state_count}`);
  lines.push('');
  lines.push('## App Rows');
  lines.push('| App | State | Services | App-visible | Desktop/mobile-only | Supervisor-only | IDL | Glasses |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const row of matrix.rows) {
    lines.push(`| ${row.app_id} | ${row.binding_state} | ${row.manifest_service_families.join(', ') || '-'} | ${row.all_tools.app_visible_tool_count} | ${row.all_tools.desktop_mobile_only_count} | ${row.all_tools.supervisor_only_count} | ${row.orb_idl.descriptor_count} | ${row.glasses.projection_count} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function renderCoverageDoc(matrix, appBackendContract) {
  const lines = [];
  lines.push('# Virtual Desktop All-Tools App Coverage');
  lines.push('');
  lines.push(`Generated: ${matrix.generated_at}`);
  lines.push(`Matrix CID: \`${matrix.matrix_cid}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Virtual desktop apps: ${matrix.app_count}`);
  lines.push(`- Tool-backed apps with at least one binding row: ${matrix.app_status_counts.all_tools_any_binding_count}`);
  lines.push(`- Tool-backed apps with app-visible tools: ${matrix.app_with_app_visible_tool_count}`);
  lines.push(`- Manifest-only apps: ${matrix.app_status_counts.manifest_only_count}`);
  lines.push(`- Not-applicable apps: ${matrix.app_status_counts.not_applicable_count}`);
  lines.push(`- App-visible capabilities: ${matrix.app_visible_tool_count}`);
  lines.push(`- Desktop/mobile-only capabilities: ${matrix.desktop_mobile_only_tool_count}`);
  lines.push(`- Supervisor-only capabilities: ${matrix.supervisor_only_tool_count}`);
  lines.push(`- Backend contract apps: ${appBackendContract.app_count}`);
  lines.push(`- Backend contract capabilities: ${appBackendContract.backend_capability_count}`);
  lines.push(`- Local-only apps with rationale: ${appBackendContract.coverage.local_only_apps_with_rationale_count}/${appBackendContract.local_only_app_count}`);
  lines.push(`- Contract CID: \`${appBackendContract.contract_cid}\``);
  lines.push('');
  lines.push('## Coverage By App');
  lines.push('');
  lines.push('| App | Binding state | Rationale | App-visible | Desktop/mobile-only | Supervisor-only | Services | IDL | Glasses |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: |');
  for (const row of matrix.rows) {
    lines.push(`| ${row.app_id} | ${row.binding_state} | ${escapeCell(row.binding_rationale)} | ${row.all_tools.app_visible_tool_count} | ${row.all_tools.desktop_mobile_only_count} | ${row.all_tools.supervisor_only_count} | ${row.manifest_service_families.join(', ') || '-'} | ${row.orb_idl.descriptor_count} | ${row.glasses.projection_count} |`);
  }
  lines.push('');
  lines.push('## Visibility Semantics');
  lines.push('');
  lines.push('- `app_visible`: capability is routable from the virtual desktop app, with confirmation and receipts when policy requires them.');
  lines.push('- `desktop_mobile_only`: capability is intentionally withheld from direct browser app dispatch and must use desktop/mobile confirmation or blocked-state UX.');
  lines.push('- `supervisor_only`: capability remains represented for release evidence and supervisor receipts, but is not directly invokable by a desktop app.');
  lines.push('- `manifest_only` and `not_applicable`: the app is deliberately not backed by `ipfs_kit_py`, `ipfs_datasets_py`, or `ipfs_accelerate_py` for this release.');
  lines.push('');
  lines.push('## Frozen Backend Contract');
  lines.push('');
  lines.push('`test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json` freezes one canonical record per app, including launch owner, backend capability set, MCP/MCP++ eligibility, policy class, receipt strategy, ORB/IDL state, glasses handoff strategy, and success/fallback/error UX scenarios.');
  lines.push('');
  lines.push('| App | Canonical aliases | Backend caps | Local-only rationale | ORB/IDL | UX scenarios |');
  lines.push('| --- | --- | ---: | --- | --- | --- |');
  for (const app of appBackendContract.apps) {
    lines.push(`| ${app.canonical_id} | ${app.aliases.join(', ') || '-'} | ${app.backend_capability_count} | ${app.local_only_rationale ? 'yes' : '-'} | ${app.orb_idl_state.state}:${app.orb_idl_state.descriptor_count} | success/fallback/error |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
