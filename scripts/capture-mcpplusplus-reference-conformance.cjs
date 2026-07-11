#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { verifyProfileAResult, stableStringify } = require('./mcpplusplus-profile-a.cjs');
const { verifyProfileBResult, verifyProfileBPersistence } = require('./mcpplusplus-profile-b.cjs');
const { verifyPeerIdentity } = require('./mcpplusplus-profile-c.cjs');
const ucans = require('@ucans/ucans');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const referenceRoot = path.join(workspaceRoot, 'Mcp-Plus-Plus');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outputPath = path.join(evidenceRoot, 'mcpplusplus-reference-conformance.json');
const services = [
  { service: 'ipfs_kit_py', endpoint: 'http://127.0.0.1:8014/mcp' },
  { service: 'ipfs_datasets_py', endpoint: 'http://127.0.0.1:3002/mcp' },
  { service: 'ipfs_accelerate_py', endpoint: 'http://127.0.0.1:3003/mcp' },
];
const requestedProfiles = {
  'mcp++/mcp-idl': true,
  'mcp++/cid-envelope': true,
  'mcp++/ucan': true,
  'mcp++/deontic-policy': true,
  'mcp++/event-dag': true,
  'mcp++/p2p-transport': true,
};
const profileMethods = [
  ['profile_d', 'mcp++/policy/evaluate', { intent_cid: 'bafkreigh2akiscaildc...', tool: 'status' }],
  ['profile_e_http', 'mcp++/p2p/peers', {}],
];

main().catch(error => fail(error instanceof Error ? error.message : String(error)));

async function main() {
  runScript('ensure-ipfs-mcp-compat-adapters.cjs');
  runScript('capture-mcp-libp2p-fleet-evidence.cjs');

  const serviceResults = [];
  for (const service of services) serviceResults.push(await probeService(service));
  const p2p = readJson('mcpplusplus-libp2p-fleet-reachability.json');
  const referenceRevision = gitReferenceRevision();
  const allBaselineReady = serviceResults.every(service => service.baseline_mcp.ready);
  const p2pTransportReady = (p2p?.services ?? []).every(service =>
    service.initialize_ok
    && service.protocol === '/mcp+p2p/1.0.0'
    && service.tool_count_matches_announce
    && service.safe_call_returned,
  );
  const p2pCanonicalInitialize = (p2p?.services ?? []).every(service =>
    service.canonical_initialize_result?.protocol_version_present
    && service.canonical_initialize_result?.server_info_present
    && service.canonical_initialize_result?.experimental_capabilities_present,
  );
  const profileAHttpReady = serviceResults.every(service => service.profiles.profile_a.available);
  const profileALibp2pReady = (p2p?.services ?? []).every(service => service.profile_a?.available);
  const profileATransportParity = serviceResults.every(service => {
    const peer = (p2p?.services ?? []).find(candidate => candidate.service === service.service);
    return peer?.profile_a?.interface_cid === service.profiles.profile_a.interface_cid;
  });
  const profileBHttpReady = serviceResults.every(service => service.profiles.profile_b.available);
  const profileBLibp2pReady = (p2p?.services ?? []).every(service => service.profile_b?.valid);
  const profileBTransportParity = serviceResults.every(service => {
    const peer = (p2p?.services ?? []).find(candidate => candidate.service === service.service);
    return peer?.profile_b?.interface_cid === service.profiles.profile_b.interface_cid
      && peer?.profile_b?.input_cid === service.profiles.profile_b.input_cid
      && peer?.profile_b?.envelope_cid === service.profiles.profile_b.envelope_cid;
  });
  const fullProfilesReady = serviceResults.every(service =>
    service.profiles.profile_a.available
    && service.profiles.profile_b.available
    && service.profiles.profile_c.available
    && service.profiles.profile_d.available
    && service.dag.available
    && service.profiles.profile_e_http.available,
  ) && p2pCanonicalInitialize;

  const evidence = {
    schema: 'swissknife.mcpplusplus_reference_conformance.v1',
    generated_at: new Date().toISOString(),
    reference: {
      repository: 'https://github.com/endomorphosis/Mcp-Plus-Plus',
      index: 'docs/index.md',
      revision: referenceRevision,
    },
    scope: 'configured SwissKnife virtual-desktop MCP gateways and their advertised libp2p peers',
    decision: fullProfilesReady ? 'go' : 'partial',
    baseline_mcp_ready: allBaselineReady,
    profile_a_http_ready: profileAHttpReady,
    profile_a_libp2p_ready: profileALibp2pReady,
    profile_a_transport_parity: profileATransportParity,
    profile_a_ready: profileAHttpReady && profileALibp2pReady && profileATransportParity,
    profile_b_http_ready: profileBHttpReady,
    profile_b_libp2p_ready: profileBLibp2pReady,
    profile_b_transport_parity: profileBTransportParity,
    profile_b_ready: profileBHttpReady && profileBLibp2pReady && profileBTransportParity,
    profile_e_transport_ready: p2pTransportReady,
    profile_e_canonical_initialize_ready: p2pCanonicalInitialize,
    full_profile_surface_ready: fullProfilesReady,
    services: serviceResults,
    libp2p: p2p ? {
      path: path.relative(projectRoot, path.join(evidenceRoot, 'mcpplusplus-libp2p-fleet-reachability.json')),
      generated_at: p2p.generated_at,
      decision: p2p.decision,
      service_count: p2p.service_count,
      total_unique_callable_tools: p2p.total_unique_callable_tools,
      services: (p2p.services ?? []).map(service => ({
        service: service.service,
        protocol: service.protocol,
        listed_tool_count: service.listed_tool_count,
        safe_tool: service.safe_tool,
        safe_call_returned: service.safe_call_returned,
        canonical_initialize_result: service.canonical_initialize_result ?? null,
        profile_a: service.profile_a ?? null,
        profile_b: service.profile_b ?? null,
      })),
    } : null,
    blockers: collectBlockers(
      serviceResults,
      p2pCanonicalInitialize,
      profileALibp2pReady,
      profileATransportParity,
      profileBLibp2pReady,
      profileBTransportParity,
    ),
  };
  writeEvidence(evidence);
  console.log(JSON.stringify({
    decision: evidence.decision,
    baseline_mcp_ready: evidence.baseline_mcp_ready,
    profile_a_ready: evidence.profile_a_ready,
    profile_b_ready: evidence.profile_b_ready,
    profile_e_transport_ready: evidence.profile_e_transport_ready,
    profile_e_canonical_initialize_ready: evidence.profile_e_canonical_initialize_ready,
    output: path.relative(projectRoot, outputPath),
  }, null, 2));
  if (evidence.decision !== 'go') process.exitCode = 2;
}

