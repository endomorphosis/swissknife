#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

const validator = String.raw`
import fs from 'fs';
import path from 'path';
import MCPDaemonManager from '../hallucinate_app/hallucinate_app/node/mcp_daemon_manager.js';
import {
  buildSwissknifeMCPDashboardConsumerPlans,
  buildSwissknifeMCPDashboardInvocationPlan,
} from './src/services/swissknife-mcp-capability-registry.ts';

const catalogPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-512-mcp-dashboard-catalog.json',
);
const consumerReceiptPath = path.resolve('test', 'e2e', 'fixtures', 'hao-681-mcp-dashboard-catalog-consumer.json');
const launchReceiptPath = path.resolve('test', 'e2e', 'fixtures', 'hao-704-mcp-dashboard-launch-gate.json');
const vai512ConsumptionReceiptPath = path.resolve(
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-512-hallucinate-swissknife-mcp-dashboard-consumption.json',
);
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const consumerReceipt = JSON.parse(fs.readFileSync(consumerReceiptPath, 'utf8'));
const launchReceipt = JSON.parse(fs.readFileSync(launchReceiptPath, 'utf8'));
const vai512ConsumptionReceipt = JSON.parse(fs.readFileSync(vai512ConsumptionReceiptPath, 'utf8'));
const liveCatalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
assert(JSON.stringify(catalog) === JSON.stringify(liveCatalog), 'Swissknife fixture does not match the Hallucinate App dashboard catalog');
assert(catalog.validation_task_id === 'VAI-512', 'Catalog validation task id must be VAI-512');
assert(catalog.dashboard_only_mocks === false, 'Catalog must reject dashboard-only mocks');
assert(
  JSON.stringify(catalog.launch_objective_ids) === JSON.stringify(['VAIOS-G723', 'VAIOS-G724', 'VAIOS-G728']),
  'Catalog launch objective lineage must include VAIOS-G724 and VAIOS-G728',
);
assert(catalog.launch_validation_gate?.task_id === 'MGW-533', 'Catalog launch validation gate must name MGW-533');
assert(catalog.launch_validation_gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gate must name VAIOS-G724');
assert(catalog.launch_validation_gate?.evidence_term === 'launch Playwright validation gate', 'Catalog launch validation gate evidence term mismatch');
const mgw547Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-547');
assert(mgw547Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include MGW-547 for VAIOS-G723');
assert(
  mgw547Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-objective-gap-7ea369464239.md',
  'MGW-547 launch gate must point at the current supervisor gap receipt',
);
assert(mgw547Gate?.attempt === 11, 'MGW-547 launch gate must expose the active attempt receipt');
assert(
  JSON.stringify(mgw547Gate?.attempt_receipts) === JSON.stringify([
    'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-547-attempt-11-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-06-28-mgw-547-attempt-11-launch-playwright-validation-gate.md',
  ]),
  'MGW-547 launch gate must point at the current attempt-11 launch receipts',
);
const mgw550Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-550');
assert(mgw550Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include MGW-550 for VAIOS-G724');
assert(
  mgw550Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-550-objective-gap-3e00ad2a0074.md',
  'MGW-550 launch gate must point at the current supervisor gap receipt',
);
const vai529Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-529');
assert(vai529Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-529 for VAIOS-G724');
assert(
  vai529Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-27-vai-529-objective-gap-3e00ad2a0074.md',
  'VAI-529 launch gate must point at the current supervisor gap receipt',
);
const hao718Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'HAO-718');
assert(hao718Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include HAO-718 for VAIOS-G724');
assert(
  hao718Gate?.supervisor_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-718-objective-gap-3e00ad2a0074.md',
  'HAO-718 launch gate must point at the current supervisor gap receipt',
);
assert(
  hao718Gate?.launch_gate_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-718-mcp-dashboard-launch-gate.md',
  'HAO-718 launch gate must point at the current launch gate receipt',
);
const hao720Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'HAO-720');
assert(hao720Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include HAO-720 for VAIOS-G724');
assert(
  hao720Gate?.supervisor_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-objective-gap-3e00ad2a0074.md',
  'HAO-720 launch gate must point at the current supervisor gap receipt',
);
assert(
  hao720Gate?.launch_gate_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-mcp-dashboard-launch-gate.md',
  'HAO-720 launch gate must point at the current launch gate receipt',
);
const hao724Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'HAO-724');
assert(hao724Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include HAO-724 for VAIOS-G724');
assert(
  hao724Gate?.supervisor_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-objective-gap-3e00ad2a0074.md',
  'HAO-724 launch gate must point at the current supervisor gap receipt',
);
assert(
  hao724Gate?.launch_gate_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-mcp-dashboard-launch-gate.md',
  'HAO-724 launch gate must point at the current launch gate receipt',
);
const vai535Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-535');
assert(vai535Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-535 for VAIOS-G724');
assert(
  vai535Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-535-objective-gap-3e00ad2a0074.md',
  'VAI-535 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai535Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-535-mcp-dashboard-launch-gate.md',
  'VAI-535 launch gate must point at the current launch gate receipt',
);
const vai537Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-537');
assert(vai537Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-537 for VAIOS-G724');
assert(
  vai537Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-537-objective-gap-3e00ad2a0074.md',
  'VAI-537 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai537Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-537-mcp-dashboard-launch-gate.md',
  'VAI-537 launch gate must point at the current launch gate receipt',
);
const vai539Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-539');
assert(vai539Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include VAI-539 for VAIOS-G724');
assert(
  vai539Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-539-objective-gap-3e00ad2a0074.md',
  'VAI-539 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai539Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-539-mcp-dashboard-launch-gate.md',
  'VAI-539 launch gate must point at the current launch gate receipt',
);
const vai542Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-542');
assert(vai542Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-542 for VAIOS-G723');
assert(
  vai542Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-542-objective-gap-7ea369464239.md',
  'VAI-542 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai542Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-542-mcp-dashboard-launch-gate.md',
  'VAI-542 launch gate must point at the current launch gate receipt',
);
assert(
  vai542Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-mcp-dashboard-launch-gate.md',
  'VAI-542 launch gate must point at the HAO-724 Hallucinate receipt',
);
assert(
  vai542Gate?.hallucinate_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-objective-gap-7ea369464239.md',
  'VAI-542 launch gate must point at the HAO-724 Hallucinate gap receipt',
);
assert(
  JSON.stringify(vai542Gate?.child_goals || []) === JSON.stringify([
    'VAIOS-G723-C1 Catalog normalization',
    'VAIOS-G723-C2 Dashboard UI wiring',
    'VAIOS-G723-C3 Mediated tool-call receipts',
    'VAIOS-G723-C4 Swissknife consumers',
    'VAIOS-G723-C5 Playwright coverage',
    'VAIOS-G723-C6 Supervisor-generated follow-up subtasks',
  ]),
  'VAI-542 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai542Gate?.follow_up_subtasks || []) === JSON.stringify(['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683']),
  'VAI-542 launch gate must preserve supervisor-generated follow-up subtasks',
);
const vai543Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'VAI-543');
assert(vai543Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include VAI-543 for VAIOS-G723');
assert(
  vai543Gate?.supervisor_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-543-objective-gap-7ea369464239.md',
  'VAI-543 launch gate must point at the current supervisor gap receipt',
);
assert(
  vai543Gate?.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-543-mcp-dashboard-launch-gate.md',
  'VAI-543 launch gate must point at the current launch gate receipt',
);
assert(
  vai543Gate?.hallucinate_backlog_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-vai-543-mcp-dashboard-launch-gate.md',
  'VAI-543 launch gate must point at the Hallucinate supervisor mirror',
);
assert(
  JSON.stringify(vai543Gate?.child_goals || []) === JSON.stringify([
    'VAIOS-G723-C1 Catalog normalization',
    'VAIOS-G723-C2 Dashboard UI wiring',
    'VAIOS-G723-C3 Mediated tool-call receipts',
    'VAIOS-G723-C4 Swissknife consumers',
    'VAIOS-G723-C5 Playwright coverage',
    'VAIOS-G723-C6 Supervisor-generated follow-up subtasks',
  ]),
  'VAI-543 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(vai543Gate?.follow_up_subtasks || []) === JSON.stringify(['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683']),
  'VAI-543 launch gate must preserve supervisor-generated follow-up subtasks',
);
const hao727Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'HAO-727');
assert(hao727Gate?.goal_id === 'VAIOS-G723', 'Catalog launch validation gates must include HAO-727 for VAIOS-G723');
assert(
  hao727Gate?.source_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-objective-gap-7ea369464239.md',
  'HAO-727 launch gate must point at the current Hallucinate supervisor gap receipt',
);
assert(
  hao727Gate?.launch_gate_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-mcp-dashboard-launch-gate.md',
  'HAO-727 launch gate must point at the current Hallucinate launch gate receipt',
);
assert(
  hao727Gate?.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/hao-727-mcp-dashboard-launch-gate.json',
  'HAO-727 launch gate must point at the shared Hallucinate App fixture',
);
assert(
  JSON.stringify(hao727Gate?.required_backends || []) === JSON.stringify(['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py']),
  'HAO-727 launch gate must require all dashboard MCP packages in catalog order',
);
assert(
  JSON.stringify(hao727Gate?.child_goals || []) === JSON.stringify([
    'VAIOS-G723-C1 Catalog normalization',
    'VAIOS-G723-C2 Dashboard UI wiring',
    'VAIOS-G723-C3 Mediated tool-call receipts',
    'VAIOS-G723-C4 Swissknife consumers',
    'VAIOS-G723-C5 Playwright coverage',
    'VAIOS-G723-C6 Supervisor-generated follow-up subtasks',
  ]),
  'HAO-727 launch gate must expose VAIOS-G723 dashboard child goals',
);
assert(
  JSON.stringify(hao727Gate?.supervisor_follow_up_subtasks || []) === JSON.stringify(['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683']),
  'HAO-727 launch gate must preserve supervisor-generated follow-up subtasks',
);
const mgw555Gate = (catalog.launch_validation_gates || []).find(gate => gate.task_id === 'MGW-555');
assert(mgw555Gate?.goal_id === 'VAIOS-G724', 'Catalog launch validation gates must include MGW-555 for VAIOS-G724');
assert(
  mgw555Gate?.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-objective-gap-3e00ad2a0074.md',
  'MGW-555 launch gate must point at the current supervisor gap receipt',
);
assert(
  mgw555Gate?.launch_gate_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-launch-playwright-validation-gate.md',
  'MGW-555 launch gate must point at the current launch gate receipt',
);
assert(catalog.swissknife_catalog_consumer_proof?.task_id === 'HAO-681', 'Catalog must expose the HAO-681 Swissknife consumer proof');
assert(
  JSON.stringify(catalog.swissknife_catalog_consumer_proof?.depends_on) === JSON.stringify(['HAO-677', 'HAO-680']),
  'HAO-681 proof must depend on HAO-677 and HAO-680',
);
assert(
  catalog.swissknife_catalog_consumer_proof?.evidence_term === 'Hallucinate App MCP dashboard catalog consumed by Swissknife applications',
  'HAO-681 proof evidence term mismatch',
);
assert(consumerReceipt.task_id === 'HAO-681', 'Swissknife dashboard catalog consumer receipt must name HAO-681');
assert(consumerReceipt.catalog_schema === catalog.schema, 'HAO-681 consumer receipt must use the Hallucinate dashboard catalog schema');
assert(consumerReceipt.catalog_generated_by === catalog.generated_by, 'HAO-681 consumer receipt must use the Hallucinate catalog source');
assert(consumerReceipt.receipt_schema === 'mcp_server_invocation_receipt_v1', 'HAO-681 consumer receipt must use the shared receipt schema');
assert(
  consumerReceipt.validation_commands.includes('npm --prefix swissknife run test:e2e:mcp'),
  'HAO-681 consumer receipt must include the Swissknife MCP gate command',
);
assert(launchReceipt.task_id === 'HAO-704', 'Swissknife MCP dashboard launch receipt must name HAO-704');
assert(launchReceipt.goal_id === 'VAIOS-G725', 'Swissknife MCP dashboard launch receipt must name VAIOS-G725');
assert(launchReceipt.evidence_term === 'launch Playwright validation gate', 'Swissknife launch receipt evidence term mismatch');
assert(
  launchReceipt.supervisor_gap_receipt === 'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-704-objective-gap-1d0c6a56cf6c.md',
  'Swissknife launch receipt must point at the HAO-704 objective gap',
);
assert(
  launchReceipt.validation_commands.includes('npm --prefix swissknife run test:e2e:mcp'),
  'Swissknife launch receipt must include the MCP Playwright gate command',
);
assert(vai512ConsumptionReceipt.schema === 'launch_readiness_receipt_v1', 'VAI-512 consumption receipt schema mismatch');
assert(vai512ConsumptionReceipt.task_id === 'VAI-512', 'VAI-512 consumption receipt must name VAI-512');
assert(vai512ConsumptionReceipt.goal_id === 'VAIOS-G723', 'VAI-512 consumption receipt must name VAIOS-G723');
assert(
  vai512ConsumptionReceipt.evidence_term === 'Hallucinate dashboard to Swissknife MCP consumer launch receipt',
  'VAI-512 consumption receipt evidence term mismatch',
);
assert(vai512ConsumptionReceipt.catalog_schema === catalog.schema, 'VAI-512 receipt catalog schema must match the shared catalog');
assert(vai512ConsumptionReceipt.catalog_generated_by === catalog.generated_by, 'VAI-512 receipt catalog source must match Hallucinate App');
assert(vai512ConsumptionReceipt.dashboard_only_mocks === false, 'VAI-512 receipt must reject dashboard-only mocks');
assert(vai512ConsumptionReceipt.shared_receipt_schema === 'mcp_server_invocation_receipt_v1', 'VAI-512 shared receipt schema mismatch');
assert(
  vai512ConsumptionReceipt.validation_commands.includes('npm --prefix swissknife run test:e2e:mcp'),
  'VAI-512 receipt must include the Swissknife MCP validation command',
);
const plans = buildSwissknifeMCPDashboardConsumerPlans(catalog);
const packages = plans.map(plan => plan.server_package).sort();
const expectedPackages = ['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py'];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(JSON.stringify(packages) === JSON.stringify(expectedPackages), 'Swissknife did not consume all dashboard MCP packages');
assert(new Set(plans.map(plan => plan.catalog_schema)).size === 1, 'Swissknife introduced duplicate dashboard catalog schemas');
assert(
  JSON.stringify([...vai512ConsumptionReceipt.required_backends].sort()) === JSON.stringify(expectedPackages),
  'VAI-512 receipt must require all dashboard MCP packages',
);

for (const plan of plans) {
  assert(plan.catalog_schema === 'hallucinate_app.mcp_dashboard_capability_catalog.v1', 'Unexpected dashboard catalog schema');
  assert(plan.catalog_generated_by === 'hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog', 'Catalog is not sourced from Hallucinate App');
  assert(plan.dashboard_only_mock === false, 'Dashboard-only mock consumer plan is not allowed');
  assert(plan.receipt_schema === 'mcp_server_invocation_receipt_v1', 'Receipt schema must remain shared');
  assert(plan.tools_list.operation === 'tools/list', 'tools/list operation missing');
  assert(plan.tools_call.operation === 'tools/call', 'tools/call operation missing');
  assert(plan.tools_call.safeProbe?.mutation === false, 'tools/call safe probe must be non-mutating');
  for (const field of ['interaction_envelope', 'policy_decision', 'mediation_receipt', 'mediation_receipt_id', 'receipt_cid']) {
    assert(plan.required_receipt_fields.includes(field), 'Missing receipt field ' + field);
  }
  assert(
    vai512ConsumptionReceipt.required_operations.includes(plan.server_package + ':tools/list') &&
      vai512ConsumptionReceipt.required_operations.includes(plan.server_package + ':tools/call'),
    'VAI-512 receipt must include tools/list and tools/call for ' + plan.server_package,
  );
}

for (const app of consumerReceipt.applications) {
  const plan = plans.find(candidate => candidate.server_package === app.server_package);
  assert(plan, 'Missing HAO-681 consumer plan for ' + app.server_package);
  assert(plan.app_id === app.app_id, 'HAO-681 app id mismatch for ' + app.server_package);
  assert(plan.daemon_id === app.daemon_id, 'HAO-681 daemon id mismatch for ' + app.server_package);
  assert(plan.tools_list.url === app.tools_list_url, 'HAO-681 tools/list URL mismatch for ' + app.server_package);
  assert(plan.tools_call.safeProbe?.tool_name === app.safe_tools_call_probe, 'HAO-681 safe probe tool mismatch for ' + app.server_package);
  assert(plan.tools_call.safeProbe?.expected_receipt === app.safe_probe_receipt, 'HAO-681 safe probe receipt mismatch for ' + app.server_package);
}

assert(
  buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_kit_py', 'tools/list').url === 'http://127.0.0.1:8004/mcp/tools/list',
  'ipfs_kit_py tools/list URL mismatch',
);
assert(
  buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_datasets_py', 'tools/call').safe_probe?.tool_name === 'datasets_list',
  'ipfs_datasets_py tools/call safe probe mismatch',
);
assert(
  buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_accelerate_py', 'tools/call').safe_probe?.tool_name === 'hardware_profile',
  'ipfs_accelerate_py tools/call safe probe mismatch',
);

console.log(JSON.stringify({
  status: 'ok',
  task_id: 'HAO-681',
  catalog_task_id: 'VAI-512',
  consumption_receipt_task_id: vai512ConsumptionReceipt.task_id,
  consumption_evidence_term: vai512ConsumptionReceipt.evidence_term,
  launch_task_id: catalog.launch_validation_gate.task_id,
  consumer_receipt_task_id: consumerReceipt.task_id,
  swissknife_launch_task_id: launchReceipt.task_id,
  launch_goal_ids: catalog.launch_objective_ids,
  swissknife_launch_goal_id: launchReceipt.goal_id,
  catalog_schema: catalog.schema,
  packages,
  operations: plans.flatMap(plan => [
    plan.server_package + ':tools/list',
    plan.server_package + ':tools/call',
  ]),
}, null, 2));
`;

const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', validator], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exit(typeof result.status === 'number' ? result.status : 1);
