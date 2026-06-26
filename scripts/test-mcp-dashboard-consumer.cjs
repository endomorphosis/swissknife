#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

const validator = String.raw`
import fs from 'fs';
import path from 'path';
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
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
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
  task_id: 'VAI-512',
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
