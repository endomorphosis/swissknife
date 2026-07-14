#!/usr/bin/env node

/**
 * Capture SwissKnife-owned, name-by-name HTTP/libp2p interoperability proof.
 *
 * This deliberately does not consume the older connector evidence summaries:
 * the SwissKnife connector performs both discoveries and both executions in
 * this process. Counts are emitted only as indexes over the explicit tool
 * observations; they are never used as evidence that a tool is available.
 */

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outputPath = path.join(evidenceRoot, 'swissknife-all-tools-peer-evidence.json');
const announceFiles = [
  'ipfs-kit-mcp-p2p-announce.json',
  'ipfs-datasets-mcp-p2p-announce.json',
  'ipfs-accelerate-mcp-p2p-announce.json',
];
const STATUS_VALUES = ['unreachable', 'unsupported', 'denied', 'static-only', 'executed'];

main().catch(error => fail(errorMessage(error)));

async function main() {
  fs.mkdirSync(evidenceRoot, { recursive: true });

  for (const script of [
    'ensure-ipfs-mcp-compat-adapters.cjs',
    'capture-ipfs-accelerate-adapter-coverage.cjs',
  ]) {
    const result = runNodeScript(script);
    if (!result.ok) {
      fail(`Prerequisite ${script} failed: ${result.error}`);
      return;
    }
  }

  const bridgeResults = await ensureIsolatedBridges();
  console.log(JSON.stringify({ bridges: bridgeResults }, null, 2));
  if (bridgeResults.some(result => !result.ready)) {
    fail(`Unable to establish isolated libp2p bridges: ${bridgeResults
      .filter(result => !result.ready)
      .map(result => `${result.service}: ${result.error}`)
      .join('; ')}`);
    return;
  }

  let announces;
  try {
    announces = announceFiles.map(fileName => ({
      ...JSON.parse(fs.readFileSync(path.join(evidenceRoot, fileName), 'utf8')),
      announce_file: fileName,
    }));
  } catch (error) {
    fail(`Unable to read libp2p announce evidence: ${errorMessage(error)}`);
    return;
  }

  const staticCatalog = readStaticCatalog();
  const result = spawnSync(process.execPath, [
    '--import',
    'tsx',
    '--input-type=module',
    '--eval',
    swissknifeProbe(announces, staticCatalog),
  ], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const evidence = parseTrailingJson(result.stdout);
  if (result.error || result.status !== 0 || !evidence) {
    fail(result.error?.message || result.stderr || result.stdout || `SwissKnife peer probe exited ${result.status}`);
    return;
  }

  writeEvidence(evidence);
  console.log(JSON.stringify({
    decision: evidence.decision,
    service_count: evidence.summary.service_count,
    explicitly_observed_tool_count: evidence.summary.explicitly_observed_tool_count,
    disposition_counts: evidence.summary.disposition_counts,
    output: path.relative(projectRoot, outputPath),
  }, null, 2));
  if (evidence.decision !== 'go') process.exitCode = 1;
}

async function ensureIsolatedBridges() {
  const python = process.env.IPFS_ACCELERATE_PYTHON || '/home/barberb/ipfs_accelerate_py/.venv/bin/python3';
  const configs = [
    { service: 'ipfs_kit_py', endpoint: 'http://127.0.0.1:8014/mcp', announce: announceFiles[0] },
    { service: 'ipfs_datasets_py', endpoint: 'http://127.0.0.1:3002/mcp', announce: announceFiles[1] },
    { service: 'ipfs_accelerate_py', endpoint: 'http://127.0.0.1:3003/mcp', announce: announceFiles[2] },
  ];
  const results = [];
  for (const config of configs) {
    const reusable = await reusableBridge(config);
    if (reusable) {
      results.push({ service: config.service, ready: true, action: 'reused_owned_bridge', ...reusable });
      continue;
    }
    const port = await reserveLoopbackPort();
    const announcePath = path.join(evidenceRoot, config.announce);
    const pidPath = path.join(evidenceRoot, `svd-100-${config.service}-bridge.pid`);
    const logPath = path.join(evidenceRoot, `svd-100-${config.service}-bridge.log`);
    try { fs.unlinkSync(announcePath); } catch {}
    const logFd = fs.openSync(logPath, 'a');
    const child = spawn(python, [
      path.join(projectRoot, 'scripts', 'ipfs_mcp_libp2p_bridge.py'),
      '--service', config.service,
      '--endpoint', config.endpoint,
      '--port', String(port),
      '--announce-file', announcePath,
    ], {
      cwd: projectRoot,
      env: process.env,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    let spawnError = null;
    child.once('error', error => { spawnError = error; });
    child.unref();
    fs.closeSync(logFd);
    fs.writeFileSync(pidPath, `${child.pid}\n`, 'utf8');
    const ready = await waitForBridge(child.pid, port, announcePath, config.service);
    results.push({
      service: config.service,
      ready,
      action: 'started_isolated_bridge',
      pid: child.pid,
      port,
      announce_file: path.relative(projectRoot, announcePath),
      log_file: path.relative(projectRoot, logPath),
      error: ready ? null : spawnError ? errorMessage(spawnError) : tailFile(logPath),
    });
  }
  return results;
}

async function reusableBridge(config) {
  const pidPath = path.join(evidenceRoot, `svd-100-${config.service}-bridge.pid`);
  const announcePath = path.join(evidenceRoot, config.announce);
  let pid;
  let announce;
  try {
    pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
    announce = JSON.parse(fs.readFileSync(announcePath, 'utf8'));
  } catch {
    return null;
  }
  if (!ownedBridgeProcess(pid, config.service) || !validAnnounce(announce, config.service)) return null;
  const port = portFromMultiaddr(announce.multiaddr);
  if (!port || !(await portReady(port))) return null;
  return {
    pid,
    port,
    announce_file: path.relative(projectRoot, announcePath),
  };
}

function ownedBridgeProcess(pid, service) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    const command = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
    const cwd = fs.realpathSync(`/proc/${pid}/cwd`);
    return cwd === projectRoot
      && command.includes('ipfs_mcp_libp2p_bridge.py')
      && command.includes(`--service ${service}`);
  } catch {
    return false;
  }
}

async function waitForBridge(pid, port, announcePath, service) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (!ownedBridgeProcess(pid, service)) return false;
    try {
      const announce = JSON.parse(fs.readFileSync(announcePath, 'utf8'));
      if (validAnnounce(announce, service) && portFromMultiaddr(announce.multiaddr) === port
          && await portReady(port)) return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

function validAnnounce(announce, service) {
  return announce?.service === service
    && announce?.protocol === '/mcp+p2p/1.0.0'
    && announce?.canonical_initialize === true
    && announce?.profile_a_mcp_idl === true
    && announce?.profile_b_cid_envelope === true
    && announce?.profile_c_ucan === true
    && typeof announce?.peer_id === 'string'
    && typeof announce?.multiaddr === 'string';
}

function portFromMultiaddr(multiaddr) {
  const match = String(multiaddr ?? '').match(/\/tcp\/(\d+)(?:\/|$)/);
  return match ? Number(match[1]) : null;
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function portReady(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}

function tailFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).slice(-8).join(' | ');
  } catch (error) {
    return errorMessage(error);
  }
}

