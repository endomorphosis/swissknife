#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outputPaths = {
  json: path.join(evidenceRoot, 'release-evidence.json'),
  markdown: path.join(evidenceRoot, 'all-tools-release-evidence.md'),
  signoff: path.join(projectRoot, 'docs', 'refactor-final-signoff.md'),
  discovery: path.join(workspaceRoot, 'data', 'swissknife_virtual_desktop', 'discovery', 'all-tools-no-new-unknowns.md'),
};
const REQUIRED_SERVICES = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'];
const REQUIRED_PROFILES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const REQUIRED_TRANSPORTS = ['http', 'libp2p'];
const REQUIRED_MODALITIES = ['display', 'camera', 'microphone', 'speaker', 'input'];
const REQUIRED_REPLAY_SCENARIOS = ['primary', 'permission_denied', 'route_unavailable'];
const EXPECTED_SUPERVISOR_CAPABILITIES = [
  'supervisor.goals.read',
  'supervisor.health.read',
  'supervisor.logs.read',
  'supervisor.prompt-steering.request',
  'supervisor.queue.read',
  'supervisor.receipts.read',
  'supervisor.run-history.search',
  'supervisor.subgoals.read',
  'supervisor.task-control.request',
  'supervisor.taskboard.links.read',
];
const ALLOWED_TOOL_DISPOSITIONS = new Set([
  'unreachable', 'unsupported', 'denied', 'static-only', 'executed',
]);

const evidenceDefinitions = [
  {
    id: 'service_profile_matrix',
    file: 'all-profile-service-matrix.json',
    taskId: 'SVD-093',
    schema: 'swissknife.all_profile_service_matrix.v1',
    sourcePaths: ['scripts/capture-all-profile-service-matrix.cjs'],
    validate: validateProfileMatrix,
  },
  {
    id: 'app_backend_behavior',
    file: 'all-app-live-backend-behavior.json',
    taskId: 'SVD-096',
    schema: 'swissknife.all-app-live-backend-behavior.v1',
    screenshotRoot: 'test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/live-backend',
    sourcePaths: [
      'test/e2e/all-app-live-backend-behavior.spec.ts',
      'src/services/apps/virtual-desktop-app-manifest.ts',
      'test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json',
    ],
    validate: validateAppBehavior,
  },
  {
    id: 'supervisor_console',
    file: 'agent-supervisor-all-app-validation.json',
    taskId: 'SVD-097',
    schema: 'swissknife.agent-supervisor-all-app-validation.v1',
    screenshotRoot: 'test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/agent-supervisor',
    sourcePaths: [
      'test/e2e/agent-supervisor-all-app-validation.spec.ts',
      'src/services/mcp/agent-supervisor-console-gateway.ts',
      'web/js/apps/agent-supervisor.js',
    ],
    validate: validateSupervisor,
  },
  {
    id: 'orb_idl_packets',
    file: 'all-app-live-orb-idl-handoff.json',
    taskId: 'SVD-098',
    schema: 'swissknife.all-app-live-orb-idl-handoff.v1',
    sourcePaths: [
      'test/mcp-plus-plus/all-app-live-orb-idl-handoff.test.ts',
      'src/services/glasses/all-app-live-orb-idl-handoff.ts',
      'src/services/glasses/desktop-orb-idl-contract.ts',
      'test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json',
    ],
    validate: validateOrbIdl,
  },
  {
    id: 'meta_device_simulator',
    file: 'all-app-meta-device-simulator.json',
    taskId: 'SVD-099',
    schema: 'swissknife.all-app-meta-device-simulator.v1',
    screenshotRoot: 'test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator',
    sourcePaths: [
      'test/e2e/all-app-meta-device-simulator.spec.ts',
      'src/services/glasses/all-app-live-orb-idl-handoff.ts',
      'test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-orb-idl-handoff.json',
    ],
    validate: validateMetaSimulator,
  },
  {
    id: 'peer_interoperability',
    file: 'swissknife-all-tools-peer-evidence.json',
    taskId: 'SVD-100',
    schema: 'swissknife.all_tools_peer_interoperability_evidence.v1',
    sourcePaths: [
      'scripts/capture-swissknife-all-tools-peer-evidence.cjs',
      'src/services/mcp/mcp-plus-plus-connector.ts',
    ],
    validate: validatePeerEvidence,
  },
];

main();

function main() {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const generatedAt = new Date().toISOString();
  const sourceRevision = gitRevision();
  const records = evidenceDefinitions.map(loadEvidence);
  const gaps = records.flatMap(record => record.gaps);
  const phaseFourCloseout = buildPhaseFourCloseout(records);
  gaps.push(...phaseFourCloseout.gaps);
  const dispositions = collectDispositions(records);

  for (const disposition of dispositions.rejected) {
    gaps.push(gap(
      disposition.task_id || 'SVD-101',
      'unapproved_non_release_disposition',
      disposition.scope || disposition.id || 'unknown',
      disposition.rejection_reason,
      disposition.source_path,
    ));
  }

  const blockerGaps = dedupeGaps(gaps.filter(item => !isClosedByDisposition(item, dispositions.approved)));
  const decision = blockerGaps.length === 0 ? 'GO' : 'NO_GO';
  const unknownTaskClassGaps = blockerGaps.filter(item => !/^SVD-\d+$/.test(item.task_id ?? ''));
  const artifactMap = Object.fromEntries(records.map(record => [record.id, artifactSummary(record)]));
  const appBehavior = records.find(record => record.id === 'app_backend_behavior');
  const supervisor = records.find(record => record.id === 'supervisor_console');
  const orb = records.find(record => record.id === 'orb_idl_packets');
  const meta = records.find(record => record.id === 'meta_device_simulator');
  const peer = records.find(record => record.id === 'peer_interoperability');
  const profile = records.find(record => record.id === 'service_profile_matrix');

  const appMatrix = buildAppMatrix(appBehavior, orb, meta);
  const serviceMatrix = buildServiceMatrix(profile, peer, dispositions.approved);
  const toolMatrix = buildToolMatrix(peer, dispositions.approved);
  const modalityMatrix = buildModalityMatrix(meta, dispositions.approved);
  const screenshotEvidence = buildScreenshotEvidence(records);
  const provenanceEvidence = buildProvenanceEvidence(records);

  const report = {
    schema: 'swissknife.virtual-desktop-release-evidence.v2',
    task_id: 'SVD-101',
    generated_at: generatedAt,
    source_revision: sourceRevision,
    release_scope: 'SwissKnife virtual desktop, all backend tools, Supervisor Console, ORB/IDL, and Meta simulator',
    freshness_policy: {
      kind: 'content-addressed-current-checkout',
      statement: 'The aggregate fingerprints every present input and its current source dependencies. Deterministic evidence timestamps are not treated as wall-clock expiry.',
      audit_group: 'virtual-desktop-release-evidence',
      missing_inputs_are_explicit_no_go_gaps: true,
      generated_output_is_not_behavior_proof: true,
    },
    release_policy: {
      go_rule: 'Every required app, tool, service/profile/transport cell, Supervisor path, ORB/IDL packet, simulator modality, and SVD-047 phase-four closeout gate needs a current passing proof or an approved non-release disposition.',
      counts_do_not_prove_availability: true,
      missing_or_failed_proof_defaults_to_no_go: true,
      required_services: REQUIRED_SERVICES,
      required_profiles: REQUIRED_PROFILES,
      required_transports: REQUIRED_TRANSPORTS,
      required_modalities: REQUIRED_MODALITIES,
      required_replay_scenarios: REQUIRED_REPLAY_SCENARIOS,
    },
    artifacts: artifactMap,
    phase_four_closeout: phaseFourCloseout.summary,
    unknown_task_class_audit: {
      status: unknownTaskClassGaps.length === 0 ? 'no_new_unknowns' : 'unknown_task_classes_present',
      unknown_task_class_count: unknownTaskClassGaps.length,
      unknown_task_class_gaps: unknownTaskClassGaps,
      statement: unknownTaskClassGaps.length === 0
        ? 'Every open release gap is assigned to an existing SVD task class; no new unknown task class was introduced.'
        : 'One or more release gaps are not assigned to an existing SVD task class.',
    },
    app_behavior_matrix: appMatrix,
    service_profile_transport_matrix: serviceMatrix,
    tool_behavior_matrix: toolMatrix,
    supervisor_console: summarizeSupervisor(supervisor),
    orb_idl_packets: summarizeOrb(orb),
    meta_simulator_modalities: modalityMatrix,
    screenshot_evidence: screenshotEvidence,
    receipt_event_dag_evidence: provenanceEvidence,
    unavailable_and_blocked_cases: buildUnavailableCases(records, blockerGaps),
    non_release_dispositions: dispositions,
    named_gaps: blockerGaps,
    decision: {
      status: decision,
      blocker_count: blockerGaps.length,
      blocker_task_ids: unique(blockerGaps.map(item => item.task_id)),
      approved_non_release_disposition_count: dispositions.approved.length,
      rejected_non_release_disposition_count: dispositions.rejected.length,
    },
    // Compatibility projections consumed by the older release-readiness renderer.
    go_no_go: compatibilityDecision(decision, blockerGaps),
    hierarchical_mcp: compatibilityHierarchical(serviceMatrix, peer),
    virtual_desktop_app_matrix_gate: compatibilityAppMatrix(appMatrix, modalityMatrix, blockerGaps),
    swr110_release_gate: compatibilityCompleteGate(decision, records, blockerGaps),
  };

  atomicWriteJson(outputPaths.json, report);
  atomicWrite(outputPaths.markdown, renderMarkdown(report));
  atomicWrite(outputPaths.signoff, renderSignoff(report));
  atomicWrite(outputPaths.discovery, renderNoNewUnknowns(report));
  certifyAggregateFreshness();

  console.log(JSON.stringify({
    schema: report.schema,
    task_id: report.task_id,
    decision,
    blocker_count: blockerGaps.length,
    blocker_task_ids: report.decision.blocker_task_ids,
    outputs: Object.values(outputPaths).map(relative),
  }, null, 2));
}