async function probeService(service) {
  const initialize = await rpc(service.endpoint, 'initialize', {
    protocolVersion: '2024-11-05',
    clientInfo: { name: 'swissknife-mcpplusplus-reference-audit', version: '1.0.0' },
    capabilities: { tools: {}, experimental: requestedProfiles },
  });
  const tools = await rpc(service.endpoint, 'tools/list', {});
  const profiles = {};
  for (const [profile, method, params] of profileMethods) {
    profiles[profile] = summarizeMethod(method, await rpc(service.endpoint, method, params));
  }
  profiles.profile_c = await probeProfileC(service, initialize.body?.result);
  profiles.profile_a = await probeProfileA(service, tools, initialize.body?.result);
  profiles.profile_b = await probeProfileB(service, profiles.profile_a);
  const peerRows = profiles.profile_e_http.result?.peers;
  profiles.profile_e_http.peer_count = Array.isArray(peerRows) ? peerRows.length : 0;
  profiles.profile_e_http.available = profiles.profile_e_http.available
    && profiles.profile_e_http.peer_count === 1
    && typeof peerRows[0]?.id === 'string'
    && typeof peerRows[0]?.multiaddr === 'string';
  const dag = summarizeMethod('GET /mcp/dag/frontier', await httpRequest(`${service.endpoint.replace(/\/mcp$/, '')}/mcp/dag/frontier`));
  const initResult = initialize.body?.result;
  const baselineMcp = {
    initialize: initialize,
    tools_list: tools,
    canonical_initialize_result: Boolean(
      typeof initResult?.protocolVersion === 'string'
      && initResult?.serverInfo && typeof initResult.serverInfo === 'object'
      && initResult?.capabilities && typeof initResult.capabilities === 'object'
      && initResult.capabilities.experimental && typeof initResult.capabilities.experimental === 'object',
    ),
    ready: initialize.status === 200
      && !initialize.body?.error
      && tools.status === 200
      && Array.isArray(tools.body?.result?.tools),
  };
  return {
    service: service.service,
    endpoint: service.endpoint,
    baseline_mcp: baselineMcp,
    profiles,
    dag,
  };
}

