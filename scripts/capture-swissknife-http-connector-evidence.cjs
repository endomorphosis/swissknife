#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outputPath = path.join(evidenceRoot, 'swissknife-http-connector-profile-a-reachability.json');

main();

function main() {
  for (const script of ['ensure-ipfs-mcp-compat-adapters.cjs', 'capture-ipfs-accelerate-adapter-coverage.cjs']) {
    const bootstrap = spawnSync(process.execPath, [path.join(__dirname, script)], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
    });
    if (bootstrap.error || bootstrap.status !== 0) {
      fail(bootstrap.error?.message || `${script} exited ${bootstrap.status}`);
      return;
    }
  }

  const result = spawnSync(process.execPath, [
    '--import',
    'tsx',
    '--input-type=module',
    '--eval',
    swissknifeProbe(),
  ], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: 90000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const evidence = parseTrailingJson(result.stdout);
  if (result.error || result.status !== 0 || !evidence) {
    fail(result.error?.message || result.stderr || result.stdout || `SwissKnife connector exited ${result.status}`);
    return;
  }

  writeEvidence(evidence);
  console.log(JSON.stringify({
    decision: evidence.decision,
    service_count: evidence.services.length,
    total_unique_callable_tools: evidence.total_unique_callable_tools,
    output: path.relative(projectRoot, outputPath),
  }, null, 2));
  if (evidence.decision !== 'go') process.exitCode = 1;
}