function loadEvidence(definition) {
  const absolutePath = path.join(evidenceRoot, definition.file);
  const record = {
    ...definition,
    path: relative(absolutePath),
    status: 'missing',
    data: null,
    sha256: null,
    generated_at: null,
    source_fingerprint: fingerprintPaths(definition.sourcePaths),
    checks: [],
    gaps: [],
    screenshots: [],
  };
  if (!fs.existsSync(absolutePath)) {
    record.gaps.push(gap(definition.taskId, 'missing_evidence', definition.id,
      `Required current evidence is missing: ${record.path}.`, record.path));
    if (definition.screenshotRoot && !fs.existsSync(path.join(projectRoot, definition.screenshotRoot))) {
      record.gaps.push(gap(definition.taskId, 'missing_screenshot_root', definition.id,
        `Required screenshot evidence directory is missing: ${definition.screenshotRoot}.`, definition.screenshotRoot));
    }
    return record;
  }
  try {
    const bytes = fs.readFileSync(absolutePath);
    record.sha256 = sha256(bytes);
    record.data = JSON.parse(bytes.toString('utf8'));
    record.generated_at = record.data.generated_at ?? null;
    record.status = 'present';
  } catch (error) {
    record.status = 'invalid';
    record.gaps.push(gap(definition.taskId, 'invalid_evidence', definition.id,
      `Evidence is not valid JSON: ${errorMessage(error)}.`, record.path));
    return record;
  }
  check(record, record.data.schema === definition.schema, 'schema',
    `Expected schema ${definition.schema}; observed ${record.data.schema ?? 'missing'}.`);
  check(record, record.data.task_id === definition.taskId, 'task_provenance',
    `Expected task_id ${definition.taskId}; observed ${record.data.task_id ?? 'missing'}.`);
  check(record, isIsoDate(record.generated_at), 'generated_at', 'Evidence has no valid generated_at timestamp.');
  definition.validate(record);
  if (record.gaps.length === 0) record.status = 'passed';
  else record.status = 'failed';
  return record;
}

function validateProfileMatrix(record) {
  const data = record.data;
  check(record, data.complete === true, 'complete', 'The all-profile matrix is not complete.');
  check(record, normalizeDecision(data.decision) === 'GO', 'decision', `Profile matrix decision is ${data.decision ?? 'missing'}.`);
  check(record, data.summary?.service_count === REQUIRED_SERVICES.length, 'service_count',
    `Expected ${REQUIRED_SERVICES.length} services; observed ${data.summary?.service_count ?? 'missing'}.`);
  check(record, data.summary?.profile_count === REQUIRED_PROFILES.length, 'profile_count',
    `Expected profiles A-H; observed ${data.summary?.profile_count ?? 'missing'} profiles.`);
  const profileRows = Array.isArray(data.profile_matrix) ? data.profile_matrix : [];
  for (const profile of REQUIRED_PROFILES) {
    const row = profileRows.find(item => item.profile === profile);
    check(record, Boolean(row), `profile_${profile}`, `Profile ${profile} is absent from the service matrix.`, `profile:${profile}`);
    for (const service of REQUIRED_SERVICES) {
      const cell = row?.services?.find(item => item.service === service);
      check(record, Boolean(cell), `profile_${profile}_${service}`, `${service}/Profile ${profile} has no evidence cell.`, `${service}:${profile}`);
      if (cell) check(record, cell.capability_state === 'supported', `profile_${profile}_${service}_${cell.capability_state ?? 'unknown'}`,
        `${service}/Profile ${profile} is ${cell.capability_state ?? 'unknown'}; supported proof or an approved non-release disposition is required.`, `${service}:${profile}`);
    }
  }
  for (const serviceId of REQUIRED_SERVICES) {
    const service = data.services?.find(item => item.service === serviceId);
    check(record, Boolean(service), `service_${serviceId}`, `${serviceId} is absent from the live matrix.`, serviceId);
    check(record, service?.http?.live === true, `${serviceId}_http`, `${serviceId} HTTP route is not live.`, `${serviceId}:http`);
    check(record, service?.libp2p?.live === true, `${serviceId}_libp2p`, `${serviceId} libp2p route is not live.`, `${serviceId}:libp2p`);
  }
}

function validateAppBehavior(record) {
  const data = record.data;
  const apps = Array.isArray(data.apps) ? data.apps : [];
  check(record, data.status === 'passed', 'status', `All-app behavior status is ${data.status ?? 'missing'}.`);
  check(record, Number.isInteger(data.app_count) && data.app_count > 0 && data.app_count === apps.length,
    'app_count', `App count ${data.app_count ?? 'missing'} does not match ${apps.length} app rows.`);
  for (const key of ['failed', 'unexpected_browser_console_error_count', 'unexpected_failed_request_count']) {
    check(record, data.summary?.[key] === 0, `summary_${key}`, `App behavior summary ${key} is ${data.summary?.[key] ?? 'missing'}, expected 0.`);
  }
  for (const key of ['outage_observed', 'recovered', 'reopened']) {
    check(record, data.summary?.[key] === data.app_count, `summary_${key}`,
      `App behavior ${key} coverage is ${data.summary?.[key] ?? 'missing'}/${data.app_count ?? 'unknown'}.`);
  }
  for (const app of apps) {
    const id = app.app_id ?? 'unknown-app';
    check(record, app.status === 'passed', `${id}_status`, `${id} behavior did not pass.`, id);
    for (const [key, value] of Object.entries({
      actual_tool_id: app.actual_tool_id,
      tool_owner: app.tool_owner,
      actual_transport: app.actual_transport,
      correlation_id: app.correlation_id,
    })) check(record, nonEmpty(value), `${id}_${key}`, `${id} has no ${key}.`, id);
    check(record, nonEmpty(app.receipt?.receipt_cid), `${id}_receipt`, `${id} has no receipt CID.`, id);
    check(record, nonEmpty(app.event_dag?.event_cid), `${id}_event_dag`, `${id} has no event-DAG CID.`, id);
    check(record, app.event_dag?.receipt_cid === app.receipt?.receipt_cid, `${id}_provenance_link`,
      `${id} event-DAG does not reference its receipt.`, id);
    record.screenshots.push(...validateScreenshots(record, app.screenshots, id));
  }
  for (const skip of data.explicit_skips ?? []) {
    check(record, [skip.app_id, skip.tool_id, skip.owner, skip.reason].every(nonEmpty),
      `skip_${skip.app_id ?? 'unknown'}_${skip.tool_id ?? 'unknown'}`,
      'An explicit fixture skip is not fully named with app, tool, owner, and reason.', skip.app_id ?? skip.tool_id);
  }
}

function validateSupervisor(record) {
  const data = record.data;
  check(record, normalizeDecision(data.decision) === 'GO', 'decision', `Supervisor decision is ${data.decision ?? 'missing'}.`);
  check(record, sameSet(data.live_state?.owners ?? [], REQUIRED_SERVICES), 'owners',
    `Supervisor owners are ${(data.live_state?.owners ?? []).join(', ') || 'missing'}; all three are required.`);
  check(record, data.task_graph?.linked === true, 'task_graph_linked', 'Supervisor goals/subgoals/tasks are not linked to the taskboard.');
  const steeringModes = (data.prompt_steering ?? []).map(item => item.mode);
  check(record, steeringModes.includes('dry-run') && steeringModes.includes('confirmed'), 'steering_modes',
    'Supervisor proof must include dry-run and confirmed prompt steering.');
  check(record, (data.prompt_steering ?? []).every(item => item.prompt === '[prompt redacted]'), 'prompt_redaction',
    'Supervisor evidence persisted an unredacted prompt.');
  check(record, data.dispatch?.status === 'dispatched' && data.summary?.dispatched_waves > 0,
    'dispatch', 'The all-app validation wave was not dispatched.');
  check(record, data.browser_boundary?.gateway_only === true, 'gateway_boundary', 'Supervisor browser traffic bypassed the gateway.');
  check(record, data.browser_boundary?.direct_file_or_process_access_count === 0, 'host_boundary',
    'Supervisor attempted direct file or process access.');
  check(record, data.browser_boundary?.raw_prompt_persisted === false, 'raw_prompt', 'A raw prompt was persisted.');
  for (const key of ['hidden_control_count', 'text_overlap_count', 'broken_focus_count', 'browser_console_error_count', 'failed_request_count', 'unreported_backend_failure_count']) {
    check(record, data.ui_validation?.[key] === 0, `ui_${key}`, `Supervisor UI ${key} is ${data.ui_validation?.[key] ?? 'missing'}, expected 0.`);
  }
  const outcomes = data.outcomes ?? [];
  for (const capability of EXPECTED_SUPERVISOR_CAPABILITIES) {
    check(record, outcomes.some(item => item.capability_id === capability), `capability_${capability}`,
      `Supervisor capability ${capability} has no current outcome.`, capability);
  }
  const governed = outcomes.filter(item => ['supervisor.prompt-steering.request', 'supervisor.task-control.request'].includes(item.capability_id));
  check(record, governed.every(item => nonEmpty(item.receipt_cid) && nonEmpty(item.event_dag_cid)), 'governed_provenance',
    'A governed Supervisor outcome is missing its receipt or event-DAG CID.');
  record.screenshots.push(...validateScreenshots(record, data.screenshots, 'agent-supervisor'));
}