async function probeProfileC(service, initializeResult) {
  const safeTools = {
    ipfs_kit_py: 'files_stat',
    ipfs_datasets_py: 'list_indices',
    ipfs_accelerate_py: 'get_server_status',
  };
  const client = await ucans.EdKeypair.create({ exportable: true });
  const audience = client.did();
  const nonce = `reference-profile-c-${service.service}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const identity = await rpc(service.endpoint, 'mcp++/ucan/identity', {
    audience,
    nonce,
    transport: 'http',
  });
  const peer = await verifyPeerIdentity(identity.body?.result, {
    audience,
    nonce,
    service: service.service,
    transport: 'http',
  });
  const capability = {
    resource: `mcp++://${service.service}/tool/${safeTools[service.service]}`,
    ability: 'mcp++/invoke',
  };
  const delegation = await rpc(service.endpoint, 'mcp++/ucan/delegate', {
    audience,
    capabilities: [capability],
    lifetime_seconds: 60,
  });
  const delegationResult = delegation.body?.result ?? {};
  const validation = await rpc(service.endpoint, 'mcp++/ucan/validate', {
    proof_cid: delegationResult.proof_cid,
    ucan: delegationResult.ucan,
    audience,
    required_capability: capability,
  });
  const validationResult = validation.body?.result ?? {};
  const advertised = initializeResult?.capabilities?.experimental?.['mcp++/ucan'] === true;
  return {
    method: 'mcp++/ucan/{identity,delegate,validate}',
    status: validation.status,
    available: advertised
      && identity.status === 200
      && delegation.status === 200
      && validation.status === 200
      && peer.valid === true
      && typeof peer.did === 'string'
      && typeof delegationResult.proof_cid === 'string'
      && validationResult.valid === true,
    error: identity.body?.error ?? delegation.body?.error ?? validation.body?.error ?? null,
    result_keys: ['peer_did', 'delegation_proof_cid', 'delegation_valid'],
    result: {
      peer_did: peer.did,
      peer_identity_valid: peer.valid === true,
      delegation_proof_cid: delegationResult.proof_cid ?? null,
      delegation_valid: validationResult.valid === true,
    },
  };
}

