#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outPath = path.join(evidenceRoot, 'capability-matrix.json');
const markdownPath = path.join(evidenceRoot, 'capability-matrix.md');

const artifacts = {
  appInventory: readJson('app-inventory.json'),
  bindings: readJson('all-tools-app-bindings.json'),
  policy: readJson('all-tools-policy-matrix.json'),
  execution: readJson('all-tools-execution-report.json'),
  idl: readJson('all-tools-idl-coverage.json'),
  glasses: readJson('all-tools-glasses-coverage.json'),
  appFamilyCoverage: readJson('all-tools-app-family-coverage.json'),
};

const policyByToolId = new Map(artifacts.policy.rules.map(rule => [rule.tool_id, rule]));
const fixtureByToolId = new Map((artifacts.execution.fixtures ?? []).map(fixture => [fixture.tool_id, fixture]));
const descriptorsByApp = groupBy(artifacts.idl.descriptors ?? [], descriptor => descriptor.app_id);
const projectionsByApp = groupBy(artifacts.glasses.projections ?? [], projection => projection.app_id);
const familiesByApp = new Map((artifacts.appFamilyCoverage.app_families ?? []).map(family => [family.app_id, family]));
const bindingsByApp = groupBy(artifacts.bindings.rows ?? [], row => row.app_id ?? 'unassigned');

const rows = artifacts.appInventory.apps.map(app => {
  const appBindings = bindingsByApp.get(app.id) ?? [];
  const visibleBindings = appBindings.filter(row => row.app_visible);
  const descriptors = descriptorsByApp.get(app.id) ?? [];
  const projections = projectionsByApp.get(app.id) ?? [];
  const family = familiesByApp.get(app.id);
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
    manifest_service_families: app.service_families ?? [],
    manifest_capabilities: app.capabilities ?? [],
    all_tools: {
      bound_tool_count: appBindings.length,
      app_visible_tool_count: visibleBindings.length,
      existing_capability_count: countWhere(visibleBindings, row => row.capability_source === 'registry'),
      generated_capability_count: countWhere(visibleBindings, row => row.capability_source === 'generated'),
      desktop_mobile_only_count: countWhere(appBindings, row => row.normalized_disposition === 'unsafe_without_human_review'),
      supervisor_only_count: countWhere(appBindings, row => row.normalized_disposition === 'server_internal'),
      adapter_required_tool_count: adapterRequiredTools.length,
      adapter_required_tool_ids: adapterRequiredTools.map(row => row.tool_id),
      service_counts: countBy(visibleBindings, row => row.service_id),
      policy_class_counts: countBy(policyRows, row => row.policy_class),
      receipt_required_count: countWhere(policyRows, row => row.receipt_policy !== 'none'),
      confirmation_required_count: countWhere(policyRows, row => row.confirmation_policy !== 'none'),
      execution_fixture_count: fixtureRows.length,
      execution_receipt_fixture_count: countWhere(fixtureRows, row => row.receipt_refs?.length > 0 || row.receipt_required),
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
      hardware_free_replay_state_count: sum(projections, projection => projection.replay?.length ?? 0),
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
const matrix = {
  schema: 'swissknife.virtual-desktop-all-tools-capability-matrix.v1',
  generated_at: new Date().toISOString(),
  generated_from: [
    'app-inventory.json',
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
  app_with_bound_tool_count: appVisibleRows.length,
  all_tools_bound_tool_count: sum(rows, row => row.all_tools.bound_tool_count),
  app_visible_tool_count: sum(rows, row => row.all_tools.app_visible_tool_count),
  adapter_required_tool_count: sum(rows, row => row.all_tools.adapter_required_tool_count),
  descriptor_count: sum(rows, row => row.orb_idl.descriptor_count),
  projection_count: sum(rows, row => row.glasses.projection_count),
  hardware_free_replay_state_count: sum(rows, row => row.glasses.hardware_free_replay_state_count),
  service_counts: mergeCounts(rows.map(row => row.all_tools.service_counts)),
  app_status_counts: {
    manifest_only_count: rows.filter(row => row.all_tools.app_visible_tool_count === 0).length,
    all_tools_bound_count: appVisibleRows.length,
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
fs.writeFileSync(markdownPath, renderMarkdown(matrix));

console.log(JSON.stringify({
  schema: matrix.schema,
  app_count: matrix.app_count,
  app_with_bound_tool_count: matrix.app_with_bound_tool_count,
  app_visible_tool_count: matrix.app_visible_tool_count,
  adapter_required_tool_count: matrix.adapter_required_tool_count,
  descriptor_count: matrix.descriptor_count,
  projection_count: matrix.projection_count,
  output: path.relative(projectRoot, outPath),
}, null, 2));

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(evidenceRoot, fileName), 'utf8'));
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

function renderMarkdown(matrix) {
  const lines = [];
  lines.push('# SwissKnife Virtual Desktop All-Tools Capability Matrix');
  lines.push('');
  lines.push(`Generated: ${matrix.generated_at}`);
  lines.push(`Matrix CID: \`${matrix.matrix_cid}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Apps: ${matrix.app_count}`);
  lines.push(`- Apps with all-tools bindings: ${matrix.app_with_bound_tool_count}`);
  lines.push(`- App-visible tools: ${matrix.app_visible_tool_count}`);
  lines.push(`- Adapter-required tools: ${matrix.adapter_required_tool_count}`);
  lines.push(`- ORB/IDL descriptors: ${matrix.descriptor_count}`);
  lines.push(`- Meta glasses projections: ${matrix.projection_count}`);
  lines.push(`- Hardware-free replay states: ${matrix.hardware_free_replay_state_count}`);
  lines.push('');
  lines.push('## App Rows');
  lines.push('| App | Services | Tools | IDL | Glasses | Adapter-required |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |');
  for (const row of matrix.rows) {
    lines.push(`| ${row.app_id} | ${row.manifest_service_families.join(', ') || '-'} | ${row.all_tools.app_visible_tool_count} | ${row.orb_idl.descriptor_count} | ${row.glasses.projection_count} | ${row.all_tools.adapter_required_tool_count} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