function validateOrbIdl(record) {
  const data = record.data;
  const packets = Array.isArray(data.packets) ? data.packets : [];
  check(record, data.packet_count === packets.length && packets.length > 0, 'packet_count',
    `ORB/IDL packet count ${data.packet_count ?? 'missing'} does not match ${packets.length} rows.`);
  check(record, data.app_count > 0, 'app_count', 'ORB/IDL handoff contains no applications.');
  for (const packet of packets) {
    const id = packet.packet_id ?? packet.route_id ?? 'unknown-packet';
    for (const [key, value] of Object.entries({
      packet_cid: packet.packet_cid,
      interface_cid: packet.interface_cid,
      action_id: packet.action_id,
      method_id: packet.method_id,
      owner: packet.owner,
      correlation_id: packet.correlation_id,
      capability_profile_id: packet.capability_profile_id,
    })) check(record, nonEmpty(value), `${id}_${key}`, `${id} has no ${key}.`, id);
    check(record, nonEmpty(packet.permission?.state), `${id}_permission`, `${id} has no permission state.`, id);
    check(record, (packet.receipt_refs ?? []).some(ref => nonEmpty(ref.cid)), `${id}_receipt`, `${id} has no receipt reference.`, id);
    check(record, (packet.event_dag_refs ?? []).some(ref => nonEmpty(ref.cid)), `${id}_event`, `${id} has no event-DAG reference.`, id);
    check(record, nonEmpty(packet.rollback_behavior?.mode), `${id}_rollback`, `${id} has no rollback behavior.`, id);
    check(record, nonEmpty(packet.fallback_selection?.target_surface), `${id}_fallback`, `${id} has no fallback selection.`, id);
    const modalities = (packet.modality_constraints ?? []).map(item => item.modality);
    check(record, sameSet(modalities, REQUIRED_MODALITIES), `${id}_modalities`, `${id} does not constrain all required modalities.`, id);
  }
  for (const capability of EXPECTED_SUPERVISOR_CAPABILITIES) {
    check(record, packets.some(packet => packet.action_id === capability), `supervisor_${capability}`,
      `ORB/IDL has no packet for ${capability}.`, capability);
  }
}

function validateMetaSimulator(record) {
  const data = record.data;
  const packets = Array.isArray(data.packets) ? data.packets : [];
  check(record, data.status === 'passed', 'status', `Meta simulator status is ${data.status ?? 'missing'}.`);
  check(record, data.boundary?.simulator_only === true && data.boundary?.hardware_free === true,
    'simulator_boundary', 'Meta evidence is not explicitly simulator-only and hardware-free.');
  check(record, data.boundary?.hardware_pairing_required === false && data.boundary?.physical_hardware_claimed === false,
    'hardware_claim', 'Meta evidence requires or claims physical hardware.');
  for (const [name, passed] of Object.entries(data.acceptance ?? {})) {
    check(record, passed === true, `acceptance_${name}`, `Meta acceptance check ${name} failed.`);
  }
  check(record, data.source_packet_count === data.replayed_packet_count && packets.length === data.replayed_packet_count,
    'packet_replay_count', `Meta replayed ${data.replayed_packet_count ?? 'missing'}/${data.source_packet_count ?? 'missing'} packets.`);
  check(record, sameSet(data.replay_scenarios ?? [], REQUIRED_REPLAY_SCENARIOS), 'replay_scenarios',
    'Meta evidence does not cover primary, permission-denied, and route-unavailable scenarios.');
  for (const modality of REQUIRED_MODALITIES) {
    check(record, data.modality_summary?.[modality] === data.replayed_packet_count, `modality_${modality}`,
      `${modality} replay coverage is ${data.modality_summary?.[modality] ?? 'missing'}/${data.replayed_packet_count ?? 'unknown'}.`, modality);
  }
  check(record, (data.applications ?? []).every(app => app.status === 'passed'), 'applications',
    'At least one application lacks complete Meta replay evidence.');
  record.screenshots.push(...validateScreenshots(record, data.output_manifest?.screenshots, 'meta-device-simulator'));
}

function validatePeerEvidence(record) {
  const data = record.data;
  const services = Array.isArray(data.services) ? data.services : [];
  const tools = Array.isArray(data.tools) ? data.tools : [];
  check(record, normalizeDecision(data.decision) === 'GO', 'decision', `Peer interoperability decision is ${data.decision ?? 'missing'}.`);
  for (const blocker of data.blockers ?? []) {
    record.gaps.push(gap('SVD-100', `peer_gate_${blocker.gate ?? 'unknown'}`,
      blocker.service ?? 'peer-capture', blocker.reason ?? 'Peer capture reported an unnamed blocker.', record.path));
  }
  check(record, data.availability_evidence_policy?.count_only_inference_forbidden === true,
    'count_policy', 'Peer evidence does not forbid count-only availability inference.');
  check(record, services.length === REQUIRED_SERVICES.length, 'service_count',
    `Expected ${REQUIRED_SERVICES.length} peer services; observed ${services.length}.`);
  for (const serviceId of REQUIRED_SERVICES) {
    const service = services.find(item => item.service === serviceId);
    check(record, Boolean(service), `service_${serviceId}`, `${serviceId} has no peer evidence.`, serviceId);
    if (!service) continue;
    check(record, normalizeDecision(service?.decision) === 'GO', `${serviceId}_decision`, `${serviceId} peer decision is ${service?.decision ?? 'missing'}.`, serviceId);
    check(record, (service?.gates ?? []).every(item => item.passed === true), `${serviceId}_gates`, `${serviceId} has failed peer gates.`, serviceId);
    for (const transport of REQUIRED_TRANSPORTS) {
      const observed = service?.transports?.[transport];
      check(record, observed?.connected === true && observed?.no_transport_fallback === true,
        `${serviceId}_${transport}`, `${serviceId}/${transport} was not independently connected.`, `${serviceId}:${transport}`);
      check(record, observed?.identity?.verified === true, `${serviceId}_${transport}_identity`,
        `${serviceId}/${transport} UCAN identity was not verified.`, `${serviceId}:${transport}`);
      check(record, observed?.descriptor?.cid_retrieval_complete === true, `${serviceId}_${transport}_descriptor`,
        `${serviceId}/${transport} descriptor CID retrieval is incomplete.`, `${serviceId}:${transport}`);
      check(record, observed?.fixture?.status === 'executed', `${serviceId}_${transport}_fixture`,
        `${serviceId}/${transport} approved fixture status is ${observed?.fixture?.status ?? 'missing'}.`, `${serviceId}:${transport}`);
      check(record, observed?.fixture?.event_dag?.execution_event_present === true,
        `${serviceId}_${transport}_event_dag`, `${serviceId}/${transport} execution is absent from the event DAG.`, `${serviceId}:${transport}`);
    }
    check(record, service?.parity?.passed === true, `${serviceId}_parity`, `${serviceId} HTTP/libp2p parity failed.`, serviceId);
  }
  for (const tool of tools) {
    const scope = `${tool.service ?? 'unknown'}:${tool.name ?? 'unknown'}`;
    check(record, ALLOWED_TOOL_DISPOSITIONS.has(tool.disposition), `tool_${scope}_disposition`,
      `${scope} has invalid disposition ${tool.disposition ?? 'missing'}.`, scope);
    check(record, nonEmpty(tool.disposition_reason), `tool_${scope}_reason`, `${scope} has no disposition reason.`, scope);
    check(record, tool.availability_inferred_from_count === false, `tool_${scope}_count`, `${scope} availability was inferred from a count.`, scope);
    if (['unreachable', 'unsupported', 'static-only'].includes(tool.disposition)) {
      record.gaps.push(gap('SVD-100', `tool_${tool.disposition}`, scope,
        tool.disposition_reason, record.path));
    }
  }
}

/**
 * Preserve the SVD-047 closeout contract after the release aggregate moved on
 * to the broader SVD-101 evidence model.  These gates deliberately accept a
 * newer, stronger proof where one exists, but never infer success from counts
 * or from the aggregate report being generated successfully.
 */