async function probeProfileB(service, profileA) {
  const safeTools = {
    ipfs_kit_py: 'files_stat',
    ipfs_datasets_py: 'list_indices',
    ipfs_accelerate_py: 'get_server_status',
  };
  const interfaceCid = profileA.interface_cid;
  const params = {
    interface_cid: interfaceCid,
    tool: safeTools[service.service],
    arguments: {},
    parents: [],
    timestamp: '2026-07-10T00:00:00.000Z',
    correlation_id: `profile-b-parity-${service.service}`,
  };
  const execute = await rpc(service.endpoint, 'mcp++/execute', params);
  const rest = await httpRequest(`${service.endpoint.replace(/\/mcp$/, '')}/mcp/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(params),
  });
  const result = execute.body?.result;
  const restResult = rest.body;
  const valid = verifyProfileBResult(result);
  const restValid = verifyProfileBResult(restResult);
  const persisted = verifyProfileBPersistence(result);
  const restPersisted = verifyProfileBPersistence(restResult);
  const artifact = result?.envelope_cid
    ? await retrieveArtifact(service.endpoint.replace(/\/mcp$/, ''), result.envelope_cid, Buffer.from(stableStringify(result.envelope), 'utf8'))
    : { available: false, backend: null };
  const available = execute.status >= 200 && execute.status < 300
    && rest.status >= 200 && rest.status < 300
    && valid
    && restValid
    && persisted
    && restPersisted
    && artifact.available
    && result?.receipt?.success === true
    && restResult?.receipt?.success === true
    && result?.envelope?.interface_cid === interfaceCid
    && restResult?.envelope?.interface_cid === interfaceCid;
  return {
    method: 'mcp++/execute',
    status: execute.status,
    available,
    interface_cid: result?.envelope?.interface_cid ?? null,
    input_cid: result?.input_cid ?? null,
    envelope_cid: result?.envelope_cid ?? null,
    receipt_cid: result?.receipt?.receipt_cid ?? null,
    valid,
    rest_valid: restValid,
    persisted,
    rest_persisted: restPersisted,
    artifact_retrievable: artifact.available,
    persistence_backends: Array.from(new Set(Object.values(result?.artifact_persistence?.artifacts ?? {})
      .map(record => record?.backend)
      .filter(backend => typeof backend === 'string'))).sort(),
    artifact_retrieval_backend: artifact.backend,
    rest_status: rest.status,
    success: result?.receipt?.success === true,
    error: execute.body?.error ?? execute.error ?? rest.body?.error ?? rest.error ?? null,
  };
}

async function probeProfileA(service, toolsResponse, initializeResult) {
  const list = await rpc(service.endpoint, 'interfaces/list', {});
  const listResult = list.body?.result ?? {};
  const cids = Array.from(new Set([
    ...(Array.isArray(listResult.interface_cids) ? listResult.interface_cids : []),
    ...(Array.isArray(listResult.interfaces) ? listResult.interfaces : []),
  ].filter(cid => typeof cid === 'string'))).sort();
  const interfaceCid = cids[0] ?? null;
  const get = interfaceCid
    ? await rpc(service.endpoint, 'interfaces/get', { interface_cid: interfaceCid })
    : { status: 0, body: null, error: 'interfaces/list returned no interface CID' };
  const descriptorResult = get.body?.result ?? null;
  const compat = interfaceCid
    ? await rpc(service.endpoint, 'interfaces/compat', { client_cid: interfaceCid, server_cid: interfaceCid })
    : { status: 0, body: null, error: 'interfaces/list returned no interface CID' };
  const baseUrl = service.endpoint.replace(/\/mcp$/, '');
  const restList = await httpRequest(`${baseUrl}/mcp/interfaces`);
  const restGet = interfaceCid
    ? await httpRequest(`${baseUrl}/mcp/interfaces/${encodeURIComponent(interfaceCid)}`)
    : { status: 0, body: null, error: 'interfaces/list returned no interface CID' };
  const restCompat = interfaceCid
    ? await httpRequest(`${baseUrl}/mcp/interfaces/compat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ client_cid: interfaceCid, server_cid: interfaceCid }),
    })
    : { status: 0, body: null, error: 'interfaces/list returned no interface CID' };
  const descriptor = descriptorResult?.descriptor;
  const methods = Array.isArray(descriptor?.methods) ? descriptor.methods : [];
  const methodNames = methods
    .map(method => method?.name)
    .filter(name => typeof name === 'string');
  const toolNames = Array.isArray(toolsResponse.body?.result?.tools)
    ? toolsResponse.body.result.tools.map(tool => tool?.name).filter(name => typeof name === 'string')
    : [];
  const restResult = restGet.body;
  const descriptorValid = verifyProfileAResult(descriptorResult);
  const restDescriptorValid = verifyProfileAResult(restResult);
  const persisted = descriptorResult?.artifact_persistence?.complete === true
    && descriptorResult?.artifact_persistence?.interface_descriptor?.persisted === true
    && descriptorResult?.artifact_persistence?.interface_descriptor?.verified === true;
  const restPersisted = restResult?.artifact_persistence?.complete === true
    && restResult?.artifact_persistence?.interface_descriptor?.persisted === true
    && restResult?.artifact_persistence?.interface_descriptor?.verified === true;
  const artifact = interfaceCid && descriptorResult?.canonical_bytes_base64
    ? await retrieveArtifact(baseUrl, interfaceCid, Buffer.from(descriptorResult.canonical_bytes_base64, 'base64'))
    : { available: false, backend: null };
  const methodCoverage = methodNames.length === toolNames.length
    && methodNames.length === new Set(methodNames).size
    && toolNames.every(name => methodNames.includes(name));
  const restListCids = Array.from(new Set([
    ...(Array.isArray(restList.body?.interface_cids) ? restList.body.interface_cids : []),
    ...(Array.isArray(restList.body?.interfaces) ? restList.body.interfaces : []),
  ].filter(cid => typeof cid === 'string'))).sort();
  const available = list.status >= 200 && list.status < 300
    && initializeResult?.capabilities?.experimental?.['mcp++/mcp-idl'] === true
    && get.status >= 200 && get.status < 300
    && compat.status >= 200 && compat.status < 300
    && descriptorValid
    && persisted
    && restPersisted
    && artifact.available
    && methodCoverage
    && compat.body?.result?.compatible === true
    && restList.status >= 200 && restList.status < 300
    && restListCids.length === 1 && restListCids[0] === interfaceCid
    && restGet.status >= 200 && restGet.status < 300
    && restDescriptorValid
    && restCompat.status >= 200 && restCompat.status < 300
    && restCompat.body?.compatible === true;
  return {
    method: 'interfaces/list + interfaces/get + interfaces/compat',
    status: list.status,
    available,
    interface_count: cids.length,
    interface_cid: interfaceCid,
    descriptor_valid: descriptorValid,
    rest_descriptor_valid: restDescriptorValid,
    persisted,
    rest_persisted: restPersisted,
    artifact_retrievable: artifact.available,
    persistence_backend: descriptorResult?.artifact_persistence?.interface_descriptor?.backend ?? null,
    rest_persistence_backend: restResult?.artifact_persistence?.interface_descriptor?.backend ?? null,
    artifact_retrieval_backend: artifact.backend,
    method_count: methodNames.length,
    method_count_matches_tools: methodCoverage,
    negotiated: initializeResult?.capabilities?.experimental?.['mcp++/mcp-idl'] === true,
    compatible: compat.body?.result?.compatible === true,
    rest_compatible: restCompat.body?.compatible === true,
    rest_statuses: { list: restList.status, get: restGet.status, compat: restCompat.status },
    error: list.body?.error ?? get.body?.error ?? compat.body?.error ?? list.error ?? get.error ?? compat.error ?? null,
  };
}

