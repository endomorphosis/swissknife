#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const announceFiles = [
  'ipfs-kit-mcp-p2p-announce.json',
  'ipfs-datasets-mcp-p2p-announce.json',
  'ipfs-accelerate-mcp-p2p-announce.json',
];
const outputPath = path.join(evidenceRoot, 'swissknife-libp2p-connector-reachability.json');

main();

function main() {
  const bootstrap = spawnSync(process.execPath, [path.join(__dirname, 'ensure-ipfs-mcp-libp2p-bridges.cjs')], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (bootstrap.error || bootstrap.status !== 0) {
    fail(bootstrap.error?.message || `bridge bootstrap exited ${bootstrap.status}`);
    return;
  }

  let announces;
  try {
    announces = announceFiles.map(fileName => ({
      ...JSON.parse(fs.readFileSync(path.join(evidenceRoot, fileName), 'utf8')),
      announce_file: fileName,
    }));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }

  const result = spawnSync(process.execPath, [
    '--import',
    'tsx',
    '--input-type=module',
    '--eval',
    swissknifeProbe(announces),
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

function swissknifeProbe(announces) {
  return `
import * as ucans from '@ucans/ucans';
import {
  createMultiServerConnector,
  IPFS_KIT_SERVER,
  IPFS_DATASETS_SERVER,
  IPFS_ACCELERATE_SERVER,
} from './src/services/mcp/mcp-plus-plus-connector.ts';

const announces = ${JSON.stringify(announces)};
const serverNames = {
  ipfs_kit_py: IPFS_KIT_SERVER.name,
  ipfs_datasets_py: IPFS_DATASETS_SERVER.name,
  ipfs_accelerate_py: IPFS_ACCELERATE_SERVER.name,
};
const safeTools = {
  ipfs_kit_py: 'files_stat',
  ipfs_datasets_py: 'list_indices',
  ipfs_accelerate_py: 'get_server_status',
};
const multiaddrs = Object.fromEntries(announces.map(announce => [serverNames[announce.service], announce.multiaddr]));
const agentKey = await ucans.EdKeypair.create({ exportable: true });
const agentDID = agentKey.did();
const connector = createMultiServerConnector(agentDID, { libp2p: multiaddrs });
const connections = await connector.connectAll();
const services = [];

for (const announce of announces) {
  const server = serverNames[announce.service];
  const safeTool = safeTools[announce.service];
  const connection = connections.get(server);
  const serviceConnector = connector.getConnector(server);
  const connected = connection?.success === true;
  const transport = serviceConnector?.transportKind ?? 'unknown';
  const toolNames = connection?.tools ?? [];
  const uniqueToolNameCount = new Set(toolNames).size;
  const p2pSessionEstablished = connected && transport === 'libp2p';
  let safeCallReturned = false;
  let concurrentSafeCallsReturned = false;
  let profileA = {
    advertised: false,
    interface_count: 0,
    interface_cid: null,
    descriptor_method_count: 0,
    descriptor_covers_listed_tools: false,
    compatible: false,
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
    peer_id: null,
    peer_id_matches_announce: false,
    multiaddr_matches_announce: false,
    delegation_proof_cid: null,
    delegation_valid: false,
  };
  let profileF = {
    advertised: false,
    history_count: 0,
    execution_event_present: false,
  };
  let error = null;

  // Do not call through a failed connector: MCPPPServerConnector would then
  // select its HTTP path, which would invalidate this transport proof.
  if (p2pSessionEstablished && serviceConnector) {
    try {
      const response = await serviceConnector.callTool(safeTool, {});
      safeCallReturned = response !== undefined;
      const concurrent = await Promise.all([
        serviceConnector.callTool(safeTool, {}),
        serviceConnector.callTool(safeTool, {}),
      ]);
      concurrentSafeCallsReturned = concurrent.every(response => response !== undefined);
      const interfaces = await serviceConnector.listInterfaces();
      const descriptor = interfaces[0]
        ? await serviceConnector.getInterface(interfaces[0].interface_cid)
        : null;
      const compatibility = descriptor
        ? await serviceConnector.checkInterfaceCompatibility(descriptor.interface_cid)
        : null;
      const descriptorMethods = new Set((descriptor?.methods ?? []).map(method => method.name));
      profileA = {
        advertised: (connection?.profiles ?? []).includes('mcp++/idl'),
        interface_count: interfaces.length,
        interface_cid: descriptor?.interface_cid ?? null,
        descriptor_method_count: descriptorMethods.size,
        descriptor_covers_listed_tools: descriptorMethods.size === toolNames.length
          && toolNames.every(name => descriptorMethods.has(name)),
        compatible: compatibility?.compatible === true,
        available: (connection?.profiles ?? []).includes('mcp++/idl')
          && interfaces.length === 1
          && descriptorMethods.size === toolNames.length
          && toolNames.every(name => descriptorMethods.has(name))
          && compatibility?.compatible === true,
      };
      const capability = {
        resource: 'mcp++://' + announce.service + '/tool/' + safeTool,
        ability: 'mcp++/invoke',
      };
      const delegation = await serviceConnector.createDelegation(agentDID, [capability], 1);
      const delegationValidation = await serviceConnector.validateDelegation(delegation.proofCid, {
        ucan: delegation.ucan,
        requiredCapability: capability,
      });
      const identity = serviceConnector.verifiedPeerIdentity;
      profileC = {
        advertised: (connection?.profiles ?? []).includes('mcp++/ucan'),
        peer_identity_verified: identity?.valid === true,
        peer_did: serviceConnector.peerDID,
        peer_id: identity?.peerId ?? null,
        peer_id_matches_announce: identity?.peerId === announce.peer_id,
        multiaddr_matches_announce: identity?.multiaddr === announce.multiaddr,
        delegation_proof_cid: delegation.proofCid || null,
        delegation_valid: delegationValidation.valid === true,
      };
      const profileBExecution = descriptor
        ? await serviceConnector.callToolWithEnvelope(safeTool, {}, {
          interfaceCid: descriptor.interface_cid,
          proofCid: delegation.proofCid,
          ucan: delegation.ucan,
          ucanAudience: agentDID,
          timestamp: '2026-07-10T00:00:00.000Z',
          correlationId: 'profile-b-parity-' + announce.service,
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
      const dagHistory = await serviceConnector.getDAGHistory(20);
      const eventCid = profileBExecution?.envelope?.event_cid ?? null;
      profileF = {
        advertised: (connection?.profiles ?? []).includes('mcp++/event-dag'),
        history_count: dagHistory.length,
        execution_event_present: typeof eventCid === 'string'
          && dagHistory.some(event => event?.event_cid === eventCid),
      };
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  } else {
    error = 'Profile E libp2p session was not established; call skipped to prevent HTTP fallback.';
  }

  services.push({
    service: announce.service,
    server,
    announce_file: announce.announce_file,
    multiaddr: announce.multiaddr,
    protocol: announce.protocol,
    announced_tool_count: announce.tool_count,
    connect_success: connected,
    transport,
    p2p_session_established: p2pSessionEstablished,
    profiles: connection?.profiles ?? [],
    listed_tool_count: toolNames.length,
    unique_tool_name_count: uniqueToolNameCount,
    tool_count_matches_announce: toolNames.length === announce.tool_count,
    safe_tool: safeTool,
    safe_call_returned: safeCallReturned,
    concurrent_safe_calls_returned: concurrentSafeCallsReturned,
    profile_a: profileA,
    profile_b: profileB,
    profile_c: profileC,
    profile_f: profileF,
    no_http_fallback: p2pSessionEstablished,
    error,
  });
}

await Promise.allSettled(announces.map(announce => connector.getConnector(serverNames[announce.service])?.disconnect()));
const passed = services.every(service =>
  service.protocol === '/mcp+p2p/1.0.0'
  && service.connect_success
  && service.transport === 'libp2p'
  && service.p2p_session_established
  && service.profiles.includes('mcp++/p2p-transport')
  && service.tool_count_matches_announce
  && service.listed_tool_count === service.unique_tool_name_count
  && service.safe_call_returned
  && service.concurrent_safe_calls_returned
  && service.profile_a.advertised
  && service.profile_a.interface_count === 1
  && typeof service.profile_a.interface_cid === 'string'
  && service.profile_a.descriptor_covers_listed_tools
  && service.profile_a.compatible
  && service.profile_c.advertised
  && service.profile_c.peer_identity_verified
  && typeof service.profile_c.peer_did === 'string'
  && service.profile_c.peer_id_matches_announce
  && service.profile_c.multiaddr_matches_announce
  && typeof service.profile_c.delegation_proof_cid === 'string'
  && service.profile_c.delegation_valid
  && service.profile_b.advertised
  && service.profile_b.executed
  && typeof service.profile_b.envelope_cid === 'string'
  && typeof service.profile_b.receipt_cid === 'string'
  && service.profile_b.success
  && service.profile_b.persisted
  && service.profile_b.artifact_retrievable
  && service.profile_f.advertised
  && service.profile_f.execution_event_present
  && service.no_http_fallback
);
console.log(JSON.stringify({
  schema: 'swissknife.libp2p_mcp_connector_profile_abcf_reachability.v3',
  generated_at: new Date().toISOString(),
  decision: passed ? 'go' : 'no_go',
  protocol: '/mcp+p2p/1.0.0',
  service_count: services.length,
  total_unique_callable_tools: services.reduce((total, service) => total + service.listed_tool_count, 0),
  services,
}));
`;
}

function writeEvidence(evidence) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function fail(error) {
  const evidence = {
    schema: 'swissknife.libp2p_mcp_connector_profile_abcf_reachability.v3',
    generated_at: new Date().toISOString(),
    decision: 'no_go',
    protocol: '/mcp+p2p/1.0.0',
    service_count: 0,
    total_unique_callable_tools: 0,
    error,
    services: [],
  };
  writeEvidence(evidence);
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