function buildPhaseFourCloseout(records) {
  const current = Object.fromEntries(records.map(record => [record.id, record]));
  const policy = readPhaseFourArtifact('all-tools-policy-release-gate.json');
  const adapter = readPhaseFourArtifact('ipfs-accelerate-adapter-coverage.json');
  const smoke = readPhaseFourArtifact('all-tools-app-smoke-coverage.json');
  const browser = readPhaseFourArtifact('browser-all-app-compatibility.json');
  const legacyMeta = readPhaseFourArtifact('meta-glasses-device-simulator-validation.json');

  const smokeChecks = validatePhaseFourSmoke(smoke);
  const policyChecks = validatePhaseFourPolicy(policy);
  const adapterChecks = validatePhaseFourAdapter(adapter, policy);
  const browserChecks = validatePhaseFourBrowser(browser, smoke);
  const legacyMetaChecks = validatePhaseFourMeta(legacyMeta);

  const representativeSatisfied = current.app_backend_behavior?.status === 'passed'
    || smokeChecks.every(item => item.passed);
  const exhaustiveSatisfied = current.peer_interoperability?.status === 'passed'
    || policyChecks.every(item => item.passed);
  const metaSatisfied = current.meta_device_simulator?.status === 'passed'
    || legacyMetaChecks.every(item => item.passed);

  const gates = [
    phaseFourGate(
      'representative_app_gate',
      'SVD-047',
      'Representative virtual-desktop app behavior',
      representativeSatisfied,
      representativeSatisfied
        ? []
        : unique([
            ...failedReasons(smokeChecks),
            ...recordFailureReasons(current.app_backend_behavior),
          ]),
      [artifactReference(smoke), recordReference(current.app_backend_behavior)],
    ),
    phaseFourGate(
      'exhaustive_all_tools_gate',
      'SVD-057',
      'Exhaustive all-tools policy and behavior coverage',
      exhaustiveSatisfied,
      exhaustiveSatisfied
        ? []
        : unique([
            ...failedReasons(policyChecks),
            ...recordFailureReasons(current.peer_interoperability),
          ]),
      [artifactReference(policy), recordReference(current.peer_interoperability)],
    ),
    phaseFourGate(
      'accelerate_adapter_boundary',
      'SVD-044',
      'Configured ipfs_accelerate_py adapter boundary',
      adapterChecks.every(item => item.passed),
      failedReasons(adapterChecks),
      [artifactReference(adapter), artifactReference(policy)],
    ),
    phaseFourGate(
      'browser_compatible_app_smoke',
      'SVD-058',
      'Browser-compatible all-app smoke evidence',
      browserChecks.every(item => item.passed) && smokeChecks.every(item => item.passed),
      unique([...failedReasons(browserChecks), ...failedReasons(smokeChecks)]),
      [artifactReference(browser), artifactReference(smoke)],
    ),
    phaseFourGate(
      'meta_glasses_simulator',
      'SVD-046',
      'Hardware-free Meta glasses simulator evidence',
      metaSatisfied,
      metaSatisfied
        ? []
        : unique([
            ...failedReasons(legacyMetaChecks),
            ...recordFailureReasons(current.meta_device_simulator),
          ]),
      [artifactReference(legacyMeta), recordReference(current.meta_device_simulator)],
    ),
  ];

  const gaps = gates.filter(item => !item.passed).map(item => gap(
    item.task_id,
    `phase_four_${item.gate_id}`,
    item.gate_id,
    `${item.label} is not satisfied: ${item.blockers.join('; ') || 'no passing evidence was supplied'}.`,
    item.evidence.map(source => source.path).filter(Boolean).join(', ') || null,
  ));
  return {
    gaps,
    summary: {
      schema: 'swissknife.svd-047-phase-four-closeout.v1',
      required_gate_count: gates.length,
      passed_gate_count: gates.filter(item => item.passed).length,
      failed_gate_count: gates.filter(item => !item.passed).length,
      decision: gates.every(item => item.passed) ? 'go' : 'no_go',
      unknown_task_class_count: gates.filter(item => !/^SVD-\d+$/.test(item.task_id)).length,
      gates,
    },
  };
}

function readPhaseFourArtifact(fileName) {
  const filePath = path.join(evidenceRoot, fileName);
  const record = {
    path: relative(filePath),
    status: 'missing',
    data: null,
    sha256: null,
    error: null,
  };
  if (!fs.existsSync(filePath)) return record;
  try {
    const bytes = fs.readFileSync(filePath);
    record.data = JSON.parse(bytes.toString('utf8'));
    record.sha256 = sha256(bytes);
    record.status = 'present';
  } catch (error) {
    record.status = 'invalid';
    record.error = errorMessage(error);
  }
  return record;
}

function validatePhaseFourSmoke(record) {
  const data = record.data;
  const appCount = data?.app_count;
  const routed = data?.app_with_dispatch_count;
  const unrouted = data?.app_without_dispatch_count;
  return [
    phaseCheck(record.status === 'present', `${record.path} is missing or invalid${record.error ? `: ${record.error}` : ''}`),
    phaseCheck(data?.schema === 'swissknife.all-tools-virtual-desktop-app-smoke-coverage.v1', `${record.path} has an unexpected schema.`),
    phaseCheck(Number.isInteger(appCount) && appCount > 0, `${record.path} has no positive app count.`),
    phaseCheck(Array.isArray(data?.apps) && data.apps.length === appCount, `${record.path} app rows do not match its app count.`),
    phaseCheck(Number.isInteger(routed) && Number.isInteger(unrouted) && routed + unrouted === appCount, `${record.path} does not account for every app route.`),
    phaseCheck((data?.app_routable_tool_count ?? 0) > 0, `${record.path} has no app-routable tools.`),
    phaseCheck((data?.call_envelope_count ?? 0) >= (data?.app_routable_tool_count ?? 1), `${record.path} call envelopes do not cover all app-routable tools.`),
    phaseCheck(data?.layout_overflow_count === 0, `${record.path} reports layout overflow.`),
    phaseCheck((data?.screenshot_count ?? 0) > 0, `${record.path} has no browser screenshot evidence.`),
    ...['confirmation_blocked', 'confirmation_approved', 'success_rendered', 'error_rendered', 'receipt_rendered']
      .map(state => phaseCheck(data?.dispatch_state_counts?.[state] === routed, `${record.path} does not cover ${state} for every routed app.`)),
  ];
}

function validatePhaseFourPolicy(record) {
  const gates = Array.isArray(record.data?.gates) ? record.data.gates : [];
  return [
    phaseCheck(record.status === 'present', `${record.path} is missing or invalid${record.error ? `: ${record.error}` : ''}`),
    phaseCheck(isPassingDecision(record.data?.decision), `${record.path} decision is ${record.data?.decision ?? 'missing'}.`),
    phaseCheck(gates.length > 0, `${record.path} declares no exhaustive gates.`),
    phaseCheck(gates.length > 0 && gates.every(item => item.passed === true || String(item.status).toLowerCase() === 'pass'), `${record.path} has a failed or unproved gate.`),
    phaseCheck((record.data?.blockers ?? []).length === 0, `${record.path} declares blockers.`),
  ];
}

function validatePhaseFourAdapter(adapter, policy) {
  const data = adapter.data;
  const summary = data?.summary ?? data ?? {};
  const policyBoundary = (policy.data?.gates ?? []).find(item => (item.gate_id ?? item.id) === 'accelerate_adapter_boundary');
  const requiredCount = summary.required_count ?? summary.required_tool_count;
  const configuredCount = summary.configured_required_count;
  return [
    phaseCheck(adapter.status === 'present', `${adapter.path} is missing or invalid${adapter.error ? `: ${adapter.error}` : ''}`),
    phaseCheck(isPassingDecision(summary.decision ?? data?.decision), `${adapter.path} decision is ${summary.decision ?? data?.decision ?? 'missing'}.`),
    phaseCheck(Number.isInteger(requiredCount) && requiredCount > 0, `${adapter.path} has no required adapter-tool count.`),
    phaseCheck(configuredCount === requiredCount, `${adapter.path} configured adapter coverage is ${configuredCount ?? 'missing'}/${requiredCount ?? 'missing'}.`),
    phaseCheck(summary.missing_configured_required_count === 0, `${adapter.path} still has missing configured adapter tools.`),
    phaseCheck((data?.blockers ?? []).length === 0, `${adapter.path} declares adapter blockers.`),
    phaseCheck(policy.status === 'present', `${policy.path} is missing or invalid.`),
    phaseCheck(Boolean(policyBoundary), `${policy.path} has no accelerate_adapter_boundary gate.`),
    phaseCheck(policyBoundary?.passed === true || String(policyBoundary?.status).toLowerCase() === 'pass', `${policy.path} accelerate_adapter_boundary did not pass.`),
  ];
}

function validatePhaseFourBrowser(browser, smoke) {
  const data = browser.data;
  return [
    phaseCheck(browser.status === 'present', `${browser.path} is missing or invalid${browser.error ? `: ${browser.error}` : ''}`),
    phaseCheck(data?.schema === 'swissknife.browser-all-app-compatibility.v1', `${browser.path} has an unexpected schema.`),
    phaseCheck(isPassingDecision(data?.decision), `${browser.path} decision is ${data?.decision ?? 'missing'}.`),
    phaseCheck(data?.browser_audit?.ok === true, `${browser.path} browser audit did not pass.`),
    phaseCheck(data?.browser_audit?.fail_count === 0, `${browser.path} has browser audit failures.`),
    phaseCheck(data?.browser_audit?.host_only_match_count === 0, `${browser.path} has unguarded host-only matches.`),
    phaseCheck(data?.all_app_smoke?.layout_overflow_count === 0, `${browser.path} reports app layout overflow.`),
    phaseCheck(data?.all_app_smoke?.app_count === smoke.data?.app_count && (data?.all_app_smoke?.app_count ?? 0) > 0, `${browser.path} does not match the all-app smoke count.`),
    phaseCheck((data?.blockers ?? []).length === 0, `${browser.path} declares blockers.`),
  ];
}