function swissknifeProbe() {
  return `
import * as ucans from '@ucans/ucans';
import {
  createMultiServerConnector,
  IPFS_KIT_SERVER,
  IPFS_DATASETS_SERVER,
  IPFS_ACCELERATE_SERVER,
} from './src/services/mcp/mcp-plus-plus-connector.ts';

const services = [
  { service: 'ipfs_kit_py', server: IPFS_KIT_SERVER.name, safeTool: 'files_stat' },
  { service: 'ipfs_datasets_py', server: IPFS_DATASETS_SERVER.name, safeTool: 'list_indices' },
  { service: 'ipfs_accelerate_py', server: IPFS_ACCELERATE_SERVER.name, safeTool: 'get_server_status' },
];
const agentKey = await ucans.EdKeypair.create({ exportable: true });
const agentDID = agentKey.did();
const connector = createMultiServerConnector(agentDID);
const connections = await connector.connectAll();
const rows = [];

for (const service of services) {
  const connection = connections.get(service.server);
  const serviceConnector = connector.getConnector(service.server);
  const toolNames = connection?.tools ?? [];
  let safeCallReturned = false;
  let profileA = {
    advertised: false,
    interface_count: 0,
    interface_cid: null,
    descriptor_method_count: 0,
    descriptor_covers_listed_tools: false,
    compatible: false,
    available: false,
  };
  let profileB = {
    advertised: false,
    executed: false,
    envelope_cid: null,
    receipt_cid: null,
    success: false,
  };
  let profileC = {
    advertised: false,
    peer_identity_verified: false,
    peer_did: null,
    delegation_proof_cid: null,
    delegation_valid: false,
  };
  let error = null;

  if (connection?.success && serviceConnector?.transportKind === 'http') {
    try {
      const response = await serviceConnector.callTool(service.safeTool, {});
      safeCallReturned = response !== undefined;
      const interfaces = await serviceConnector.listInterfaces();
      const descriptor = interfaces[0]
        ? await serviceConnector.getInterface(interfaces[0].interface_cid)
        : null;
      const compatibility = descriptor
        ? await serviceConnector.checkInterfaceCompatibility(descriptor.interface_cid)
        : null;
      const methodNames = new Set((descriptor?.methods ?? []).map(method => method.name));
      const descriptorCoversTools = methodNames.size === toolNames.length
        && toolNames.every(name => methodNames.has(name));
      profileA = {
        advertised: (connection?.profiles ?? []).includes('mcp++/mcp-idl'),
        interface_count: interfaces.length,
        interface_cid: descriptor?.interface_cid ?? null,
        descriptor_method_count: methodNames.size,
        descriptor_covers_listed_tools: descriptorCoversTools,
        compatible: compatibility?.compatible === true,
        available: (connection?.profiles ?? []).includes('mcp++/mcp-idl')
          && interfaces.length === 1
          && descriptorCoversTools
          && compatibility?.compatible === true,
      };
      const capability = {
        resource: 'mcp++://' + service.service + '/tool/' + service.safeTool,
        ability: 'mcp++/invoke',
      };
      const delegation = await serviceConnector.createDelegation(agentDID, [capability], 1);
      const delegationValidation = await serviceConnector.validateDelegation(delegation.proofCid, {
        ucan: delegation.ucan,
        requiredCapability: capability,
      });
      profileC = {
        advertised: (connection?.profiles ?? []).includes('mcp++/ucan'),
        peer_identity_verified: serviceConnector.verifiedPeerIdentity?.valid === true,
        peer_did: serviceConnector.peerDID,
        delegation_proof_cid: delegation.proofCid || null,
        delegation_valid: delegationValidation.valid === true,
      };
      const profileBExecution = descriptor
        ? await serviceConnector.callToolWithEnvelope(service.safeTool, {}, {
          interfaceCid: descriptor.interface_cid,
          proofCid: delegation.proofCid,
          ucan: delegation.ucan,
          ucanAudience: agentDID,
          timestamp: '2026-07-10T00:00:00.000Z',
          correlationId: 'profile-b-parity-' + service.service,
        })
        : null;
      profileB = {
        advertised: (connection?.profiles ?? []).includes('mcp++/cid-envelope'),
        executed: profileBExecution !== null,
        envelope_cid: profileBExecution?.envelope?.envelope_cid ?? null,
        receipt_cid: profileBExecution?.envelope?.receipt?.receipt_cid ?? null,
        success: profileBExecution?.envelope?.receipt?.success === true,
        persisted: profileBExecution?.envelope?.artifact_persistence?.complete === true,
        artifact_retrievable: profileBExecution?.envelope?.envelope_cid
          ? (await serviceConnector.getArtifact(profileBExecution.envelope.envelope_cid))?.verified === true
          : false,
      };
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  } else {
    error = 'SwissKnife HTTP connector was not established; Profile A probe skipped.';
  }

  rows.push({
    service: service.service,
    server: service.server,
    transport: serviceConnector?.transportKind ?? 'unknown',
    connect_success: connection?.success === true,
    profiles: connection?.profiles ?? [],
    listed_tool_count: toolNames.length,
    unique_tool_name_count: new Set(toolNames).size,
    safe_tool: service.safeTool,
    safe_call_returned: safeCallReturned,
    profile_a: profileA,
    profile_b: profileB,
    profile_c: profileC,
    error,
  });
}

await Promise.allSettled(services.map(service => connector.getConnector(service.server)?.disconnect()));
const passed = rows.every(row =>
  row.transport === 'http'
  && row.connect_success
  && row.profiles.includes('mcp++/mcp-idl')
  && row.listed_tool_count === row.unique_tool_name_count
  && row.safe_call_returned
  && row.profile_a.available
  && row.profile_c.advertised
  && row.profile_c.peer_identity_verified
  && typeof row.profile_c.peer_did === 'string'
  && typeof row.profile_c.delegation_proof_cid === 'string'
  && row.profile_c.delegation_valid
  && row.profile_b.advertised
  && row.profile_b.executed
  && typeof row.profile_b.envelope_cid === 'string'
  && typeof row.profile_b.receipt_cid === 'string'
  && row.profile_b.success
  && row.profile_b.persisted
  && row.profile_b.artifact_retrievable
);
console.log(JSON.stringify({
  schema: 'swissknife.http_mcp_connector_profile_abc_reachability.v2',
  generated_at: new Date().toISOString(),
  decision: passed ? 'go' : 'no_go',
  service_count: rows.length,
  total_unique_callable_tools: rows.reduce((total, row) => total + row.listed_tool_count, 0),
  services: rows,
}));
`;
}

function writeEvidence(evidence) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function fail(error) {
  writeEvidence({
    schema: 'swissknife.http_mcp_connector_profile_abc_reachability.v2',
    generated_at: new Date().toISOString(),
    decision: 'no_go',
    service_count: 0,
    total_unique_callable_tools: 0,
    error,
    services: [],
  });
  console.error(error);
  process.exitCode = 1;
}

function parseTrailingJson(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.lastIndexOf('\n{');
  if (start >= 0) {
    try { return JSON.parse(trimmed.slice(start + 1)); } catch {}
  }
  return null;
}