function runNodeScript(fileName) {
  const result = spawnSync(process.execPath, [path.join(__dirname, fileName)], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
    timeout: 180000,
  });
  return {
    ok: !result.error && result.status === 0,
    error: result.error?.message || `exit status ${result.status}`,
  };
}

function readStaticCatalog() {
  const serviceRoot = path.join(projectRoot, 'src', 'services', 'ipfs');
  const byService = {
    ipfs_kit_py: [],
    ipfs_datasets_py: [],
    ipfs_accelerate_py: [],
  };
  const kit = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'mcp-ipfs-kit-tools-manifest.json'), 'utf8'));
  byService.ipfs_kit_py = uniqueSorted((kit.tools ?? []).map(tool => tool?.name));
  byService.ipfs_datasets_py = descriptorToolNames(
    path.join(serviceRoot, 'mcp-ipfs-datasets-descriptor-pack.ts'),
  );
  byService.ipfs_accelerate_py = descriptorToolNames(
    path.join(serviceRoot, 'mcp-ipfs-accelerate-descriptor-pack.ts'),
  );
  return byService;
}

function descriptorToolNames(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return uniqueSorted(Array.from(source.matchAll(/tool_function:\s*'([^']+)'/g), match => match[1]));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.length > 0))].sort();
}

function swissknifeProbe(announces, staticCatalog) {
  return `
import * as ucans from '@ucans/ucans';
import { createHash } from 'node:crypto';
import {
  createMultiServerConnector,
  IPFS_KIT_SERVER,
  IPFS_DATASETS_SERVER,
  IPFS_ACCELERATE_SERVER,
} from './src/services/mcp/mcp-plus-plus-connector.ts';

const announces = ${JSON.stringify(announces)};
const staticCatalog = ${JSON.stringify(staticCatalog)};
const statusValues = ${JSON.stringify(STATUS_VALUES)};
const protocol = '/mcp+p2p/1.0.0';
const serviceConfigs = [
  { service: 'ipfs_kit_py', server: IPFS_KIT_SERVER.name, fixture: { tool: 'files_stat', arguments: {}, approval: 'non-mutating status fixture' } },
  { service: 'ipfs_datasets_py', server: IPFS_DATASETS_SERVER.name, fixture: { tool: 'list_indices', arguments: {}, approval: 'non-mutating catalog fixture' } },
  { service: 'ipfs_accelerate_py', server: IPFS_ACCELERATE_SERVER.name, fixture: { tool: 'get_server_status', arguments: {}, approval: 'non-mutating health fixture' } },
];
const announceByService = new Map(announces.map(announce => [announce.service, announce]));
const multiaddrs = Object.fromEntries(serviceConfigs.map(config => [
  config.server,
  announceByService.get(config.service)?.multiaddr,
]));
const agentKey = await ucans.EdKeypair.create({ exportable: true });
const agentDid = agentKey.did();

const http = await captureTransport('http');
const libp2p = await captureTransport('libp2p');
const services = serviceConfigs.map(config => reconcileService(
  config,
  http.get(config.service),
  libp2p.get(config.service),
  announceByService.get(config.service),
));
const tools = services.flatMap(service => service.tools.map(tool => ({ service: service.service, ...tool })));
const blockers = services.flatMap(service => service.gates
  .filter(gate => !gate.passed)
  .map(gate => ({ service: service.service, gate: gate.id, reason: gate.reason })));
const dispositionCounts = Object.fromEntries(statusValues.map(status => [
  status,
  tools.filter(tool => tool.disposition === status).length,
]));
const passed = blockers.length === 0
  && services.length === serviceConfigs.length
  && services.every(service => service.fixture.transport_results.http.status === 'executed'
    && service.fixture.transport_results.libp2p.status === 'executed');

console.log(JSON.stringify({
  schema: 'swissknife.all_tools_peer_interoperability_evidence.v1',
  generated_at: new Date().toISOString(),
  task_id: 'SVD-100',
  decision: passed ? 'go' : 'no_go',
  scope: 'SwissKnife MCP++ client discovery and approved fixture execution over independent HTTP and libp2p sessions',
  client: {
    implementation: 'src/services/mcp/mcp-plus-plus-connector.ts',
    ucan_audience_did: agentDid,
  },
  availability_evidence_policy: {
    rule: 'Availability is established only by an explicit name-level discovery observation and, for approved fixtures, a successful invocation. Aggregate counts are never availability evidence.',
    count_only_inference_forbidden: true,
    candidate_set: 'union of HTTP names, libp2p names, retrieved descriptor method names, and SwissKnife static descriptor names',
    dispositions: {
      unreachable: 'The selected transport session was not established; no fallback call was attempted.',
      unsupported: 'The peer was reachable but the exact name was absent from discovery or its retrieved negotiated descriptor.',
      denied: 'The exact tool was discovered and described but was not in the narrowly approved non-mutating fixture allowlist, so invocation was not attempted.',
      'static-only': 'The exact name exists only in a SwissKnife static descriptor and was not advertised by either remote peer transport.',
      executed: 'The exact approved fixture was discovered, described, invoked successfully, CID-retrieved, and visible in the event DAG.',
    },
  },
  summary: {
    service_count: services.length,
    explicitly_observed_tool_count: tools.length,
    approved_fixture_count: serviceConfigs.length,
    executed_transport_fixture_count: services.reduce((sum, service) => sum
      + Object.values(service.fixture.transport_results).filter(result => result.status === 'executed').length, 0),
    disposition_counts: dispositionCounts,
    blocker_count: blockers.length,
    counts_are_indexes_only: true,
  },
  blockers,
  services,
  tools,
}));

async function captureTransport(transport) {
  const connector = createMultiServerConnector(agentDid, transport === 'libp2p' ? { libp2p: multiaddrs } : {});
  const connections = await connector.connectAll();
  const rows = new Map();
  for (const config of serviceConfigs) {
    const connection = connections.get(config.server);
    const serviceConnector = connector.getConnector(config.server);
    rows.set(config.service, await observeServiceTransport(
      transport,
      config,
      connection,
      serviceConnector,
      announceByService.get(config.service),
    ));
  }
  await Promise.allSettled(serviceConfigs.map(config => connector.getConnector(config.server)?.disconnect()));
  return rows;
}

async function observeServiceTransport(transport, config, connection, connector, announce) {
  const connected = connection?.success === true && connector?.transportKind === transport;
  const discoveredNames = unique(connection?.tools ?? []);
  const profiles = unique(connection?.profiles ?? []);
  const normalizedProfiles = normalizeProfiles(profiles);
  const observation = {
    transport,
    endpoint: transport === 'libp2p' ? announce?.multiaddr ?? null : connector?.endpoint ?? null,
    connected,
    selected_transport: connector?.transportKind ?? null,
    no_transport_fallback: connected && connector?.transportKind === transport,
    negotiated_profiles: profiles,
    normalized_negotiated_profiles: normalizedProfiles,
    discovered_tool_names: discoveredNames,
    duplicate_discovery_names: duplicateValues(connection?.tools ?? []),
    descriptor: emptyDescriptorObservation(),
    identity: emptyIdentityObservation(),
    fixture: emptyFixtureObservation(config.fixture, connected ? 'not_attempted' : 'unreachable'),
    error: connected ? null : 'The requested ' + transport + ' session was not established.',
  };
  if (!connected || !connector) return observation;

  try {
    const interfaces = await connector.listInterfaces();
    const retrieved = await Promise.all(interfaces.map(item => connector.getInterface(item.interface_cid)));
    const descriptors = retrieved.filter(Boolean);
    const descriptorNames = unique(descriptors.flatMap(descriptor => descriptor.methods.map(method => method.name)));
    const compatibility = await Promise.all(descriptors.map(descriptor =>
      connector.checkInterfaceCompatibility(descriptor.interface_cid)));
    observation.descriptor = {
      advertised: normalizedProfiles.includes('idl'),
      listed_cids: unique(interfaces.map(item => item.interface_cid)),
      retrieved_cids: unique(descriptors.map(item => item.interface_cid)),
      cid_retrieval_complete: interfaces.length > 0
        && descriptors.length === interfaces.length
        && interfaces.every(item => descriptors.some(descriptor => descriptor.interface_cid === item.interface_cid)),
      compatible: compatibility.length > 0 && compatibility.every(result => result.compatible === true),
      method_names: descriptorNames,
      covers_each_discovered_name: discoveredNames.every(name => descriptorNames.includes(name)),
      exact_name_set_match: sameNames(discoveredNames, descriptorNames),
    };
    const identity = connector.verifiedPeerIdentity;
    observation.identity = {
      profile_advertised: normalizedProfiles.includes('ucan'),
      verified: identity?.valid === true,
      remote_did: identity?.did ?? null,
      identity_proof_cid: identity?.proofCid ?? null,
      peer_id: identity?.peerId ?? null,
      multiaddr: identity?.multiaddr ?? null,
      peer_id_matches_announce: transport === 'http' ? null : identity?.peerId === announce?.peer_id,
      multiaddr_matches_announce: transport === 'http' ? null : identity?.multiaddr === announce?.multiaddr,
    };
    observation.fixture = await executeApprovedFixture(connector, config, observation);
  } catch (error) {
    observation.error = error instanceof Error ? error.message : String(error);
    if (observation.fixture.status === 'not_attempted') {
      observation.fixture.status = isDeniedError(observation.error) ? 'denied' : 'unsupported';
      observation.fixture.error = observation.error;
    }
  }
  return observation;
}

async function executeApprovedFixture(connector, config, observation) {
  const fixture = emptyFixtureObservation(config.fixture, 'not_attempted');
  if (!observation.discovered_tool_names.includes(config.fixture.tool)
      || !observation.descriptor.method_names.includes(config.fixture.tool)) {
    fixture.status = 'unsupported';
    fixture.error = 'Approved fixture was not explicitly discovered and descriptor-backed on this transport.';
    return fixture;
  }
  try {
    const capability = {
      resource: 'mcp++://' + config.service + '/tool/' + config.fixture.tool,
      ability: 'mcp++/invoke',
    };
    const delegation = await connector.createDelegation(agentDid, [capability], 1);
    const delegationValidation = await connector.validateDelegation(delegation.proofCid, {
      ucan: delegation.ucan,
      requiredCapability: capability,
    });
    fixture.delegation = {
      proof_cid: delegation.proofCid || null,
      valid: delegationValidation.valid === true,
      validation_chain_length: delegationValidation.chain?.length ?? 0,
    };
    const plainResult = await connector.callTool(config.fixture.tool, config.fixture.arguments);
    fixture.plain_call = {
      returned: plainResult !== undefined,
      outcome: resultOutcome(plainResult),
      semantic_fingerprint: semanticFingerprint(plainResult),
      result_contract_fingerprint: resultContractFingerprint(plainResult),
    };
    const descriptorCid = observation.descriptor.retrieved_cids[0];
    const execution = await connector.callToolWithEnvelope(config.fixture.tool, config.fixture.arguments, {
      interfaceCid: descriptorCid,
      proofCid: delegation.proofCid,
      ucan: delegation.ucan,
      ucanAudience: agentDid,
      parents: [],
      timestamp: '2026-07-13T00:00:00.000Z',
      correlationId: 'svd-100-' + config.service,
    });
    const envelope = execution.envelope ?? {};
    const cidEntries = uniqueCidEntries({
      input: envelope.input_cid,
      intent: envelope.intent_cid,
      envelope: envelope.envelope_cid,
      output: envelope.output_cid,
      receipt: envelope.receipt?.receipt_cid,
      event: envelope.event_cid,
    });
    const reads = [];
    for (const entry of cidEntries) {
      const read = await connector.getArtifact(entry.cid);
      reads.push({
        kind: entry.kind,
        cid: entry.cid,
        found: read?.found === true,
        verified: read?.verified === true,
        returned_cid_matches: read?.cid === entry.cid,
        backend: read?.backend ?? null,
      });
    }
    const history = await connector.getDAGHistory(200);
    const provenance = typeof envelope.event_cid === 'string'
      ? await connector.traceProvenance(envelope.event_cid)
      : [];
    fixture.envelope = {
      interface_cid: envelope.interface_cid ?? descriptorCid ?? null,
      envelope_cid: envelope.envelope_cid ?? null,
      input_cid: envelope.input_cid ?? null,
      intent_cid: envelope.intent_cid ?? null,
      output_cid: envelope.output_cid ?? null,
      receipt_cid: envelope.receipt?.receipt_cid ?? null,
      event_cid: envelope.event_cid ?? null,
      receipt_success: envelope.receipt?.success === true,
      artifact_persistence_complete: envelope.artifact_persistence?.complete === true,
      result_outcome: resultOutcome(execution.result),
      result_semantic_fingerprint: semanticFingerprint(execution.result),
      result_contract_fingerprint: resultContractFingerprint(execution.result),
    };
    fixture.cid_retrieval = {
      expected_cid_count: cidEntries.length,
      all_expected_cids_present: cidEntries.length === 6,
      all_found_verified: cidEntries.length === 6 && reads.every(read =>
        read.found && read.verified && read.returned_cid_matches),
      artifacts: reads,
    };
    fixture.event_dag = {
      profile_advertised: observation.normalized_negotiated_profiles.includes('event-dag'),
      history_observed: Array.isArray(history),
      execution_event_present: typeof envelope.event_cid === 'string'
        && history.some(event => eventCid(event) === envelope.event_cid),
      provenance_visible: typeof envelope.event_cid === 'string'
        && provenance.some(event => eventCid(event) === envelope.event_cid),
      event_cid: envelope.event_cid ?? null,
    };
    const executed = observation.normalized_negotiated_profiles.includes('cid-envelope')
      && observation.normalized_negotiated_profiles.includes('ucan')
      && observation.normalized_negotiated_profiles.includes('event-dag')
      && fixture.delegation.valid
      && fixture.plain_call.returned
      && fixture.envelope.receipt_success
      && fixture.envelope.artifact_persistence_complete
      && fixture.cid_retrieval.all_found_verified
      && fixture.event_dag.execution_event_present
      && fixture.event_dag.provenance_visible;
    fixture.status = executed ? 'executed' : 'unsupported';
    if (!executed) fixture.error = 'Approved fixture did not satisfy every execution, CID, and event-DAG observation.';
  } catch (error) {
    fixture.error = error instanceof Error ? error.message : String(error);
    fixture.status = isDeniedError(fixture.error) ? 'denied' : 'unsupported';
  }
  return fixture;
}

function reconcileService(config, http, libp2p, announce) {
  const staticNames = unique(staticCatalog[config.service] ?? []);
  const candidates = unique([
    ...staticNames,
    ...(http?.discovered_tool_names ?? []),
    ...(libp2p?.discovered_tool_names ?? []),
    ...(http?.descriptor?.method_names ?? []),
    ...(libp2p?.descriptor?.method_names ?? []),
  ]);
  const tools = candidates.map(name => reconcileTool(name, config.fixture.tool, staticNames, http, libp2p));
  const parity = {
    protocol_matches: announce?.protocol === protocol,
    explicit_discovery_name_set_match: sameNames(http.discovered_tool_names, libp2p.discovered_tool_names),
    normalized_profile_set_match: sameNames(http.normalized_negotiated_profiles, libp2p.normalized_negotiated_profiles),
    descriptor_cid_set_match: sameNames(http.descriptor.retrieved_cids, libp2p.descriptor.retrieved_cids),
    descriptor_method_name_set_match: sameNames(http.descriptor.method_names, libp2p.descriptor.method_names),
    remote_ucan_did_match: typeof http.identity.remote_did === 'string'
      && http.identity.remote_did === libp2p.identity.remote_did,
    fixture_tool_and_arguments_match: http.fixture.tool === libp2p.fixture.tool
      && stableStringify(http.fixture.arguments) === stableStringify(libp2p.fixture.arguments),
    fixture_outcome_match: http.fixture.plain_call.outcome === libp2p.fixture.plain_call.outcome
      && http.fixture.envelope.result_outcome === libp2p.fixture.envelope.result_outcome,
    fixture_result_contract_match: http.fixture.plain_call.result_contract_fingerprint === libp2p.fixture.plain_call.result_contract_fingerprint
      && http.fixture.envelope.result_contract_fingerprint === libp2p.fixture.envelope.result_contract_fingerprint,
    receipt_success_match: http.fixture.envelope.receipt_success === true
      && libp2p.fixture.envelope.receipt_success === true,
    cid_retrieval_match: http.fixture.cid_retrieval.all_found_verified === true
      && libp2p.fixture.cid_retrieval.all_found_verified === true,
    event_visibility_match: http.fixture.event_dag.execution_event_present === true
      && libp2p.fixture.event_dag.execution_event_present === true,
  };
  parity.non_gating_exact_result_observation = {
    matches: http.fixture.plain_call.semantic_fingerprint === libp2p.fixture.plain_call.semantic_fingerprint
      && http.fixture.envelope.result_semantic_fingerprint === libp2p.fixture.envelope.result_semantic_fingerprint,
    required: false,
    rationale: 'Live status payload values may change between sequential transports; outcome and response-contract parity are release gates.',
  };
  parity.passed = [
    parity.protocol_matches,
    parity.explicit_discovery_name_set_match,
    parity.normalized_profile_set_match,
    parity.descriptor_cid_set_match,
    parity.descriptor_method_name_set_match,
    parity.remote_ucan_did_match,
    parity.fixture_tool_and_arguments_match,
    parity.fixture_outcome_match,
    parity.fixture_result_contract_match,
    parity.receipt_success_match,
    parity.cid_retrieval_match,
    parity.event_visibility_match,
  ].every(value => value === true);
  const gates = [
    gate('http_connected', http.connected && http.no_transport_fallback, 'HTTP connector did not establish the selected transport.'),
    gate('libp2p_connected', libp2p.connected && libp2p.no_transport_fallback, 'libp2p connector did not establish the selected transport.'),
    gate('profiles_negotiated', requiredProfiles('http').every(profile => http.normalized_negotiated_profiles.includes(profile))
      && requiredProfiles('libp2p').every(profile => libp2p.normalized_negotiated_profiles.includes(profile)), 'Required MCP++ profiles were not negotiated.'),
    gate('remote_ucan_identity', http.identity.verified && libp2p.identity.verified
      && parity.remote_ucan_did_match, 'Remote UCAN DID identity was not verified on both transports.'),
    gate('libp2p_announce_identity', libp2p.identity.peer_id_matches_announce === true
      && libp2p.identity.multiaddr_matches_announce === true, 'Verified libp2p identity does not match the peer announce.'),
    gate('descriptor_cid_retrieval', http.descriptor.cid_retrieval_complete
      && libp2p.descriptor.cid_retrieval_complete
      && http.descriptor.compatible && libp2p.descriptor.compatible, 'Negotiated descriptors were not retrievable and compatible by CID.'),
    gate('explicit_all_tool_discovery', candidates.length > 0
      && http.descriptor.exact_name_set_match && libp2p.descriptor.exact_name_set_match
      && parity.explicit_discovery_name_set_match, 'Exact per-tool discovery observations do not match the retrieved descriptors and transports.'),
    gate('approved_fixture_executed', http.fixture.status === 'executed'
      && libp2p.fixture.status === 'executed', 'Approved fixture was not executed successfully on both transports.'),
    gate('cid_retrieval', parity.cid_retrieval_match, 'Execution artifacts were not retrievable and verified by CID on both transports.'),
    gate('event_dag_visibility', parity.event_visibility_match
      && http.fixture.event_dag.provenance_visible && libp2p.fixture.event_dag.provenance_visible, 'Execution event was not visible in event-DAG history and provenance.'),
    gate('transport_parity', parity.passed, 'HTTP/libp2p explicit discovery, identity, descriptor, and execution observations differ.'),
  ];
  return {
    service: config.service,
    server: config.server,
    approved_fixture: config.fixture,
    announce: {
      file: announce?.announce_file ?? null,
      protocol: announce?.protocol ?? null,
      peer_id: announce?.peer_id ?? null,
      multiaddr: announce?.multiaddr ?? null,
    },
    transports: { http, libp2p },
    fixture: {
      tool: config.fixture.tool,
      arguments: config.fixture.arguments,
      approval: config.fixture.approval,
      transport_results: { http: http.fixture, libp2p: libp2p.fixture },
    },
    parity,
    gates,
    decision: gates.every(item => item.passed) ? 'go' : 'no_go',
    tools,
  };
}

function reconcileTool(name, fixtureName, staticNames, http, libp2p) {
  const isStatic = staticNames.includes(name);
  const httpObservation = toolTransportObservation(name, fixtureName, http);
  const libp2pObservation = toolTransportObservation(name, fixtureName, libp2p);
  let disposition;
  let reason;
  if (!http.connected || !libp2p.connected) {
    disposition = 'unreachable';
    reason = 'At least one required transport was unreachable; no availability was inferred from the other transport.';
  } else if (name === fixtureName && httpObservation.status === 'executed'
      && libp2pObservation.status === 'executed') {
    disposition = 'executed';
    reason = 'Approved non-mutating fixture was explicitly discovered, descriptor-backed, and executed on both transports.';
  } else if (!httpObservation.discovered && !libp2pObservation.discovered && isStatic) {
    disposition = 'static-only';
    reason = 'Name exists in a SwissKnife static descriptor but neither peer advertised it.';
  } else if (!httpObservation.discovered || !libp2pObservation.discovered
      || !httpObservation.descriptor_method || !libp2pObservation.descriptor_method) {
    disposition = 'unsupported';
    reason = 'Reachable peers did not both advertise and describe this exact tool name.';
  } else {
    disposition = 'denied';
    reason = 'Tool is not in the SVD-100 approved non-mutating fixture allowlist; invocation was intentionally not attempted.';
  }
  return {
    name,
    disposition,
    disposition_reason: reason,
    approved_fixture: name === fixtureName,
    static_descriptor_present: isStatic,
    availability_inferred_from_count: false,
    observations: { http: httpObservation, libp2p: libp2pObservation },
  };
}

function toolTransportObservation(name, fixtureName, transport) {
  const discovered = transport.discovered_tool_names.includes(name);
  const descriptorMethod = transport.descriptor.method_names.includes(name);
  let status;
  if (!transport.connected) status = 'unreachable';
  else if (!discovered || !descriptorMethod) status = 'unsupported';
  else if (name === fixtureName) status = transport.fixture.status;
  else status = 'denied';
  return {
    status,
    connected: transport.connected,
    discovered,
    descriptor_method: descriptorMethod,
    invocation_attempted: name === fixtureName && transport.fixture.status !== 'not_attempted'
      && transport.fixture.status !== 'unreachable',
    invocation_succeeded: name === fixtureName && transport.fixture.status === 'executed',
  };
}

function requiredProfiles(transport) {
  return transport === 'libp2p'
    ? ['idl', 'cid-envelope', 'ucan', 'event-dag', 'p2p-transport']
    : ['idl', 'cid-envelope', 'ucan', 'event-dag'];
}

function normalizeProfiles(profiles) {
  return unique(profiles.map(profile => {
    if (profile === 'mcp++/mcp-idl' || profile === 'mcp++/idl') return 'idl';
    const value = String(profile);
    return value.startsWith('mcp++/') ? value.slice('mcp++/'.length) : value;
  }));
}

function emptyDescriptorObservation() {
  return {
    advertised: false,
    listed_cids: [],
    retrieved_cids: [],
    cid_retrieval_complete: false,
    compatible: false,
    method_names: [],
    covers_each_discovered_name: false,
    exact_name_set_match: false,
  };
}

function emptyIdentityObservation() {
  return {
    profile_advertised: false,
    verified: false,
    remote_did: null,
    identity_proof_cid: null,
    peer_id: null,
    multiaddr: null,
    peer_id_matches_announce: null,
    multiaddr_matches_announce: null,
  };
}

function emptyFixtureObservation(fixture, status) {
  return {
    tool: fixture.tool,
    arguments: fixture.arguments,
    approval: fixture.approval,
    status,
    delegation: { proof_cid: null, valid: false, validation_chain_length: 0 },
    plain_call: { returned: false, outcome: null, semantic_fingerprint: null, result_contract_fingerprint: null },
    envelope: {
      interface_cid: null,
      envelope_cid: null,
      input_cid: null,
      intent_cid: null,
      output_cid: null,
      receipt_cid: null,
      event_cid: null,
      receipt_success: false,
      artifact_persistence_complete: false,
      result_outcome: null,
      result_semantic_fingerprint: null,
      result_contract_fingerprint: null,
    },
    cid_retrieval: {
      expected_cid_count: 0,
      all_expected_cids_present: false,
      all_found_verified: false,
      artifacts: [],
    },
    event_dag: {
      profile_advertised: false,
      history_observed: false,
      execution_event_present: false,
      provenance_visible: false,
      event_cid: null,
    },
    error: null,
  };
}

function uniqueCidEntries(entries) {
  const seen = new Set();
  return Object.entries(entries)
    .filter(([, cid]) => typeof cid === 'string' && cid.length > 0)
    .filter(([, cid]) => seen.has(cid) ? false : (seen.add(cid), true))
    .map(([kind, cid]) => ({ kind, cid }));
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value).sort();
}

function unique(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.length > 0))].sort();
}

function sameNames(left, right) {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function eventCid(event) {
  if (typeof event === 'string') return event;
  return event?.event_cid ?? event?.cid ?? null;
}

function resultOutcome(value) {
  if (value && typeof value === 'object') {
    if (value.isError === true || value.error) return 'error';
    if (value.receipt?.success === false) return 'error';
  }
  return 'success';
}

function semanticFingerprint(value) {
  return 'sha256:' + createHash('sha256').update(stableStringify(normalizeDynamic(value))).digest('hex');
}

function resultContractFingerprint(value) {
  return 'sha256:' + createHash('sha256').update(stableStringify(resultContract(value))).digest('hex');
}

function resultContract(value) {
  if (Array.isArray(value)) return { type: 'array', items: unique(value.map(item => stableStringify(resultContract(item)))) };
  if (value === null) return { type: 'null' };
  if (!value || typeof value !== 'object') return { type: typeof value };
  return {
    type: 'object',
    properties: Object.fromEntries(Object.keys(value).sort().map(key => [key, resultContract(value[key])])),
  };
}

function normalizeDynamic(value) {
  if (Array.isArray(value)) return value.map(normalizeDynamic);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(timestamp|generated_at|created_at|updated_at|request_id|correlation_id|duration_ms|latency_ms)$/i.test(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, normalizeDynamic(child)]));
}

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function isDeniedError(message) {
  return /denied|forbidden|unauthori[sz]ed|policy|permission|ucan/i.test(String(message));
}

function gate(id, passed, reason) {
  return { id, passed: passed === true, reason: passed === true ? null : reason };
}
`;
}

function writeEvidence(evidence) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

function fail(error) {
  const dispositionCounts = Object.fromEntries(STATUS_VALUES.map(status => [status, 0]));
  writeEvidence({
    schema: 'swissknife.all_tools_peer_interoperability_evidence.v1',
    generated_at: new Date().toISOString(),
    task_id: 'SVD-100',
    decision: 'no_go',
    availability_evidence_policy: {
      rule: 'Availability requires explicit name-level discovery and approved fixture invocation evidence.',
      count_only_inference_forbidden: true,
      dispositions: STATUS_VALUES,
    },
    summary: {
      service_count: 0,
      explicitly_observed_tool_count: 0,
      approved_fixture_count: 3,
      executed_transport_fixture_count: 0,
      disposition_counts: dispositionCounts,
      blocker_count: 1,
      counts_are_indexes_only: true,
    },
    blockers: [{ service: null, gate: 'capture', reason: String(error) }],
    services: [],
    tools: [],
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