function validatePhaseFourMeta(record) {
  const data = record.data;
  const summary = data?.summary ?? {};
  const explicitPass = isPassingDecision(data?.decision ?? data?.status)
    || data?.passed === true
    || data?.valid === true;
  const blockerCount = data?.blocker_count ?? summary.blocker_count ?? (data?.blockers ?? []).length;
  const failureCounts = [
    data?.open_failure_count, data?.template_failure_count, data?.browser_error_count,
    summary.open_failure_count, summary.template_failure_count, summary.browser_error_count,
    summary.open_failures, summary.template_failures, summary.browser_errors,
  ].filter(value => value !== undefined && value !== null);
  return [
    phaseCheck(record.status === 'present', `${record.path} is missing or invalid${record.error ? `: ${record.error}` : ''}`),
    phaseCheck(explicitPass, `${record.path} does not declare a passing simulator result.`),
    phaseCheck(blockerCount === 0, `${record.path} declares simulator blockers.`),
    phaseCheck(failureCounts.every(value => value === 0), `${record.path} reports simulator failures or browser errors.`),
    phaseCheck(data?.physical_hardware_required !== true && data?.hardware_pairing_required !== true, `${record.path} is not a hardware-free simulator proof.`),
  ];
}

function phaseCheck(passed, reason) { return { passed: Boolean(passed), reason }; }
function failedReasons(checks) {
  const failed = checks.filter(item => !item.passed).map(item => item.reason);
  const unavailable = failed.filter(reason => /is missing or invalid/.test(reason));
  return unavailable.length > 0 ? unavailable : failed;
}
function isPassingDecision(value) { return ['GO', 'PASS', 'PASSED'].includes(String(value ?? '').toUpperCase().replace(/[-_]/g, '')); }
function artifactReference(record) { return { path: record.path, status: record.status, sha256: record.sha256 }; }
function recordReference(record) {
  if (!record) return { path: null, status: 'missing', sha256: null };
  return { path: record.path, status: record.status, sha256: record.sha256 };
}
function recordFailureReasons(record) {
  if (!record) return ['No compatible current evidence record exists.'];
  if (record.status === 'passed') return [];
  if (record.gaps?.length > 0) return record.gaps.map(item => item.reason);
  return [`${record.path} status is ${record.status}.`];
}
function phaseFourGate(gateId, taskId, label, passed, blockers, evidence) {
  return {
    gate_id: gateId,
    task_id: taskId,
    label,
    passed: Boolean(passed),
    status: passed ? 'passed' : 'blocked',
    blockers: passed ? [] : unique(blockers),
    evidence: evidence.filter(Boolean),
  };
}

function check(record, passed, id, message, scope = null) {
  record.checks.push({ id, passed: Boolean(passed), message: passed ? null : message });
  if (!passed) record.gaps.push(gap(record.taskId, id, scope ?? record.id, message, record.path));
}

function gap(taskId, code, scope, reason, evidencePath) {
  return {
    task_id: taskId,
    code,
    scope: String(scope ?? 'unknown'),
    reason,
    evidence_path: evidencePath ?? null,
    status: 'open',
  };
}

function collectDispositions(records) {
  const approved = [{
    id: 'meta-physical-hardware',
    task_id: 'SVD-099',
    scope: 'meta:physical-hardware-pairing',
    disposition: 'simulator-only',
    rationale: 'SVD-099 explicitly validates the simulator without requiring or claiming physical hardware pairing.',
    approved_by: 'SVD-099 acceptance policy',
    approval_task_id: 'SVD-099',
    source_path: records.find(record => record.id === 'meta_device_simulator')?.path ?? null,
  }];
  const rejected = [];

  const appEvidence = records.find(record => record.id === 'app_backend_behavior');
  for (const skip of appEvidence?.data?.explicit_skips ?? []) {
    const candidate = {
      id: `fixture-skip:${skip.app_id}:${skip.tool_id}`,
      task_id: 'SVD-096',
      scope: `tool:${skip.owner}:${skip.tool_id}`,
      disposition: 'isolated-fixture-skip',
      rationale: skip.reason,
      approved_by: 'SVD-096 explicit-skip acceptance policy',
      approval_task_id: 'SVD-096',
      source_path: appEvidence.path,
    };
    if ([skip.app_id, skip.tool_id, skip.owner, skip.reason].every(nonEmpty)) approved.push(candidate);
    else rejected.push({ ...candidate, rejection_reason: 'Fixture skip is not fully named.' });
  }

  const peerEvidence = records.find(record => record.id === 'peer_interoperability');
  for (const tool of peerEvidence?.data?.tools ?? []) {
    if (tool.disposition !== 'denied') continue;
    const candidate = {
      id: `peer-denied:${tool.service}:${tool.name}`,
      task_id: 'SVD-100',
      scope: `tool:${tool.service}:${tool.name}`,
      disposition: 'non-mutating-fixture-not-approved',
      rationale: tool.disposition_reason,
      approved_by: 'SVD-100 narrow non-mutating fixture allowlist',
      approval_task_id: 'SVD-100',
      source_path: peerEvidence.path,
    };
    if (tool.availability_inferred_from_count === false && nonEmpty(tool.disposition_reason)) approved.push(candidate);
    else rejected.push({ ...candidate, rejection_reason: 'Denied tool lacks explicit name-level evidence and rationale.' });
  }

  for (const record of records) {
    for (const disposition of record.data?.non_release_dispositions ?? []) {
      const normalized = { ...disposition, source_path: record.path };
      if (disposition.approved === true
        && nonEmpty(disposition.scope)
        && nonEmpty(disposition.rationale)
        && nonEmpty(disposition.approved_by)
        && /^SVD-\d+$/.test(disposition.approval_task_id ?? '')) {
        approved.push(normalized);
      } else {
        rejected.push({ ...normalized, rejection_reason: 'Disposition requires approved=true, scope, rationale, approved_by, and an SVD-* approval_task_id.' });
      }
    }
  }
  return { approved: dedupeObjects(approved, item => `${item.scope}|${item.disposition}`), rejected };
}

function isClosedByDisposition(item, approved) {
  return approved.some(disposition => {
    if (disposition.scope !== item.scope && disposition.scope !== '*') return false;
    if (disposition.closes_gap_code) return disposition.closes_gap_code === item.code;
    return /(denied|unavailable|unsupported|static.only|skip)/i.test(item.code);
  });
}

function buildAppMatrix(appBehavior, orb, meta) {
  const behaviorApps = appBehavior?.data?.apps ?? [];
  const orbPackets = orb?.data?.packets ?? [];
  const metaApps = meta?.data?.applications ?? [];
  const appIds = unique([
    ...behaviorApps.map(app => app.app_id),
    ...orbPackets.map(packet => packet.app_id),
    ...metaApps.map(app => app.app_id),
  ].filter(Boolean));
  const rows = appIds.map(appId => {
    const behavior = behaviorApps.find(app => app.app_id === appId);
    const packets = orbPackets.filter(packet => packet.app_id === appId);
    const simulator = metaApps.find(app => app.app_id === appId);
    return {
      app_id: appId,
      backend_behavior: behavior ? behavior.status : 'missing',
      tool_id: behavior?.actual_tool_id ?? null,
      owner: behavior?.tool_owner ?? null,
      transport: behavior?.actual_transport ?? null,
      correlation_id: behavior?.correlation_id ?? null,
      outage_recovery_reopen: Boolean(behavior?.outage_observed && behavior?.recovered && behavior?.reopened),
      receipt_cid: behavior?.receipt?.receipt_cid ?? null,
      event_dag_cid: behavior?.event_dag?.event_cid ?? null,
      orb_idl_packet_count: packets.length,
      meta_simulator: simulator?.status ?? 'missing',
      screenshots: behavior?.screenshots ?? [],
      passing: behavior?.status === 'passed' && packets.length > 0 && simulator?.status === 'passed',
    };
  });
  return {
    required_app_count: appBehavior?.data?.app_count ?? orb?.data?.app_count ?? null,
    observed_app_count: rows.length,
    passing_app_count: rows.filter(row => row.passing).length,
    rows,
  };
}

function buildServiceMatrix(profile, peer, approved) {
  const profileRows = profile?.data?.profile_matrix ?? [];
  const peerServices = peer?.data?.services ?? [];
  const cells = REQUIRED_SERVICES.flatMap(service => REQUIRED_PROFILES.map(profileId => {
    const profileCell = profileRows.find(row => row.profile === profileId)?.services?.find(item => item.service === service);
    const peerService = peerServices.find(item => item.service === service);
    const passing = profileCell?.capability_state === 'supported';
    const approvedNonRelease = approved.some(item => item.scope === `${service}:${profileId}`);
    return {
      service,
      profile: profileId,
      capability_state: profileCell?.capability_state ?? 'unobserved',
      http_state: profileCell?.http_state ?? transportState(peerService, 'http'),
      libp2p_state: profileCell?.libp2p_state ?? transportState(peerService, 'libp2p'),
      selected_transport: profileCell?.transport_fallback?.selected_transport ?? null,
      fallback_decision: profileCell?.transport_fallback?.decision ?? null,
      passing,
      approved_non_release: approvedNonRelease,
      release_satisfied: passing || approvedNonRelease,
    };
  }));
  return {
    required_cell_count: REQUIRED_SERVICES.length * REQUIRED_PROFILES.length,
    passing_cell_count: cells.filter(cell => cell.passing).length,
    release_satisfied_cell_count: cells.filter(cell => cell.release_satisfied).length,
    unavailable_surfaces: profile?.data?.unavailable_surfaces ?? [],
    denied_surfaces: profile?.data?.denied_surfaces ?? [],
    cells,
  };
}

