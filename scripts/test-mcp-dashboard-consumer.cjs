#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const registryPath = path.join(root, 'src', 'services', 'swissknife-mcp-capability-registry.ts');
const testPath = path.join(root, 'test', 'mcp-plus-plus', 'ipfs-ui-descriptors.test.ts');

const registrySource = fs.readFileSync(registryPath, 'utf8');
const testSource = fs.readFileSync(testPath, 'utf8');

const requiredRegistryTerms = [
  "server_package: 'ipfs_kit_py'",
  "daemon_id: 'ipfs-kit'",
  'port: 8004',
  "health_path: '/api/mcp/status'",
  "receipt_schema: 'mcp_server_invocation_receipt_v1'",
  "'mediation_receipt_id'",
  "'Hallucinate App interaction_envelope'",
  "'control_surface policy_decision'",
  "'mediation_receipt'",
  "'supervised MCP server transport'"
];

const requiredTestTerms = [
  'getSwissknifeMCPCapabilityRegistry',
  'ipfs_kit_py: 8004',
  "buildSwissknifeMCPMediatedInvocationPlan('ipfs_kit_py'",
  "expect(kitPlan?.tool_name).toBe('ipfs_pin_add')"
];

const missing = [];
for (const term of requiredRegistryTerms) {
  if (!registrySource.includes(term)) {
    missing.push(`${registryPath}: ${term}`);
  }
}
for (const term of requiredTestTerms) {
  if (!testSource.includes(term)) {
    missing.push(`${testPath}: ${term}`);
  }
}

if (missing.length > 0) {
  console.error('Swissknife MCP dashboard consumer contract is incomplete:');
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log('Swissknife MCP dashboard consumer contract OK');
