#!/usr/bin/env node

'use strict';

/*
 * SVD-115 is deliberately a second reader of the release evidence.  It does
 * not invoke any evidence producer and it does not accept aggregate counts as
 * a replacement for the catalogues it verifies.  This makes it useful for a
 * closeout review: a bad or incomplete SVD-114 report cannot make this replay
 * silently pass by itself.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outputPath = path.join(evidenceRoot, 'independent-all-app-release-replay.json');
const REQUIRED_PROFILES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const REQUIRED_MODALITIES = ['display', 'camera', 'microphone', 'speaker', 'input'];
const REQUIRED_KDA_KEYS = Object.freeze({
  ipfs_kit_py: 'K',
  ipfs_datasets_py: 'D',
  ipfs_accelerate_py: 'A',
});
const REQUIRED_SVD_182_ACCEPTANCE = [
  'every_canonical_app_traced', 'every_primary_workflow_passed',
  'every_kda_disposition_and_receipt_passed', 'every_ui_ux_record_passed',
  'every_applicable_orb_idl_state_passed', 'every_applicable_meta_simulator_state_passed',
];
const REQUIRED_SVD_181_ACCEPTANCE = [
  'every_canonical_app_covered', 'primary_roles_separate_from_diagnostic_status',
  'real_safe_read_over_http_and_libp2p_for_each_reachable_server',
  'did_descriptor_cid_policy_receipt_event_dag_preserved',
  'governed_writes_confirmation_gated_dry_run', 'direct_backend_details_exposed_to_apps',
];

const INPUTS = {
  release_evidence: ['release-evidence.json', 'SVD-114', 'swissknife.virtual-desktop-release-evidence.v2'],
  app_catalog: ['app-backend-contract.json', 'SWR-113', 'swissknife.virtual-desktop-app-backend-contract.v1'],
  live_bindings: ['all-app-live-tool-bindings.json', 'SVD-104', 'swissknife.all-app-live-tool-bindings-evidence.v1'],
  tool_dispositions: ['all-tools-disposition-catalog.json', 'SVD-105', 'swissknife.all-tools-disposition-catalog.v1'],
  supervisor_console: ['agent-supervisor-console-e2e.json', 'SWR-107', 'swissknife.agent_supervisor_console_e2e.v1'],
  profile_transport: ['all-app-mcpplusplus-profile-interoperability.json', 'SVD-127', 'swissknife.all-app-mcpplusplus-profile-interoperability.v2'],
  action_handoff: ['all-app-orb-idl-action-handoff.json', 'SVD-110', 'swissknife.all-app-orb-idl-action-handoff.v1'],
  meta_simulator: ['all-app-meta-device-simulator-proof.json', 'SVD-111', 'swissknife.all-app-meta-device-simulator-proof.v1'],
  ui_accessibility: ['all-app-ui-ux-accessibility.json', 'SVD-112', 'swissknife.all-app-ui-ux-accessibility.v1'],
  dispatch_artifact_store: ['supervisor-dispatch-artifact-store.json', 'SVD-113', 'swissknife.supervisor-dispatch-artifact-store-evidence.v1'],
  app_improvement_index: ['app-improvement/index.json', 'SVD-133', 'swissknife.virtual-desktop-all-app-improvement.v1'],
  app_improvement_screenshots: ['app-improvement/screenshot-index.json', 'SVD-180', 'swissknife.virtual-desktop-app-improvement.screenshot-index.v1'],
  app_improvement_ui: ['app-improvement/ui-ux-accessibility.json', 'SVD-180', 'swissknife.virtual-desktop-app-improvement.ui-ux-accessibility.v1'],
  all_app_tool_matrix: ['app-improvement/all-app-tool-matrix.json', 'SVD-181', 'swissknife.virtual-desktop.all-app-tool-matrix.v1'],
  kda_receipt_catalog: ['app-improvement/http-libp2p-kda-receipt-catalog.json', 'SVD-181', 'swissknife.mcpplusplus.http-libp2p-kda-receipt-catalog.v1'],
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isPassingDecision(value) {
  return ['GO', 'PASSED', 'PASS'].includes(String(value ?? '').toUpperCase());
}

function isCid(value) {
  return typeof value === 'string' && /^b[a-z2-7]{58}$/.test(value);
}

function isDid(value) {
  return typeof value === 'string' && /^did:key:/.test(value);
}

function readInput(id, definition, finding) {
  const [file, taskId, schema] = definition;
  const absolute = path.join(evidenceRoot, file);
  const input = { id, task_id: taskId, path: `test-results/virtual-desktop-ipfs-mcp-orb/${file}`, schema, status: 'missing', sha256: null, generated_at: null, data: null };
  if (!fs.existsSync(absolute)) {
    finding(taskId, 'missing_evidence', input.path, `Required ${id} evidence is absent.`, `Regenerate ${taskId} evidence before replaying the closeout.`);
    return input;
  }
  try {
    const bytes = fs.readFileSync(absolute);
    input.data = JSON.parse(bytes);
    input.sha256 = sha256(bytes);
    input.generated_at = input.data.generated_at ?? null;
    input.status = 'present';
  } catch (error) {
    input.status = 'invalid';
    finding(taskId, 'invalid_json', input.path, `Evidence cannot be read as JSON: ${error.message}`, `Repair and regenerate ${taskId} evidence.`);
    return input;
  }
  if (input.data.schema !== schema) {
    finding(taskId, 'unexpected_schema', input.path, `Expected ${schema}; observed ${input.data.schema ?? 'none'}.`, `Regenerate ${taskId} evidence with its canonical producer.`);
  }
  if (input.data.task_id !== taskId) {
    finding(taskId, 'unexpected_task_id', input.path, `Expected task ID ${taskId}; observed ${input.data.task_id ?? 'none'}.`, `Use evidence owned by ${taskId}.`);
  }
  return input;
}

function replay({ now = new Date().toISOString() } = {}) {
  const findings = [];
  const finding = (taskId, code, evidencePath, reason, remediation, details = {}) => {
    findings.push({ task_id: taskId, code, evidence_path: evidencePath, reason, remediation, ...details });
  };
  const inputs = Object.fromEntries(Object.entries(INPUTS).map(([id, definition]) => [id, readInput(id, definition, finding)]));
  const data = Object.fromEntries(Object.entries(inputs).map(([id, input]) => [id, input.data ?? {}]));

  validateReleaseFreshness(data.release_evidence, inputs.release_evidence.path, finding);
  const appIds = validateApplicationCatalog(data.app_catalog, inputs.app_catalog.path, finding);
  const bindingAppIds = validateBindings(data.live_bindings, appIds, inputs.live_bindings.path, finding);
  validateDispositionCatalog(data.tool_dispositions, inputs.tool_dispositions.path, finding);
  validateSupervisorConsole(data.supervisor_console, inputs.supervisor_console.path, finding);
  validateProfiles(data.profile_transport, inputs.profile_transport.path, finding);
  validateActionHandoffs(data.action_handoff, data.live_bindings, bindingAppIds, inputs.action_handoff.path, finding);
  validateMetaSimulator(data.meta_simulator, bindingAppIds, inputs.meta_simulator.path, finding);
  validateUiGate(data.ui_accessibility, appIds, inputs.ui_accessibility.path, finding);
  validateCidEventDagPersistence(data.dispatch_artifact_store, inputs.dispatch_artifact_store.path, finding);
  validateAllAppImprovementReleaseTrace(data, inputs, appIds, finding);

  const namedFindings = findings.sort((left, right) => `${left.task_id}:${left.code}`.localeCompare(`${right.task_id}:${right.code}`));
  return {
    schema: 'swissknife.independent-all-app-release-replay.v1',
    task_id: 'SVD-115',
    generated_at: now,
    replay_boundary: {
      independent_of: ['scripts/build-virtual-desktop-release-evidence.cjs', 'scripts/release-readiness-gate.mjs'],
      statement: 'This receipt independently reads canonical inputs. It neither produces evidence nor treats release aggregates as substitutes for catalog-level checks.',
    },
    inputs: Object.fromEntries(Object.entries(inputs).map(([id, input]) => [id, {
      task_id: input.task_id, path: input.path, expected_schema: input.schema, observed_schema: input.data?.schema ?? null,
      status: input.status, generated_at: input.generated_at, sha256: input.sha256,
    }])),
    coverage: {
      application_catalog: { expected_app_count: appIds.length, app_ids: appIds },
      declared_backend_bindings: { binding_count: Array.isArray(data.live_bindings.bindings) ? data.live_bindings.bindings.length : 0 },
      all_tools_dispositions: { entry_count: Array.isArray(data.tool_dispositions.entries) ? data.tool_dispositions.entries.length : 0 },
      transport_profiles: REQUIRED_PROFILES,
      simulator_modalities: REQUIRED_MODALITIES,
      app_improvement_traces: {
        expected_app_count: appIds.length,
        observed_trace_count: data.release_evidence?.all_app_improvement_release_gate?.trace_count ?? 0,
      },
    },
    findings: namedFindings,
    decision: {
      status: namedFindings.length === 0 ? 'GO' : 'NO_GO',
      blocker_count: namedFindings.length,
      blocker_task_ids: unique(namedFindings.map(item => item.task_id)),
      statement: namedFindings.length === 0
        ? 'GO is permitted because current release evidence and every independently replayed closeout surface passed.'
        : 'NO_GO: only the listed unfinished SVD/SWR task IDs may close these specific replay findings.',
    },
  };
}

function validateReleaseFreshness(release, evidencePath, finding) {
  if (!isPassingDecision(release.decision?.status) || Number(release.decision?.blocker_count) !== 0) {
    finding('SVD-114', 'release_not_go', evidencePath, 'The freshness-aware release receipt is not a zero-blocker GO.', 'Run the SVD-114 generator and resolve every named gap.');
  }
  if (!Array.isArray(release.named_gaps) || release.named_gaps.length !== 0) {
    finding('SVD-114', 'release_named_gaps', evidencePath, 'Current release evidence contains named gaps or lacks a named-gap catalogue.', 'Resolve the named SVD task IDs and rebuild SVD-114 evidence.');
  }
  const artifacts = Object.values(release.artifacts ?? {});
  if (artifacts.length === 0 || artifacts.some(artifact => artifact.status !== 'present' || !['current', 'fresh'].includes(artifact.freshness))) {
    finding('SVD-114', 'release_inputs_not_current', evidencePath, 'Every SVD-114 input must be present and current at replay time.', 'Refresh the stale or missing evidence identified by SVD-114.');
  }
}

function validateApplicationCatalog(catalog, evidencePath, finding) {
  const apps = Array.isArray(catalog.apps) ? catalog.apps : [];
  const appIds = apps.map(app => app.app_id).filter(Boolean);
  if (appIds.length === 0 || new Set(appIds).size !== appIds.length) {
    finding('SWR-113', 'invalid_application_catalog', evidencePath, 'The canonical application catalog is empty or contains duplicate app IDs.', 'Regenerate the executable application backend contract.');
  }
  if (catalog.app_count !== appIds.length || catalog.canonical_app_count !== appIds.length || catalog.validation?.valid !== true || catalog.coverage?.omitted_app_count !== 0) {
    finding('SWR-113', 'incomplete_application_catalog', evidencePath, 'Catalog counts or validation do not prove a complete canonical app catalog.', 'Resolve catalog validation and omission findings in SWR-113.');
  }
  return unique(appIds);
}

function validateBindings(bindingsEvidence, appIds, evidencePath, finding) {
  const bindings = Array.isArray(bindingsEvidence.bindings) ? bindingsEvidence.bindings : [];
  if (bindings.length === 0) {
    finding('SVD-104', 'missing_backend_bindings', evidencePath, 'No declared backend bindings were replayed.', 'Capture the canonical live binding evidence.');
    return [];
  }
  const appSet = new Set(appIds);
  const missingApp = bindings.filter(binding => !appSet.has(binding.app_id));
  const incomplete = bindings.filter(binding => !binding.app_id || !binding.binding_id || !binding.capability_id || !binding.intent_id || !binding.owner || !Array.isArray(binding.transports) || binding.transports.length === 0);
  if (missingApp.length || incomplete.length) {
    finding('SVD-104', 'invalid_backend_binding', evidencePath, 'A declared binding lacks an app/capability/tool/owner or references an app outside the catalog.', 'Repair the SVD-104 binding ledger.', { invalid_binding_count: missingApp.length + incomplete.length });
  }
  return unique(bindings.map(binding => binding.app_id));
}

function validateDispositionCatalog(catalog, evidencePath, finding) {
  const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
  if (!isPassingDecision(catalog.decision) || entries.length === 0) {
    finding('SVD-105', 'missing_tool_disposition_catalog', evidencePath, 'The all-tools disposition catalog is absent, empty, or non-GO.', 'Recapture SVD-105 all-tools dispositions.');
    return;
  }
  const invalid = entries.filter(entry => !entry.entry_id || !entry.tool_id || !entry.owner || !entry.disposition?.kind ||
    (!entry.disposition?.app_id && !entry.disposition?.review_surface && !entry.disposition?.rationale) ||
    !entry.reachability?.observations?.length ||
    entry.reachability.observations.some(observation => !observation.transport || !observation.state || (!observation.evidence_id && !observation.rationale)));
  if (invalid.length) finding('SVD-105', 'unclassified_tool_disposition', evidencePath, 'Every tool must have an owner and an allowed explicit disposition.', 'Classify the named tools in SVD-105.', { invalid_tool_count: invalid.length });
}

function validateSupervisorConsole(consoleEvidence, evidencePath, finding) {
  const summary = consoleEvidence.summary ?? {};
  const scenarios = Array.isArray(consoleEvidence.scenarios) ? consoleEvidence.scenarios : [];
  if (!isPassingDecision(consoleEvidence.decision) || consoleEvidence.console_app?.app_id !== 'agent-supervisor' ||
      !summary.required_path_count || summary.observed_required_path_count !== summary.required_path_count ||
      !summary.receipt_count || scenarios.length === 0 || !Array.isArray(consoleEvidence.blockers) || consoleEvidence.blockers.length !== 0) {
    finding('SWR-107', 'supervisor_lifecycle_incomplete', evidencePath, 'Supervisor Console lifecycle paths, receipts, or zero-blocker status are incomplete.', 'Re-run the Supervisor Console lifecycle validation.');
  }
}

function validateProfiles(profileEvidence, evidencePath, finding) {
  const profiles = Array.isArray(profileEvidence.profiles) ? profileEvidence.profiles : [];
  const ids = profiles.map(profile => String(profile.profile ?? profile.id ?? '').replace(/^profile[-_]?/i, '').toUpperCase());
  const missing = REQUIRED_PROFILES.filter(profile => !ids.includes(profile));
  if (!isPassingDecision(profileEvidence.decision) || missing.length || profileEvidence.coverage?.all_profiles_represented !== true || !Number(profileEvidence.coverage?.application_transport_observation_count)) {
    finding('SVD-127', 'profile_transport_incomplete', evidencePath, `Profiles A-H require observed transport behavior; missing: ${missing.join(', ') || 'none'}.`, 'Re-run SVD-127 profile interoperability evidence.', { missing_profiles: missing });
  }
}

function validateActionHandoffs(handoff, bindingsEvidence, appIds, evidencePath, finding) {
  const packets = Array.isArray(handoff.packets) ? handoff.packets : [];
  const represented = new Set(packets.map(packet => packet.app_id).filter(Boolean));
  const missing = appIds.filter(appId => !represented.has(appId));
  const bindingIds = new Set((bindingsEvidence.bindings ?? []).map(binding => binding.binding_id));
  const packetBindingIds = new Set(packets.filter(packet => packet.binding_id).map(packet => packet.binding_id));
  const missingBindings = [...bindingIds].filter(bindingId => !packetBindingIds.has(bindingId));
  const invalid = packets.filter(packet => !packet.interface_cid || !packet.action_id || !packet.peer_did || !packet.correlation_id || !Array.isArray(packet.receipt_refs) || !packet.receipt_refs.length || !Array.isArray(packet.event_dag_refs) || !packet.event_dag_refs.length);
  if (!packets.length || handoff.packet_count !== packets.length || handoff.live_binding_packet_count !== bindingIds.size || missing.length || missingBindings.length || invalid.length) {
    finding('SVD-110', 'orb_idl_handoff_incomplete', evidencePath, 'ORB/IDL packets must cover every declared backend binding and retain CID, peer, correlation, receipt, and event-DAG handoff fields.', 'Regenerate SVD-110 action-handoff packets.', { missing_app_ids: missing, missing_binding_ids: missingBindings, invalid_packet_count: invalid.length });
  }
}

function validateMetaSimulator(simulator, appIds, evidencePath, finding) {
  const acceptance = simulator.acceptance ?? {};
  const modalities = simulator.modality_summary ?? {};
  const packets = Array.isArray(simulator.packets) ? simulator.packets : [];
  const missingModalities = REQUIRED_MODALITIES.filter(modality => !Object.keys(modalities).some(key => key === modality || key.startsWith(`${modality}.`)));
  const replayedApps = new Set(packets.map(packet => packet.app_id).filter(Boolean));
  const missingApps = appIds.filter(appId => !replayedApps.has(appId));
  if (simulator.status !== 'passed' || Object.values(acceptance).some(value => value !== true) || missingModalities.length || missingApps.length || simulator.boundary?.physical_hardware_claimed === true) {
    finding('SVD-111', 'meta_simulator_incomplete', evidencePath, 'Meta simulator replay must cover all modalities/apps without claiming physical-device pairing.', 'Re-run SVD-111 simulator evidence.', { missing_modalities: missingModalities, missing_app_ids: missingApps });
  }
}

function validateUiGate(uiEvidence, appIds, evidencePath, finding) {
  const applications = Array.isArray(uiEvidence.applications) ? uiEvidence.applications : [];
  const observed = new Set(applications.map(application => application.app_id).filter(Boolean));
  const missing = appIds.filter(appId => !observed.has(appId));
  if (uiEvidence.status !== 'passed' || Object.values(uiEvidence.acceptance ?? {}).some(value => value !== true) || missing.length || Number(uiEvidence.browser_failures?.length ?? 0) !== 0) {
    finding('SVD-112', 'ui_ux_gate_incomplete', evidencePath, 'The UI/UX gate must pass every catalog app on its declared viewports with visible recovery.', 'Re-run SVD-112 UI/UX accessibility evidence.', { missing_app_ids: missing });
  }
}

function validateCidEventDagPersistence(store, evidencePath, finding) {
  const valid = isPassingDecision(store.decision) && store.persistence?.state === 'stored' &&
    Boolean(store.persistence.dispatch_cid) && Boolean(store.persistence.compaction_certificate_cid) &&
    store.retrieval?.local?.verified === true && store.retrieval?.kit?.verified === true && store.retrieval?.kubo?.verified === true &&
    store.fallback?.cache?.verified === true && store.fallback?.exhausted?.state === 'unavailable' &&
    typeof store.unavailable_state === 'string' && store.unavailable_state.length > 0 && Boolean(store.validation?.command);
  if (!valid) {
    finding('SVD-113', 'cid_event_dag_persistence_incomplete', evidencePath, 'CID/event-DAG persistence, retrieval, fallback, and unavailable-state evidence is incomplete.', 'Re-run SVD-113 dispatch artifact storage validation.');
  }
}

function validateAllAppImprovementReleaseTrace(data, inputs, appIds, finding) {
  const releaseGate = data.release_evidence?.all_app_improvement_release_gate;
  const traces = Array.isArray(releaseGate?.traces) ? releaseGate.traces : [];
  const traceIds = traces.map(trace => trace?.app_id).filter(Boolean);
  const releaseGatePassed = releaseGate?.schema === 'swissknife.virtual-desktop-all-app-release-trace.v1'
    && releaseGate?.task_id === 'SVD-182' && releaseGate?.decision === 'GO'
    && releaseGate?.required_app_count === appIds.length && releaseGate?.trace_count === appIds.length
    && releaseGate?.passing_app_count === appIds.length && releaseGate?.blocker_count === 0
    && Array.isArray(releaseGate?.remaining_gap_task_ids) && releaseGate.remaining_gap_task_ids.length === 0
    && sameIds(Object.keys(releaseGate?.acceptance ?? {}).sort(), [...REQUIRED_SVD_182_ACCEPTANCE].sort())
    && REQUIRED_SVD_182_ACCEPTANCE.every(key => releaseGate.acceptance[key] === true)
    && sameUnorderedIds(traceIds, appIds) && traces.every(trace => trace?.status === 'passed'
      && trace?.primary_workflow?.status === 'passed'
      && trace?.backend_disposition?.status === 'passed'
      && trace?.ui_ux?.status === 'passed'
      && ['passed', 'not_applicable'].includes(trace?.orb_idl?.status)
      && ['passed', 'not_applicable'].includes(trace?.meta_simulator?.status));
  if (!releaseGatePassed) finding('SVD-182', 'all_app_release_trace_incomplete', inputs.release_evidence.path,
    'The release receipt does not contain exactly one passing SVD-182 trace for every canonical app.',
    'Rebuild SVD-182 from current SVD-133, SVD-180, SVD-181, ORB/IDL, and Meta simulator evidence.');

  const improvementApps = Array.isArray(data.app_improvement_index?.apps) ? data.app_improvement_index.apps : [];
  const improvementPassed = data.app_improvement_index?.scope === 'all'
    && data.app_improvement_index?.summary?.failed === 0
    && data.app_improvement_index?.summary?.passed === appIds.length
    && sameUnorderedIds(improvementApps.map(app => app?.app_id), appIds)
    && improvementApps.every(app => app?.pass === true
      && app?.desktop?.primary_control?.action_succeeded === true
      && app?.mobile?.primary_control?.action_succeeded === true
      && app?.desktop?.states?.recovery?.closed_to_desktop === true
      && app?.mobile?.states?.recovery?.closed_to_desktop === true
      && typeof app?.manifest_ux_scenarios?.success === 'string'
      && typeof app?.manifest_ux_scenarios?.error === 'string'
      && typeof app?.manifest_ux_scenarios?.fallback === 'string');
  if (!improvementPassed) finding('SVD-133', 'primary_workflow_index_incomplete', inputs.app_improvement_index.path,
    'The current app-improvement index does not prove a named primary action and failure/recovery path for all canonical apps.',
    'Regenerate the complete app-improvement index from the canonical desktop.');

  const screenshots = data.app_improvement_screenshots;
  const ui = data.app_improvement_ui;
  const uiApps = Array.isArray(ui?.applications) ? ui.applications : [];
  const uiPassed = screenshots?.task_id === 'SVD-180' && screenshots?.screenshot_count === appIds.length * 2
    && Array.isArray(screenshots?.screenshots) && screenshots.screenshots.length === appIds.length * 2
    && screenshots.screenshots.every(row => row?.exists === true && row?.bytes > 0 && row?.layout_pass === true)
    && ui?.status === 'passed' && Object.values(ui?.acceptance ?? {}).every(value => value === true)
    && sameUnorderedIds(uiApps.map(app => app?.app_id), appIds) && uiApps.every(app => app?.pass === true);
  if (!uiPassed) finding('SVD-180', 'app_improvement_ui_incomplete', inputs.app_improvement_ui.path,
    'The phase-25 desktop/narrow UI/UX report or its 90-entry screenshot index is incomplete.',
    'Re-run the SVD-180 viewport matrix and accessibility validation.');

  const matrix = data.all_app_tool_matrix;
  const matrixApps = Array.isArray(matrix?.apps) ? matrix.apps : [];
  const liveBindings = Array.isArray(data.live_bindings?.bindings) ? data.live_bindings.bindings : [];
  const matrixPassed = matrix?.status === 'passed' && sameUnorderedIds(matrixApps.map(app => app?.app_id), appIds)
    && sameIds(Object.keys(matrix?.acceptance ?? {}).sort(), [...REQUIRED_SVD_181_ACCEPTANCE].sort())
    && REQUIRED_SVD_181_ACCEPTANCE.every(key => key === 'direct_backend_details_exposed_to_apps'
      ? matrix.acceptance[key] === false : matrix.acceptance[key] === true)
    && matrixApps.every(app => Array.isArray(app?.diagnostic_kda_status?.rows)
      && app.diagnostic_kda_status.rows.length === 3
      && new Set(app.diagnostic_kda_status.rows.map(row => row?.owner)).size === 3
      && new Set(app.diagnostic_kda_status.rows.map(row => row?.kda_key)).size === 3
      && app.diagnostic_kda_status.rows.every(row => row?.diagnostic_only === true
        && REQUIRED_KDA_KEYS[row?.owner] === row?.kda_key && row?.state && row?.reason)
      && Array.isArray(app?.semantic_backend_roles?.roles)
      && backendRolesMatchBindings(app, liveBindings.filter(binding => binding?.app_id === app?.app_id))
      && app.semantic_backend_roles.roles.every(role => Array.isArray(role?.executions) && role.executions.length > 0
        && role.executions.every(execution => execution?.correlation_id && isCid(execution?.descriptor_cid)
          && execution?.did_identity?.verified === true && isDid(execution?.did_identity?.remote_did)
          && isCid(execution?.did_identity?.identity_proof_cid) && execution?.policy?.decision_id
          && isCid(execution?.receipt_cid) && isCid(execution?.event_dag_cid)
          && execution?.persistence_status === 'persisted'
          && compiledExecutionPolicyPasses(role, execution))));
  if (!matrixPassed) finding('SVD-181', 'all_app_tool_matrix_incomplete', inputs.all_app_tool_matrix.path,
    'The all-app matrix does not preserve distinct K/D/A dispositions and call-bound live receipts for every semantic role.',
    'Regenerate SVD-181 from current gateway and peer evidence.');

  const catalog = data.kda_receipt_catalog;
  const servers = Array.isArray(catalog?.servers) ? catalog.servers : [];
  const catalogPassed = catalog?.status === 'passed' && servers.length === 3
    && new Set(servers.map(server => server?.owner)).size === 3
    && new Set(servers.map(server => server?.kda_key)).size === 3
    && servers.every(server => REQUIRED_KDA_KEYS[server?.owner] === server?.kda_key)
    && servers.every(server => ['http', 'libp2p'].every(transport => {
      const row = server?.transports?.[transport];
      return row?.real_safe_read === true && row?.application_safe_read === true && row?.no_transport_fallback === true
        && isCid(row?.receipt_cid) && isCid(row?.event_dag_cid) && isCid(row?.descriptor_cid)
        && isCid(row?.identity_proof_cid) && isDid(row?.remote_did)
        && row?.policy?.policy_outcome === 'allow';
    }));
  if (!catalogPassed) finding('SVD-181', 'kda_receipt_catalog_incomplete', inputs.kda_receipt_catalog.path,
    'The K/D/A server catalog lacks a real safe-read receipt over HTTP or libp2p.',
    'Re-run SVD-181 independent server reads and preserve DID, descriptor, policy, receipt, and event-DAG evidence.');
}

function compiledExecutionPolicyPasses(role, execution) {
  if (role?.mutates_remote_state === true) {
    return execution?.operation_class === 'governed_write_request'
      && execution?.execution_mode === 'confirmation_gated_dry_run'
      && execution?.policy?.outcome === 'require_confirmation'
      && execution?.policy?.consent === 'granted'
      && execution?.policy?.dry_run === true
      && execution?.confirmation?.required === true
      && execution?.confirmation?.policy !== 'none'
      && execution?.confirmation?.dry_run === true;
  }
  return execution?.operation_class === 'read_request'
    && ['real_safe_read', 'safe_read_dry_run'].includes(execution?.execution_mode)
    && execution?.policy?.outcome === 'allow'
    && execution?.policy?.consent === 'not_required'
    && execution?.confirmation?.required === false
    && execution?.confirmation?.dry_run === (execution.execution_mode === 'safe_read_dry_run');
}

function backendRolesMatchBindings(app, expectedBindings) {
  const roles = app?.semantic_backend_roles?.roles ?? [];
  if (roles.length !== expectedBindings.length) return false;
  if (new Set(roles.map(role => role?.binding_id)).size !== roles.length) return false;
  return expectedBindings.every(binding => {
    const role = roles.find(candidate => candidate?.binding_id === binding?.binding_id);
    const expectedTransports = [...new Set(binding?.transports ?? [])].sort();
    const observedTransports = [...new Set((role?.executions ?? []).map(execution => execution?.transport))].sort();
    return role?.owner === binding?.owner && sameIds(observedTransports, expectedTransports);
  });
}

function sameIds(observed, expected) {
  return Array.isArray(observed) && observed.length === expected.length
    && observed.every((value, index) => value === expected[index])
    && new Set(observed).size === observed.length;
}

function sameUnorderedIds(observed, expected) {
  if (!Array.isArray(observed) || !Array.isArray(expected)
    || observed.length !== expected.length
    || new Set(observed).size !== observed.length
    || new Set(expected).size !== expected.length) return false;
  const expectedSet = new Set(expected);
  return observed.every(value => expectedSet.has(value));
}

function atomicWriteJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, target);
}

function main() {
  const report = replay();
  atomicWriteJson(outputPath, report);
  console.log(JSON.stringify({ schema: report.schema, task_id: report.task_id, decision: report.decision.status, blocker_task_ids: report.decision.blocker_task_ids, output: path.relative(projectRoot, outputPath) }, null, 2));
  process.exitCode = report.decision.status === 'GO' ? 0 : 1;
}

if (require.main === module) main();

module.exports = {
  _test: {
    replay,
    validateApplicationCatalog,
    validateProfiles,
    validateDispositionCatalog,
    validateAllAppImprovementReleaseTrace,
    compiledExecutionPolicyPasses,
    REQUIRED_PROFILES,
  },
};