function buildToolMatrix(peer, approved) {
  const rows = (peer?.data?.tools ?? []).map(tool => ({
    service: tool.service,
    tool_id: tool.name,
    disposition: tool.disposition,
    reason: tool.disposition_reason,
    http: tool.observations?.http ?? null,
    libp2p: tool.observations?.libp2p ?? null,
    approved_non_release: tool.disposition === 'denied' && approved.some(item => item.scope === `tool:${tool.service}:${tool.name}`),
    release_satisfied: tool.disposition === 'executed'
      || (tool.disposition === 'denied' && approved.some(item => item.scope === `tool:${tool.service}:${tool.name}`)),
  }));
  return {
    count_only_inference_forbidden: peer?.data?.availability_evidence_policy?.count_only_inference_forbidden ?? true,
    tool_count: rows.length,
    executed_count: rows.filter(row => row.disposition === 'executed').length,
    approved_non_release_count: rows.filter(row => row.approved_non_release).length,
    unsatisfied_count: rows.filter(row => !row.release_satisfied).length,
    rows,
  };
}

function buildModalityMatrix(meta, approved) {
  const rows = REQUIRED_MODALITIES.map(modality => ({
    modality,
    required_scenarios: REQUIRED_REPLAY_SCENARIOS,
    replayed_packet_count: meta?.data?.modality_summary?.[modality] ?? 0,
    expected_packet_count: meta?.data?.replayed_packet_count ?? 0,
    passing: meta?.status === 'passed'
      && meta.data?.modality_summary?.[modality] === meta.data?.replayed_packet_count,
  }));
  return {
    simulator_only: meta?.data?.boundary?.simulator_only ?? null,
    hardware_free: meta?.data?.boundary?.hardware_free ?? null,
    physical_hardware_claimed: meta?.data?.boundary?.physical_hardware_claimed ?? null,
    hardware_non_release_disposition: approved.find(item => item.scope === 'meta:physical-hardware-pairing') ?? null,
    passing_modality_count: rows.filter(row => row.passing).length,
    rows,
  };
}

function buildScreenshotEvidence(records) {
  const rows = records.flatMap(record => record.screenshots.map(screenshot => ({ evidence_id: record.id, ...screenshot })));
  const expectedRoots = records.filter(record => record.screenshotRoot).map(record => {
    const absoluteRoot = path.join(projectRoot, record.screenshotRoot);
    const present = fs.existsSync(absoluteRoot) && fs.statSync(absoluteRoot).isDirectory();
    const pngCount = present ? walkFiles(absoluteRoot).filter(file => path.extname(file).toLowerCase() === '.png').length : 0;
    return { task_id: record.taskId, evidence_id: record.id, path: record.screenshotRoot, present, png_count: pngCount };
  });
  return {
    expected_roots: expectedRoots,
    missing_roots: expectedRoots.filter(root => !root.present),
    declared_count: rows.length,
    present_count: rows.filter(row => row.present && row.valid_png).length,
    missing: rows.filter(row => !row.present || !row.valid_png),
    rows,
  };
}

function buildProvenanceEvidence(records) {
  const app = records.find(record => record.id === 'app_backend_behavior')?.data?.apps ?? [];
  const supervisor = records.find(record => record.id === 'supervisor_console')?.data?.outcomes ?? [];
  const packets = records.find(record => record.id === 'orb_idl_packets')?.data?.packets ?? [];
  const metaPackets = records.find(record => record.id === 'meta_device_simulator')?.data?.packets ?? [];
  const peerServices = records.find(record => record.id === 'peer_interoperability')?.data?.services ?? [];
  return {
    app_behavior: {
      receipt_count: app.filter(item => nonEmpty(item.receipt?.receipt_cid)).length,
      event_dag_count: app.filter(item => nonEmpty(item.event_dag?.event_cid)).length,
      linked_count: app.filter(item => item.event_dag?.receipt_cid === item.receipt?.receipt_cid).length,
    },
    supervisor: {
      receipt_count: supervisor.filter(item => nonEmpty(item.receipt_cid)).length,
      event_dag_count: supervisor.filter(item => nonEmpty(item.event_dag_cid)).length,
    },
    orb_idl: {
      packet_count: packets.length,
      receipt_ref_count: packets.reduce((sum, item) => sum + (item.receipt_refs?.length ?? 0), 0),
      event_dag_ref_count: packets.reduce((sum, item) => sum + (item.event_dag_refs?.length ?? 0), 0),
    },
    meta_simulator: {
      packet_count: metaPackets.length,
      preserved_count: metaPackets.filter(item => item.receipt_preservation?.preserved).length,
    },
    peer_interoperability: {
      service_count: peerServices.length,
      transport_execution_count: peerServices.reduce((sum, service) => sum + REQUIRED_TRANSPORTS.filter(transport =>
        service.transports?.[transport]?.fixture?.status === 'executed').length, 0),
      event_dag_visible_count: peerServices.reduce((sum, service) => sum + REQUIRED_TRANSPORTS.filter(transport =>
        service.transports?.[transport]?.fixture?.event_dag?.execution_event_present === true).length, 0),
    },
  };
}

function summarizeSupervisor(record) {
  return {
    status: record?.status ?? 'missing',
    decision: record?.data?.decision ?? null,
    owners: record?.data?.live_state?.owners ?? [],
    task_graph: record?.data?.task_graph ?? null,
    prompt_steering: record?.data?.prompt_steering ?? [],
    dispatch: record?.data?.dispatch ?? null,
    browser_boundary: record?.data?.browser_boundary ?? null,
    ui_validation: record?.data?.ui_validation ?? null,
    outcomes: record?.data?.outcomes ?? [],
  };
}

function summarizeOrb(record) {
  const packets = record?.data?.packets ?? [];
  return {
    status: record?.status ?? 'missing',
    packet_count: packets.length,
    app_count: record?.data?.app_count ?? null,
    supervisor_packet_count: packets.filter(packet => packet.route_id?.startsWith('supervisor:')).length,
    interface_cid_count: unique(packets.map(packet => packet.interface_cid).filter(Boolean)).length,
    permission_states: countBy(packets, packet => packet.permission?.state ?? 'missing'),
    fallback_surfaces: countBy(packets, packet => packet.fallback_selection?.target_surface ?? 'missing'),
  };
}

function buildUnavailableCases(records, blockerGaps) {
  const cases = blockerGaps.map(item => ({
    kind: 'release_gap', task_id: item.task_id, scope: item.scope, state: item.code, reason: item.reason,
  }));
  const profile = records.find(record => record.id === 'service_profile_matrix')?.data;
  for (const item of profile?.unavailable_surfaces ?? []) cases.push({ kind: 'profile', task_id: 'SVD-093', state: 'unavailable', ...item });
  for (const item of profile?.denied_surfaces ?? []) cases.push({ kind: 'profile', task_id: 'SVD-093', state: 'denied', ...item });
  const app = records.find(record => record.id === 'app_backend_behavior')?.data;
  for (const item of app?.explicit_skips ?? []) cases.push({ kind: 'tool', task_id: 'SVD-096', state: 'explicitly_skipped', ...item });
  const peer = records.find(record => record.id === 'peer_interoperability')?.data;
  for (const tool of peer?.tools ?? []) if (tool.disposition !== 'executed') cases.push({
    kind: 'tool', task_id: 'SVD-100', state: tool.disposition, service: tool.service,
    tool_id: tool.name, reason: tool.disposition_reason,
  });
  return dedupeObjects(cases, item => `${item.kind}|${item.task_id}|${item.scope ?? item.service ?? ''}|${item.tool_id ?? item.profile ?? ''}|${item.state}`);
}

function validateScreenshots(record, paths, scope) {
  if (!Array.isArray(paths) || paths.length === 0) {
    record.gaps.push(gap(record.taskId, 'missing_screenshots', scope,
      `${scope} declares no screenshots.`, record.path));
    return [];
  }
  return paths.map(declaredPath => {
    const safe = safeProjectPath(declaredPath);
    const present = Boolean(safe && fs.existsSync(safe));
    const stat = present ? fs.statSync(safe) : null;
    const validPng = Boolean(present && stat.isFile() && stat.size > 8 && isPng(safe));
    if (!validPng) record.gaps.push(gap(record.taskId, 'missing_or_invalid_screenshot', scope,
      `Screenshot is missing or not a non-empty PNG: ${declaredPath}.`, record.path));
    return { path: declaredPath, scope, present, bytes: stat?.size ?? 0, valid_png: validPng };
  });
}

function artifactSummary(record) {
  return {
    task_id: record.taskId,
    path: record.path,
    expected_schema: record.schema,
    observed_schema: record.data?.schema ?? null,
    status: record.status,
    generated_at: record.generated_at,
    sha256: record.sha256,
    source_fingerprint: record.source_fingerprint.combined_sha256,
    source_files: record.source_fingerprint.files,
    passed_check_count: record.checks.filter(item => item.passed).length,
    failed_check_count: record.checks.filter(item => !item.passed).length,
    failed_checks: record.checks.filter(item => !item.passed),
  };
}

function compatibilityDecision(decision, blockers) {
  return {
    decision: decision === 'GO' ? 'go' : 'no_go',
    representative_decision: decision === 'GO' ? 'go' : 'no_go',
    all_tools_decision: decision === 'GO' ? 'go' : 'no_go',
    blocker_count: blockers.length,
    warning_count: 0,
    blockers: blockers.map(item => `${item.task_id}: ${item.scope}: ${item.reason}`),
    warnings: [],
    next_actions: unique(blockers.map(item => `${item.task_id}: refresh or close ${item.scope} with current passing proof or an approved non-release disposition.`)),
  };
}