async function retrieveArtifact(baseUrl, cid, expectedBytes) {
  const response = await httpRequest(`${baseUrl}/mcp/artifacts/${encodeURIComponent(cid)}`);
  const actual = typeof response.body?.bytes_base64 === 'string'
    ? Buffer.from(response.body.bytes_base64, 'base64')
    : Buffer.alloc(0);
  return {
    available: response.status === 200
      && response.body?.found === true
      && response.body?.verified === true
      && response.body?.cid === cid
      && actual.equals(expectedBytes),
    backend: response.body?.backend ?? null,
  };
}

function summarizeMethod(method, response) {
  return {
    method,
    status: response.status,
    available: response.status >= 200
      && response.status < 300
      && !response.body?.error
      && !response.body?.detail
      && !response.body?.error?.message?.includes('Unsupported method'),
    error: response.body?.error ?? response.body?.detail ?? response.error ?? null,
    result_keys: response.body?.result && typeof response.body.result === 'object'
      ? Object.keys(response.body.result).sort()
      : [],
    result: response.body?.result ?? null,
  };
}

async function rpc(endpoint, method, params) {
  return httpRequest(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `reference-${method}`, method, params }),
  });
}

async function httpRequest(url, init = {}) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function collectBlockers(
  services,
  p2pCanonicalInitialize,
  profileALibp2pReady,
  profileATransportParity,
  profileBLibp2pReady,
  profileBTransportParity,
) {
  const blockers = [];
  for (const service of services) {
    if (!service.baseline_mcp.ready) blockers.push(`${service.service}: baseline MCP initialize/tools-list is unavailable.`);
    if (!service.baseline_mcp.canonical_initialize_result) blockers.push(`${service.service}: HTTP initialize does not return the draft's canonical capabilities.experimental result.`);
    for (const profile of ['profile_a', 'profile_b', 'profile_c', 'profile_d', 'profile_e_http']) {
      if (!service.profiles[profile].available) blockers.push(`${service.service}: ${profile} canonical JSON-RPC surface is unavailable.`);
    }
    if (!service.dag.available) blockers.push(`${service.service}: Event DAG HTTP surface is unavailable.`);
  }
  if (!p2pCanonicalInitialize) blockers.push('Profile E peers do not return the draft canonical MCP InitializeResult shape.');
  if (!profileALibp2pReady) blockers.push('Profile A descriptors are not fully reachable and self-compatible over every libp2p peer.');
  if (!profileATransportParity) blockers.push('Profile A interface CIDs differ between HTTP and libp2p for at least one backend.');
  if (!profileBLibp2pReady) blockers.push('Profile B executions do not return valid CID-native artifacts over every libp2p peer.');
  if (!profileBTransportParity) blockers.push('Profile B deterministic input or envelope CIDs differ between HTTP and libp2p.');
  return blockers;
}

function runScript(name) {
  const result = spawnSync(process.execPath, [path.join(__dirname, name)], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || `${name} exited ${result.status}`);
}

function readJson(name) {
  try { return JSON.parse(fs.readFileSync(path.join(evidenceRoot, name), 'utf8')); } catch { return null; }
}

function gitReferenceRevision() {
  try { return execFileSync('git', ['-C', referenceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; }
}

function writeEvidence(evidence) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function fail(error) {
  writeEvidence({
    schema: 'swissknife.mcpplusplus_reference_conformance.v1',
    generated_at: new Date().toISOString(),
    decision: 'error',
    error,
  });
  console.error(error);
  process.exitCode = 1;
}