function compatibilityHierarchical(serviceMatrix, peer) {
  const services = peer?.data?.services ?? [];
  return {
    status: peer?.status ?? 'missing',
    decision: peer?.data?.decision ?? 'no_go',
    release_gate_decision: peer?.status === 'passed' ? 'go' : 'no_go',
    service_count: REQUIRED_SERVICES.length,
    available_service_count: services.filter(service => normalizeDecision(service.decision) === 'GO').length,
    expected_live_services: REQUIRED_SERVICES,
    services_with_full_facade: null,
    dispatch_probe_count: services.length * REQUIRED_TRANSPORTS.length,
    dispatch_pass_count: services.reduce((sum, service) => sum + REQUIRED_TRANSPORTS.filter(transport => service.transports?.[transport]?.fixture?.status === 'executed').length, 0),
    direct_only_descriptor_count: 0,
    unexplained_flat_hierarchy_gap_count: serviceMatrix.cells.filter(cell => !cell.passing).length,
    stale_live_service_evidence: [],
    availability_mismatches: [],
    missing_facade_by_service: [],
  };
}

function compatibilityAppMatrix(appMatrix, modalityMatrix, blockers) {
  const appIds = appMatrix.rows.map(row => row.app_id);
  const behaviorMissing = appMatrix.rows.filter(row => row.backend_behavior !== 'passed').map(row => row.app_id);
  const orbMissing = appMatrix.rows.filter(row => row.orb_idl_packet_count === 0).map(row => row.app_id);
  const metaMissing = appMatrix.rows.filter(row => row.meta_simulator !== 'passed').map(row => row.app_id);
  return {
    decision: blockers.length === 0 ? 'go' : 'no_go',
    blocker_count: blockers.length,
    app_count: appMatrix.required_app_count ?? appIds.length,
    missing_contract_app_ids: [],
    missing_workflow_app_ids: behaviorMissing,
    missing_screenshot_apps: behaviorMissing.map(app_id => ({ app_id })),
    missing_workflow_states: [], missing_ux_states: [], missing_local_only_rationale_app_ids: [],
    missing_backend_capability_set_app_ids: [], malformed_backend_capabilities: [],
    missing_app_visible_binding_capabilities: [],
    missing_orb_idl_app_ids: orbMissing, missing_orb_idl_capabilities: [],
    missing_glasses_projection_app_ids: metaMissing, missing_glasses_projection_capabilities: [],
    missing_catalog_reconciliation: [], missing_mcp_plus_plus_eligibility: [],
    server_catalog_gaps: [], server_facade_gaps: [], tool_class_counts: {},
    missing_simulator_modalities: modalityMatrix.rows.filter(row => !row.passing).map(row => row.modality),
    missing_simulator_capability_modalities: modalityMatrix.rows.filter(row => !row.passing).map(row => row.modality),
    simulator_replay_gaps: [],
  };
}

function compatibilityCompleteGate(decision, records, blockers) {
  return {
    decision: decision === 'GO' ? 'go' : 'no_go',
    release_decision: decision,
    blocker_count: blockers.length,
    representative_blocker_count: blockers.filter(item => item.task_id !== 'SVD-100').length,
    all_tools_blocker_count: blockers.filter(item => item.task_id === 'SVD-100').length,
    required_mcp_servers: REQUIRED_SERVICES,
    required_orb_modalities: REQUIRED_MODALITIES,
    required_simulator_capabilities: REQUIRED_MODALITIES,
    required_supervisor_paths: EXPECTED_SUPERVISOR_CAPABILITIES,
    missing_evidence_paths: records.filter(record => record.status === 'missing').map(record => record.path),
    representative_blockers: blockers.filter(item => item.task_id !== 'SVD-100').map(item => `${item.task_id}: ${item.reason}`),
    all_tools_blockers: blockers.filter(item => item.task_id === 'SVD-100').map(item => `${item.task_id}: ${item.reason}`),
  };
}

function renderMarkdown(report) {
  const displayDecision = report.decision.status.replace(/_/g, '-');
  const lines = [
    '# SwissKnife Virtual Desktop All-Tools Release Evidence', '',
    `Generated: ${report.generated_at}`, `Source revision: \`${report.source_revision}\``,
    `Decision: **${displayDecision}**`, '',
    '## SVD-047 phase-four closeout gates', '',
    '| Required gate | Owner | Status | Evidence |',
    '| --- | --- | --- | --- |',
  ];
  for (const gate of report.phase_four_closeout.gates) {
    const evidence = gate.evidence.map(item => `\`${item.path ?? 'missing'}\` (${item.status})`).join('<br>');
    lines.push(`| ${escapeMd(gate.label)} | ${gate.task_id} | ${gate.status} | ${evidence || 'missing'} |`);
  }
  lines.push('', `Phase-four gates passed: ${report.phase_four_closeout.passed_gate_count}/${report.phase_four_closeout.required_gate_count}.`, '');
  for (const gate of report.phase_four_closeout.gates.filter(item => !item.passed)) {
    lines.push(`- **${gate.gate_id}**: ${gate.blockers.map(escapeMd).join('; ') || 'No passing evidence was supplied.'}`);
  }
  lines.push('', '## Blockers', '');
  if (report.named_gaps.length === 0) lines.push('- None.');
  else for (const item of report.named_gaps) lines.push(`- **${item.task_id}** — \`${escapeMd(item.scope)}\` / \`${item.code}\`: ${escapeMd(item.reason)}`);
  lines.push('', '## Evidence freshness and status', '', '| Evidence | Task | Status | Generated | SHA-256 |', '| --- | --- | --- | --- | --- |');
  for (const [id, artifact] of Object.entries(report.artifacts)) lines.push(`| \`${id}\` | ${artifact.task_id} | ${artifact.status} | ${artifact.generated_at ?? 'missing'} | \`${artifact.sha256?.slice(0, 12) ?? 'missing'}\` |`);
  lines.push('', '## App behavior', '', `Passing complete app rows: ${report.app_behavior_matrix.passing_app_count}/${report.app_behavior_matrix.required_app_count ?? report.app_behavior_matrix.observed_app_count}.`, '',
    '| App | Backend | Tool / owner / transport | Recovery | ORB packets | Meta |', '| --- | --- | --- | --- | ---: | --- |');
  for (const row of report.app_behavior_matrix.rows) lines.push(`| \`${row.app_id}\` | ${row.backend_behavior} | \`${row.tool_id ?? 'missing'}\` / \`${row.owner ?? 'missing'}\` / \`${row.transport ?? 'missing'}\` | ${row.outage_recovery_reopen ? 'passed' : 'missing'} | ${row.orb_idl_packet_count} | ${row.meta_simulator} |`);
  lines.push('', '## Service / profile / transport matrix', '', `Passing proof cells: ${report.service_profile_transport_matrix.passing_cell_count}/${report.service_profile_transport_matrix.required_cell_count}; release-satisfied cells: ${report.service_profile_transport_matrix.release_satisfied_cell_count}/${report.service_profile_transport_matrix.required_cell_count}.`, '',
    '| Service | Profile | Capability | HTTP | libp2p | Selection |', '| --- | --- | --- | --- | --- | --- |');
  for (const cell of report.service_profile_transport_matrix.cells) lines.push(`| \`${cell.service}\` | ${cell.profile} | ${cell.capability_state} | ${cell.http_state} | ${cell.libp2p_state} | ${cell.fallback_decision ?? 'unobserved'} → ${cell.selected_transport ?? 'none'} |`);
  lines.push('', '## Supervisor Console', '',
    `- Evidence status: ${report.supervisor_console.status}`,
    `- Owners: ${report.supervisor_console.owners.join(', ') || 'none'}`,
    `- Task graph linked: ${report.supervisor_console.task_graph?.linked ?? false}`,
    `- Prompt steering modes: ${report.supervisor_console.prompt_steering.map(item => item.mode).join(', ') || 'none'}`,
    `- Dispatch status: ${report.supervisor_console.dispatch?.status ?? 'missing'}`, '',
    '## ORB/IDL packets', '',
    `- Evidence status: ${report.orb_idl_packets.status}`,
    `- Packets: ${report.orb_idl_packets.packet_count}; apps: ${report.orb_idl_packets.app_count ?? 'unknown'}; Supervisor packets: ${report.orb_idl_packets.supervisor_packet_count}`,
    `- Interface CIDs: ${report.orb_idl_packets.interface_cid_count}`,
    `- Permission states: ${formatCounts(report.orb_idl_packets.permission_states)}`,
    `- Fallback surfaces: ${formatCounts(report.orb_idl_packets.fallback_surfaces)}`, '',
    '## Meta simulator modalities', '',
    '| Modality | Replayed packets | Required packets | Status |', '| --- | ---: | ---: | --- |');
  for (const row of report.meta_simulator_modalities.rows) lines.push(`| ${row.modality} | ${row.replayed_packet_count} | ${row.expected_packet_count} | ${row.passing ? 'passed' : 'missing/failed'} |`);
  lines.push('', `Physical hardware: **not claimed**; disposition approved by ${report.meta_simulator_modalities.hardware_non_release_disposition?.approved_by ?? 'missing approval'}.`, '',
    '## Screenshots and provenance', '',
    `- Screenshot roots present: ${report.screenshot_evidence.expected_roots.filter(root => root.present).length}/${report.screenshot_evidence.expected_roots.length}`,
    `- Screenshots present and valid: ${report.screenshot_evidence.present_count}/${report.screenshot_evidence.declared_count}`,
    `- App receipts/events/links: ${report.receipt_event_dag_evidence.app_behavior.receipt_count}/${report.receipt_event_dag_evidence.app_behavior.event_dag_count}/${report.receipt_event_dag_evidence.app_behavior.linked_count}`,
    `- ORB receipt/event refs: ${report.receipt_event_dag_evidence.orb_idl.receipt_ref_count}/${report.receipt_event_dag_evidence.orb_idl.event_dag_ref_count}`,
    `- Meta receipt preservation: ${report.receipt_event_dag_evidence.meta_simulator.preserved_count}/${report.receipt_event_dag_evidence.meta_simulator.packet_count}`,
    `- Peer event-DAG visibility: ${report.receipt_event_dag_evidence.peer_interoperability.event_dag_visible_count}/${REQUIRED_SERVICES.length * REQUIRED_TRANSPORTS.length}`, '',
    '## Explicit unavailable, blocked, denied, static-only, and skipped cases', '');
  if (report.unavailable_and_blocked_cases.length === 0) lines.push('- None.');
  else for (const item of report.unavailable_and_blocked_cases) lines.push(`- **${item.task_id}** — ${escapeMd(item.kind)} / \`${escapeMd(item.scope ?? `${item.service ?? ''}:${item.tool_id ?? item.profile ?? ''}`)}\` / ${item.state}: ${escapeMd(item.reason ?? 'No reason recorded.')}`);
  lines.push('', '## Approved non-release dispositions', '');
  for (const item of report.non_release_dispositions.approved) lines.push(`- \`${escapeMd(item.scope)}\` — ${escapeMd(item.disposition)}; ${escapeMd(item.rationale)} (${item.approved_by}, ${item.approval_task_id})`);
  if (report.non_release_dispositions.approved.length === 0) lines.push('- None.');
  lines.push('', '## No new unknowns', '',
    `- Status: **${report.unknown_task_class_audit.status}**`,
    `- Unknown task classes: ${report.unknown_task_class_audit.unknown_task_class_count}`,
    `- ${report.unknown_task_class_audit.statement}`,
    '', '## Decision', '', report.decision.status === 'GO'
    ? 'Every required surface has a current passing proof or an approved non-release disposition.'
    : `Release remains **NO-GO**. Close only the named task gaps: ${report.decision.blocker_task_ids.join(', ') || 'none'}.`, '');
  return `${lines.join('\n')}\n`;
}

function renderNoNewUnknowns(report) {
  const lines = [
    '# All-Tools Closeout: No New Unknowns', '',
    `Generated: ${report.generated_at}`,
    `Source revision: \`${report.source_revision}\``,
    `Decision: **${report.decision.status.replace(/_/g, '-')}**`, '',
    '## No new unknowns', '',
    report.unknown_task_class_audit.unknown_task_class_count === 0
      ? '**No new unknowns.** Every blocker is assigned to an existing SVD task class.'
      : `**Unknown task classes remain:** ${report.unknown_task_class_audit.unknown_task_class_count}.`, '',
    '## Phase-four gate accounting', '',
    '| Gate | Owner task | Status |',
    '| --- | --- | --- |',
  ];
  for (const gate of report.phase_four_closeout.gates) {
    lines.push(`| \`${gate.gate_id}\` | ${gate.task_id} | ${gate.status} |`);
  }
  lines.push('', '## Blockers', '');
  if (report.named_gaps.length === 0) lines.push('- None.');
  else for (const item of report.named_gaps) {
    lines.push(`- **${item.task_id}** — \`${escapeMd(item.scope)}\`: ${escapeMd(item.reason)}`);
  }
  lines.push('', '## Task-class conclusion', '',
    report.unknown_task_class_audit.statement,
    'This ledger does not create follow-up task classes; it records only the existing owner task for each unsatisfied gate.', '');
  return `${lines.join('\n')}\n`;
}

function renderSignoff(report) {
  const lines = [
    '# Refactor Final Signoff', '',
    'Task: SVD-101 — Aggregate freshness-aware release evidence and close only named gaps', '',
    `Observed: ${report.generated_at}`,
    `SwissKnife revision: \`${report.source_revision}\``,
    `Release decision: **${report.decision.status.replace(/_/g, '-')}**`, '',
    'This signoff is generated from `test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json`.',
    'It does not convert missing, stale, blocked, denied, unsupported, or static-only evidence into success.', '',
    '## Decision basis', '',
    `- Required evidence artifacts passed: ${Object.values(report.artifacts).filter(item => item.status === 'passed').length}/${Object.keys(report.artifacts).length}`,
    `- Complete app rows passed: ${report.app_behavior_matrix.passing_app_count}/${report.app_behavior_matrix.required_app_count ?? report.app_behavior_matrix.observed_app_count}`,
    `- Service/profile cells release-satisfied: ${report.service_profile_transport_matrix.release_satisfied_cell_count}/${report.service_profile_transport_matrix.required_cell_count}`,
    `- Meta modalities passed: ${report.meta_simulator_modalities.passing_modality_count}/${REQUIRED_MODALITIES.length}`,
    `- Named blockers: ${report.decision.blocker_count}`,
    `- Approved non-release dispositions: ${report.decision.approved_non_release_disposition_count}`, '',
    '## Named blockers', '',
  ];
  if (report.named_gaps.length === 0) lines.push('- None.');
  else for (const item of report.named_gaps) lines.push(`- **${item.task_id}** — \`${escapeMd(item.scope)}\`: ${escapeMd(item.reason)}`);
  lines.push('', '## Non-release boundary', '',
    '- Physical Meta hardware pairing is not required, was not tested, and is not claimed. SVD-099 simulator evidence is the approved release scope.',
    '- Denied non-mutating peer tools are accepted only when SVD-100 records exact name-level discovery, a typed denial reason, and no count-based inference.',
    '- Any other unavailable, unsupported, static-only, missing, or failed case remains a named blocker unless an explicit approved disposition is added to its source artifact.', '',
    '## Evidence', '',
    '- Machine report: `test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json`',
    '- Readable report: `test-results/virtual-desktop-ipfs-mcp-orb/all-tools-release-evidence.md`',
    '- Freshness receipt: `docs/virtual-desktop-release-evidence.fingerprint.json`', '',
    report.decision.status === 'GO'
      ? 'The SVD-101 release scope is approved.'
      : `The release remains **NO-GO** until the named ${report.decision.blocker_task_ids.join(', ')} gaps are refreshed or consciously dispositioned.`,
  );
  return `${lines.join('\n')}\n`;
}

function certifyAggregateFreshness() {
  execFileSync(process.execPath, [
    'scripts/audit-release-evidence-freshness.mjs', '--update', 'virtual-desktop-release-evidence',
    '--json', 'docs/release-evidence-freshness.json', '--report', 'docs/release-evidence-freshness.md',
  ], { cwd: projectRoot, stdio: 'pipe' });
}

function fingerprintPaths(paths) {
  const files = [];
  for (const relativePath of paths) {
    const absolutePath = path.resolve(projectRoot, relativePath);
    if (!absolutePath.startsWith(`${projectRoot}${path.sep}`) && absolutePath !== projectRoot) continue;
    if (!fs.existsSync(absolutePath)) {
      files.push({ path: normalizePath(relativePath), sha256: 'MISSING', exists: false });
      continue;
    }
    if (fs.statSync(absolutePath).isFile()) {
      files.push({ path: normalizePath(relativePath), sha256: sha256(fs.readFileSync(absolutePath)), exists: true });
      continue;
    }
    walkFiles(absolutePath).forEach(file => files.push({ path: relative(file), sha256: sha256(fs.readFileSync(file)), exists: true }));
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { combined_sha256: sha256(files.map(file => `${file.path}:${file.sha256}`).join('\n')), files };
}

function safeProjectPath(declaredPath) {
  if (!nonEmpty(declaredPath) || path.isAbsolute(declaredPath)) return null;
  const resolved = path.resolve(projectRoot, declaredPath);
  return resolved.startsWith(`${projectRoot}${path.sep}`) ? resolved : null;
}

function isPng(filePath) {
  const signature = fs.readFileSync(filePath).subarray(0, 8);
  return signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function atomicWriteJson(filePath, value) { atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`); }
function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
function gitRevision() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function normalizePath(value) { return value.split(path.sep).join('/'); }
function relative(value) { return normalizePath(path.relative(projectRoot, value)); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function isIsoDate(value) { return nonEmpty(value) && Number.isFinite(Date.parse(value)); }
function normalizeDecision(value) { return String(value ?? '').toUpperCase().replace('-', '_'); }
function unique(values) { return [...new Set(values)].sort(); }
function sameSet(left, right) { return JSON.stringify(unique(left)) === JSON.stringify(unique(right)); }
function dedupeGaps(items) { return dedupeObjects(items, item => `${item.task_id}|${item.code}|${item.scope}|${item.reason}`); }
function dedupeObjects(items, key) { const seen = new Set(); return items.filter(item => { const id = key(item); if (seen.has(id)) return false; seen.add(id); return true; }); }
function countBy(items, key) { return items.reduce((counts, item) => { const value = key(item); counts[value] = (counts[value] ?? 0) + 1; return counts; }, {}); }
function formatCounts(counts) { return Object.entries(counts ?? {}).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'; }
function transportState(service, transport) { return service?.transports?.[transport]?.connected ? 'live' : 'unobserved'; }
function escapeMd(value) { return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
