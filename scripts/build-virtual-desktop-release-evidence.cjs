#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const canonicalAppContractPath = path.join(evidenceRoot, 'app-backend-contract.json');
const freshnessReceiptPath = path.join(projectRoot, 'docs', 'virtual-desktop-release-evidence.fingerprint.json');
const supervisorQueuePath = path.join(workspaceRoot, 'data', 'swissknife_virtual_desktop', 'all_tools_supervisor_queue.json');
const CLOSEOUT_TASK_ID = 'SVD-060';
let taskOwnerCache;
const outputPaths = {
  json: path.join(evidenceRoot, 'release-evidence.json'),
  markdown: path.join(evidenceRoot, 'all-tools-release-evidence.md'),
  signoff: path.join(projectRoot, 'docs', 'refactor-final-signoff.md'),
  discovery: path.join(workspaceRoot, 'data', 'swissknife_virtual_desktop', 'discovery', 'all-tools-no-new-unknowns.md'),
  // The backlog validation runs after `cd swissknife` but names the
  // workspace-relative data path. Keep a generated mirror so that historical
  // command remains executable while the workspace-level file stays canonical.
  discoveryValidationMirror: path.join(projectRoot, 'data', 'swissknife_virtual_desktop', 'discovery', 'all-tools-no-new-unknowns.md'),
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

function main() {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  // SVD-114 deliberately does not regenerate, synthesize, or fall back to
  // earlier receipts here.  A release builder is a verifier: invoking an
  // unrelated fixture/compiler to fill a missing input is precisely the
  // placeholder loophole this gate is intended to close.
  const report = buildFreshReleaseReport();

  atomicWriteJson(outputPaths.json, report);
  atomicWrite(outputPaths.markdown, renderFreshReleaseMarkdown(report));
  atomicWrite(outputPaths.signoff, renderFreshReleaseSignoff(report));
  const discoveryReport = renderFreshReleaseDiscovery(report);
  atomicWrite(outputPaths.discovery, discoveryReport);
  atomicWrite(outputPaths.discoveryValidationMirror, discoveryReport);
  certifyAggregateFreshness();

  console.log(JSON.stringify({
    schema: report.schema,
    task_id: report.task_id,
    decision: report.decision.status,
    blocker_count: report.decision.blocker_count,
    blocker_task_ids: report.decision.blocker_task_ids,
    outputs: Object.values(outputPaths).map(relative),
  }, null, 2));
}

/**
 * SVD-071 and SVD-072 are deterministic releases of reviewed source inputs.
 * They used to be emitted as a side effect of a Playwright spec, which meant
 * a clean release checkout could retain a stale or missing final handoff even
 * though the source compiler was available.  Regenerate and validate both
 * packets before evaluating the SVD-066 aggregate receipt.
 */
function refreshExpandedIoReleaseInputs() {
  const tsx = path.join(projectRoot, 'node_modules', '.bin', 'tsx');
  const builder = path.join(projectRoot, 'scripts', 'build-agent-supervisor-expanded-io-release-inputs.ts');
  if (!fs.existsSync(tsx)) {
    throw new Error('Cannot refresh SVD-071/SVD-072 release inputs: local tsx runtime is unavailable.');
  }
  execFileSync(tsx, [builder], { cwd: projectRoot, stdio: 'pipe' });
}

// A wall-clock timestamp is only useful when it is bounded.  The same
// 24-hour/60-second policy is used by the live-binding ledger.  Keeping it in
// the receipt makes an old but content-addressed artifact incapable of being
// re-certified merely by rebuilding this aggregate.
const RELEASE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RELEASE_EVIDENCE_FUTURE_SKEW_MS = 60 * 1000;

const FRESH_RELEASE_INPUTS = [
  ['binding_gap_ledger', 'all-app-live-binding-gap-ledger.json', 'SVD-102', 'swissknife.all-app-live-binding-gap-ledger.v1'],
  ['live_bindings', 'all-app-live-tool-bindings.json', 'SVD-104', 'swissknife.all-app-live-tool-bindings-evidence.v1'],
  ['tool_disposition_catalog', 'all-tools-disposition-catalog.json', 'SVD-105', 'swissknife.all-tools-disposition-catalog.v1'],
  ['live_behavior', 'all-app-live-behavior-proof.json', 'SVD-106', 'swissknife.all-app-live-behavior-proof.v1'],
  ['profile_interoperability', 'all-app-mcpplusplus-profile-interoperability.json', 'SVD-109', 'swissknife.all-app-mcpplusplus-profile-interoperability.v1'],
  ['action_handoff', 'all-app-orb-idl-action-handoff.json', 'SVD-110', 'swissknife.all-app-orb-idl-action-handoff.v1'],
  ['meta_simulator', 'all-app-meta-device-simulator-proof.json', 'SVD-111', 'swissknife.all-app-meta-device-simulator-proof.v1'],
  ['ui_accessibility', 'all-app-ui-ux-accessibility.json', 'SVD-112', 'swissknife.all-app-ui-ux-accessibility.v1'],
  ['dispatch_artifact_store', 'supervisor-dispatch-artifact-store.json', 'SVD-113', 'swissknife.supervisor-dispatch-artifact-store-evidence.v1'],
  ['merge_reconciliation', 'submodule-merge-reconciliation.json', 'SVD-116', 'swissknife.submodule-merge-reconciliation-evidence.v1'],
];

function buildFreshReleaseReport({ now = Date.now() } = {}) {
  const findings = [];
  const add = (details) => findings.push(normalizeReleaseFinding(details));
  const inputs = {};
  for (const [id, file, taskId, schema] of FRESH_RELEASE_INPUTS) {
    inputs[id] = readFreshReleaseInput(id, file, taskId, schema, now, add);
  }

  // The canonical app inventory and transport proof are required primary
  // sources, not optional legacy fallbacks. Browser bindings are intentionally
  // validated from the executable binding receipt below: the all-tools backend
  // inventory has a broader purpose and is not a one-to-one binding catalog.
  const contract = readFreshReleaseInput('app_backend_contract', 'app-backend-contract.json', 'SWR-113', 'swissknife.virtual-desktop-app-backend-contract.v1', now, add);
  const peer = readFreshReleaseInput('peer_interoperability', 'swissknife-all-tools-peer-evidence.json', 'SVD-100', 'swissknife.all_tools_peer_interoperability_evidence.v1', now, add);
  inputs.app_backend_contract = contract;
  inputs.peer_interoperability = peer;

  validateFreshToolBackedPairs(inputs.live_bindings.data, inputs.live_behavior.data, add);
  validateFreshCatalog(inputs.tool_disposition_catalog.data, peer.data, add);
  validateFreshTransportEvidence(inputs.profile_interoperability.data, add);
  validateFreshSimulatorEvidence(inputs.meta_simulator.data, add);
  validateFreshMergeReconciliation(inputs.merge_reconciliation.data, add);

  const namedGaps = dedupeFreshFindings(findings);
  const decision = namedGaps.length === 0 ? 'GO' : 'NO_GO';
  const appIds = unique((contract.data?.apps ?? []).map(app => app.app_id).filter(nonEmpty));
  const matrix = freshAppMatrix(appIds, namedGaps);
  return {
    schema: 'swissknife.virtual-desktop-release-evidence.v2',
    task_id: 'SVD-114',
    generated_at: new Date(now).toISOString(),
    freshness_policy: {
      maximum_age_ms: RELEASE_EVIDENCE_MAX_AGE_MS,
      future_skew_ms: RELEASE_EVIDENCE_FUTURE_SKEW_MS,
      statement: 'Every input receipt must be present, schema/task attributable, and captured within the release freshness window. Descriptor, fixture, and static claims never prove execution.',
    },
    artifacts: Object.fromEntries(Object.entries(inputs).map(([id, input]) => [id, freshArtifactView(input)])),
    application_count: appIds.length,
    virtual_desktop_app_matrix_gate: matrix,
    swr110_release_gate: {
      decision: decision === 'GO' ? 'go' : 'no_go', release_decision: decision,
      blocker_count: namedGaps.length,
      required_mcp_servers: REQUIRED_SERVICES,
      required_orb_modalities: REQUIRED_MODALITIES,
      required_simulator_capabilities: REQUIRED_MODALITIES,
      required_supervisor_paths: EXPECTED_SUPERVISOR_CAPABILITIES,
      missing_evidence_paths: namedGaps.filter(item => item.code.startsWith('missing_') || item.code.startsWith('invalid_') || item.code.startsWith('stale_')).map(item => item.evidence_path),
      representative_blockers: namedGaps.map(freshFindingSummary), all_tools_blockers: namedGaps.filter(item => item.tool).map(freshFindingSummary),
    },
    named_gaps: namedGaps,
    findings: namedGaps,
    decision: { status: decision, blocker_count: namedGaps.length, blocker_task_ids: unique(namedGaps.map(item => item.task_id)) },
  };
}

function readFreshReleaseInput(id, file, taskId, schema, now, add) {
  const absolute = path.isAbsolute(file) ? file : path.resolve(evidenceRoot, file);
  const result = { id, task_id: taskId, path: relative(absolute), data: null, status: 'missing', generated_at: null, age_ms: null, freshness: 'missing', sha256: null };
  if (!fs.existsSync(absolute)) {
    add({ code: 'missing_evidence_input', task_id: taskId, evidence_path: result.path, remediation: `Generate the required ${taskId} evidence before rebuilding release evidence.` });
    return result;
  }
  try {
    const bytes = fs.readFileSync(absolute); result.data = JSON.parse(bytes); result.sha256 = sha256(bytes); result.status = 'present';
  } catch (error) {
    add({ code: 'invalid_evidence_input', task_id: taskId, evidence_path: result.path, reason: `Evidence is unreadable JSON: ${errorMessage(error)}`, remediation: `Repair and regenerate ${taskId} evidence.` });
    result.status = 'invalid'; return result;
  }
  result.generated_at = result.data.generated_at ?? result.data.generatedAt ?? result.data.updated_at ?? null;
  if (schema && result.data.schema !== schema) add({ code: 'invalid_evidence_schema', task_id: taskId, evidence_path: result.path, reason: `Expected ${schema}; observed ${result.data.schema ?? 'missing'}.`, remediation: `Regenerate ${taskId} with its production evidence command.` });
  if (result.data.task_id && result.data.task_id !== taskId) add({ code: 'invalid_evidence_task', task_id: taskId, evidence_path: result.path, reason: `Expected task_id ${taskId}; observed ${result.data.task_id}.`, remediation: 'Use a receipt produced by the declared owning task.' });
  if (!isIsoDate(result.generated_at)) {
    add({ code: 'invalid_evidence_timestamp', task_id: taskId, evidence_path: result.path, remediation: `Regenerate ${taskId} with a capture-time generated_at timestamp.` });
    result.freshness = 'invalid'; return result;
  }
  result.age_ms = now - Date.parse(result.generated_at);
  result.freshness = result.age_ms < -RELEASE_EVIDENCE_FUTURE_SKEW_MS ? 'future' : result.age_ms > RELEASE_EVIDENCE_MAX_AGE_MS ? 'stale' : 'fresh';
  if (result.freshness !== 'fresh') add({ code: result.freshness === 'stale' ? 'stale_evidence_timestamp' : 'future_evidence_timestamp', task_id: taskId, evidence_path: result.path, reason: `Capture timestamp ${result.generated_at} is ${result.freshness} (age ${result.age_ms}ms).`, remediation: `Rerun ${taskId} evidence capture; do not edit timestamps or reuse fixtures.` });
  return result;
}

function normalizeReleaseFinding(item) {
  return {
    severity: 'blocker', code: item.code ?? 'release_evidence_failure',
    application: item.application ?? null, tool: item.tool ?? null, owner: item.owner ?? null,
    transport: item.transport ?? null, modality: item.modality ?? null,
    task_id: item.task_id ?? 'SVD-114', remediation: item.remediation ?? 'Regenerate production evidence and rerun the release builder.',
    reason: item.reason ?? null, evidence_path: item.evidence_path ?? null,
  };
}

function dedupeFreshFindings(findings) {
  const seen = new Set();
  return findings.filter(item => { const key = [item.code, item.application, item.tool, item.owner, item.transport, item.modality, item.task_id, item.evidence_path].join('|'); if (seen.has(key)) return false; seen.add(key); return true; });
}
function freshArtifactView(input) { return { task_id: input.task_id, path: input.path, status: input.status, generated_at: input.generated_at, age_ms: input.age_ms, freshness: input.freshness, sha256: input.sha256 }; }
function freshFindingSummary(item) { return `${item.task_id}: app=${item.application ?? '-'} tool=${item.tool ?? '-'} owner=${item.owner ?? '-'} transport=${item.transport ?? '-'} modality=${item.modality ?? '-'} — ${item.reason ?? item.code}`; }

function validateFreshToolBackedPairs(bindings, behavior, add) {
  const bindingRows = Array.isArray(bindings?.bindings) ? bindings.bindings : [];
  const executionRows = [behavior?.executions, behavior?.tool_executions, behavior?.observations, behavior?.results]
    .flat()
    .filter(Boolean);
  const fixtureOnlyBehavior = isPlaceholderExecution(behavior?.fixture_boundary)
    || String(behavior?.fixture_boundary?.kind ?? '').startsWith('isolated-');

  if (bindingRows.length === 0) {
    add({
      code: 'missing_live_bindings',
      task_id: 'SVD-104',
      evidence_path: 'test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-tool-bindings.json',
      remediation: 'Capture the executable browser binding catalog before release.',
    });
    return;
  }

  for (const binding of bindingRows) {
    const application = binding.app_id ?? null;
    const bindingId = binding.binding_id ?? null;
    const owner = binding.owner ?? null;
    const transports = Array.isArray(binding.transports)
      ? binding.transports
      : Array.isArray(binding.gateway?.transports) ? binding.gateway.transports : [];
    if (!application || !bindingId || !owner || transports.length === 0) {
      add({
        code: 'invalid_live_binding',
        application,
        tool: bindingId,
        owner,
        task_id: 'SVD-104',
        evidence_path: 'test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-tool-bindings.json',
        remediation: 'Emit the app ID, binding ID, backend owner, and allowed transport set for every browser binding.',
      });
      continue;
    }
    const execution = executionRows.find(row => row.binding_id === bindingId);
    if (!execution) {
      add({
        code: fixtureOnlyBehavior ? 'fixture_only_behavior_proof' : 'missing_live_execution',
        application,
        tool: bindingId,
        owner,
        transport: transports.join(','),
        task_id: 'SVD-106',
        evidence_path: 'test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-behavior-proof.json',
        reason: fixtureOnlyBehavior
          ? 'The only SVD-106 receipt is an isolated fixture and cannot certify this browser binding.'
          : 'No application-originated execution observation names this browser binding.',
        remediation: 'Capture application-originated mediated execution with the binding ID, exact tool ID, transport, correlation ID, receipt/event-DAG reference, and recovery evidence.',
      });
    } else if (isPlaceholderExecution(execution)) {
      add({
        code: 'placeholder_execution_claim',
        application,
        tool: bindingId,
        owner,
        transport: execution.transport ?? transports.join(','),
        task_id: 'SVD-106',
        evidence_path: 'test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-behavior-proof.json',
        reason: 'Descriptor-only, static-only, or fixture-only execution claims cannot certify a browser binding.',
        remediation: 'Repeat the workflow against the mediated backend and retain the real request, response, correlation ID, receipt, and event-DAG reference.',
      });
    }
  }
}
function isPlaceholderExecution(row) {
  return /descriptor[ _-]?only|static[ _-]?only|fixture[ _-]?only|\bfixture\b/
    .test(JSON.stringify(row ?? null).toLowerCase());
}

function validateFreshMergeReconciliation(reconciliation, add) {
  const checked = reconciliation?.reconciliation;
  if (checked?.unresolved_conflicts_absent !== true) {
    add({
      code: 'unresolved_submodule_merge_conflicts',
      task_id: 'SVD-116',
      evidence_path: 'test-results/virtual-desktop-ipfs-mcp-orb/submodule-merge-reconciliation.json',
      reason: 'Current reconciliation evidence reports unavailable repositories or unmerged paths.',
      remediation: 'Resolve every reported git conflict, then recapture SVD-116 without overwriting unrelated working-tree changes.',
    });
  }
}
function validateFreshCatalog(catalog, peer, add) {
  const entries = catalog?.entries ?? [];
  for (const entry of entries) {
    const kind = entry.disposition?.kind ?? entry.disposition_kind;
    if (!kind || /unclassified|unknown/.test(kind)) add({ code: 'unclassified_backend_tool', tool: entry.tool_id ?? entry.name ?? null, owner: entry.owner ?? null, transport: entry.reachability?.approved_transports?.join(',') ?? null, task_id: 'SVD-105', evidence_path: 'test-results/virtual-desktop-ipfs-mcp-orb/all-tools-disposition-catalog.json', remediation: 'Classify this backend tool as an app operation, diagnostic operation, governed server-only operation, or an explicit visible availability disposition.' });
  }
  const catalogued = new Set(entries.map(entry => `${entry.owner}:${entry.tool_id}`));
  for (const tool of peer?.tool_observations ?? peer?.tools ?? []) {
    const owner = tool.service ?? tool.owner; const name = tool.name ?? tool.tool_id;
    if (owner && name && !catalogued.has(`${owner}:${name}`)) add({ code: 'unclassified_backend_tool', tool: name, owner, task_id: 'SVD-105', evidence_path: 'test-results/virtual-desktop-ipfs-mcp-orb/swissknife-all-tools-peer-evidence.json', remediation: 'Add a classified disposition before release; a discovery count is not a disposition.' });
  }
}
function validateFreshTransportEvidence(profile, add) {
  if (!profile) return;
  if (isPlaceholderExecution(profile)) add({ code: 'placeholder_execution_claim', task_id: 'SVD-109', evidence_path: 'test-results/virtual-desktop-ipfs-mcp-orb/all-app-mcpplusplus-profile-interoperability.json', remediation: 'Replace descriptor/fixture-only transport evidence with application-originated HTTP and libp2p observations.' });
}
function validateFreshSimulatorEvidence(simulator, add) {
  if (!simulator) return;
  for (const replay of simulator.replays ?? []) if (replay.modality && isPlaceholderExecution(replay)) add({ code: 'placeholder_execution_claim', application: replay.app_id ?? null, modality: replay.modality, task_id: 'SVD-111', evidence_path: 'test-results/virtual-desktop-ipfs-mcp-orb/all-app-meta-device-simulator-proof.json', remediation: 'Replay the compiled packet in the device simulator and retain privacy, permission, rollback, and fallback observations.' });
}
function freshAppMatrix(appIds, findings) {
  const byCode = code => findings.filter(item => item.code === code);
  return {
    decision: findings.length === 0 ? 'go' : 'no_go', blocker_count: findings.length, app_count: appIds.length,
    missing_contract_app_ids: byCode('missing_evidence_input').filter(item => item.application).map(item => item.application),
    missing_workflow_app_ids: byCode('missing_live_execution').map(item => item.application).filter(Boolean),
    missing_screenshot_apps: [], missing_workflow_states: [], missing_ux_states: [], missing_local_only_rationale_app_ids: [],
    missing_backend_capability_set_app_ids: [], malformed_backend_capabilities: [],
    missing_app_visible_binding_capabilities: byCode('declared_no_tool_binding').map(item => item.tool).filter(Boolean),
    missing_orb_idl_app_ids: [], missing_orb_idl_capabilities: [], missing_glasses_projection_app_ids: [], missing_glasses_projection_capabilities: [],
    missing_catalog_reconciliation: byCode('unclassified_backend_tool').map(item => item.tool).filter(Boolean), missing_mcp_plus_plus_eligibility: [],
    server_catalog_gaps: [], server_facade_gaps: [], tool_class_counts: {}, tool_classes_with_missing_coverage: [],
    missing_simulator_modalities: findings.filter(item => item.modality).map(item => item.modality), missing_simulator_capability_modalities: [], simulator_replay_gaps: [],
  };
}

function renderFreshReleaseMarkdown(report) {
  const lines = ['# Freshness-Aware Virtual Desktop Release Evidence', '', `Task: ${report.task_id}`, `Generated: ${report.generated_at}`, `Decision: **${report.decision.status.replace('_', '-')}**`, '', '## Freshness policy', '', `- Maximum receipt age: ${report.freshness_policy.maximum_age_ms} ms.`, '- Evidence is rejected when absent, malformed, stale, future-dated, descriptor-only, static-only, fixture-only, or unclassified.', '', '## Blocking findings', '', '| Application | Tool | Owner | Transport | Modality | Task | Finding | Remediation |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  lines.push(...(report.named_gaps.length ? report.named_gaps.map(item => `| ${item.application ?? '—'} | ${item.tool ?? '—'} | ${item.owner ?? '—'} | ${item.transport ?? '—'} | ${item.modality ?? '—'} | ${item.task_id} | ${item.code}: ${item.reason ?? '—'} | ${item.remediation} |`) : ['| — | — | — | — | — | — | None | — |']));
  lines.push('', '## Input receipts', '', '| Input | Task | Freshness | Captured |', '| --- | --- | --- | --- |', ...Object.entries(report.artifacts).map(([id, value]) => `| ${id} | ${value.task_id} | ${value.freshness} | ${value.generated_at ?? '—'} |`), '');
  return lines.join('\n');
}
function renderFreshReleaseSignoff(report) { return `# Refactor Final Signoff\n\nTask: SVD-114\n\nDecision: **${report.decision.status.replace('_', '-')}**\n\nThe detailed release receipt is in \`test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json\`.\n`; }
function renderFreshReleaseDiscovery(report) { return `# All-Tools Closeout: No New Unknowns\n\nDecision: **${report.decision.status.replace('_', '-')}**\n\nEvery blocking condition is enumerated in the SVD-114 release receipt with an owner and remediation.\n`; }

/**
 * SVD-066 closes the release loop over the supervisor-managed evidence wave.
 * Earlier revisions of this script also attempted to aggregate a later,
 * unrelated SVD-093..100 program.  Those artifacts are not prerequisites of
 * this release and would turn a fully replayed SVD-070..072 closeout into a
 * false NO-GO merely because they are absent from a checkout.
 */
function buildSupervisorManagedReleaseReport() {
  const inventory = readRequiredEvidence('app_backend_contract', 'app-backend-contract.json', 'SWR-113', 'swissknife.virtual-desktop-app-backend-contract.v1');
  const ui = readRequiredEvidence('supervisor_all_app_ui', 'agent-supervisor-expanded-meta-io.json', 'SVD-070', 'swissknife.agent-supervisor-expanded-meta-io-validation.v1');
  const bindings = readRequiredEvidence('all_app_live_bindings', 'all-app-live-tool-bindings.json', 'SVD-104', 'swissknife.all-app-live-tool-bindings-evidence.v1');
  const handoff = readRequiredEvidence('supervisor_orb_idl_handoff', 'agent-supervisor-expanded-io-handoff.json', 'SVD-071', 'swissknife.agent-supervisor-expanded-io-handoff.v1');
  const actionHandoff = readRequiredEvidence('all_app_action_handoff', 'all-app-orb-idl-action-handoff.json', 'SVD-110', 'swissknife.all-app-orb-idl-action-handoff.v1');
  const simulator = readRequiredEvidence('meta_glasses_simulator', 'meta-glasses-device-simulator-validation.json', 'SVD-072', 'swissknife.meta-glasses-device-simulator-validation.v2');
  const runtime = readRequiredEvidence('supervisor_three_backend_runtime', 'agent-supervisor-three-backend-runtime.json', 'SVD-107', 'swissknife.agent-supervisor-three-backend-runtime.v1');
  const records = [inventory, ui, bindings, handoff, actionHandoff, simulator, runtime];
  const gaps = records.flatMap(record => record.gaps);
  const appIds = unique((inventory.data?.apps ?? []).map(app => app.app_id).filter(nonEmpty));

  validateSupervisorReleaseInventory(inventory, appIds);
  validateSupervisorAllAppUi(ui, appIds);
  validateLiveBindings(bindings, appIds);
  validateSupervisorHandoff(handoff, appIds);
  validateActionHandoff(actionHandoff);
  validateSimulatorReplay(simulator, handoff.data, appIds);
  validateThreeBackendRuntime(runtime);
  const namedGaps = dedupeGaps(records.flatMap(record => record.gaps));
  const decision = namedGaps.length === 0 ? 'GO' : 'NO_GO';
  const unknown = namedGaps.filter(item => !/^SVD-\d+$/.test(item.task_id ?? '') || !nonEmpty(item.owner));
  const artifacts = Object.fromEntries(records.map(record => [record.id, {
    task_id: record.taskId, path: record.path, status: record.gaps.length === 0 ? 'passed' : record.status,
    generated_at: record.data?.generated_at ?? null, sha256: record.sha256, checks: record.checks,
  }]));
  const coverage = ui.data?.coverage ?? {};
  const simulatorData = simulator.data ?? {};
  const handoffData = handoff.data ?? {};
  const serviceOwners = unique((bindings.data?.bindings ?? []).map(binding => binding.owner).filter(nonEmpty));
  // Keep the release claim tied to the compiled action-handoff receipt.  The
  // UI replay proves that the Supervisor surface exists; the ORB/IDL action
  // packets prove that the goal, subgoal, and taskboard operations it exposes
  // are actually routable with receipt/event-DAG provenance.
  const supervisorControlPlaneActions = unique((actionHandoff.data?.packets ?? [])
    .filter(packet => packet.app_id === 'agent-supervisor' && String(packet.action_id).startsWith('supervisor.'))
    .map(packet => packet.action_id));
  const supervisorSteeringVerified = EXPECTED_SUPERVISOR_CAPABILITIES
    .every(capability => supervisorControlPlaneActions.includes(capability));
  const report = {
    schema: 'swissknife.supervisor-managed-all-app-release-evidence.v1',
    task_id: 'SVD-066',
    // A release receipt is a content-addressed assertion, not a build log.
    // Using wall-clock time and the repository HEAD here made an otherwise
    // no-op regeneration dirty its own tracked evidence after every commit.
    // Keep the observable provenance tied to the reviewed input receipts so
    // the release loop converges; the freshness gate below still hashes every
    // source file and output artifact on each invocation.
    generated_at: releaseEvidenceGeneratedAt(records),
    source_revision: releaseEvidenceRevision(records),
    release_scope: 'Supervisor-managed SwissKnife desktop, all app UI/UX and MCP++ bindings, ORB/IDL handoff, and hardware-free Meta glasses simulator replay.',
    freshness_policy: {
      kind: 'content-addressed-current-checkout', audit_group: 'virtual-desktop-release-evidence',
      statement: 'The release receipt is fresh only while its source evidence, screenshots, contracts, handoff compiler, and simulator validator match this checkout.',
    },
    artifacts,
    app_coverage: {
      canonical_app_count: appIds.length, opened_app_count: coverage.opened_app_count ?? 0,
      exercised_route_count: coverage.exercised_route_count ?? 0, required_route_count: coverage.expected_route_count ?? 0,
      exact_app_ids: appIds, screenshots_recorded: ui.data?.screenshots?.length ?? 0,
      ui_ux: ui.data?.ui_validation ?? {},
    },
    agent_supervisor: {
      app_id: 'agent-supervisor',
      present_in_app_validation: (ui.data?.app_validations ?? []).some(app => app.app_id === 'agent-supervisor'),
      goal_subgoal_taskboard_capabilities: supervisorControlPlaneActions,
      expected_goal_subgoal_taskboard_capabilities: EXPECTED_SUPERVISOR_CAPABILITIES,
      goal_subgoal_taskboard_steering_verified: supervisorSteeringVerified,
      control_plane: ui.data?.supervisor_control_plane ?? {},
      runtime: runtime.data?.runtime_boundary ?? runtime.data?.contract ?? {},
      service_owners: serviceOwners,
    },
    mcp_plus_plus_backend_evidence: {
      binding_count: bindings.data?.catalog?.binding_count ?? 0,
      owner_counts: bindings.data?.catalog?.owner_counts ?? {},
      service_owners: serviceOwners,
      all_bindings_materialized: bindings.data?.acceptance?.all_declared_bindings_materialized === true,
      browser_mediation_only: bindings.data?.acceptance?.browser_mediation_only === true,
    },
    orb_idl_handoff: {
      expanded_handoff_packet_count: handoffData.packet_count ?? 0,
      expanded_handoff_app_count: handoffData.app_count ?? 0,
      supervisor_packets: (handoffData.packets ?? []).filter(packet => packet.app_id === 'agent-supervisor').length,
      action_packet_count: actionHandoff.data?.packet_count ?? 0,
      action_supervisor_packet_count: actionHandoff.data?.supervisor_action_packet_count ?? 0,
      receipt_and_event_dag_bound: true,
    },
    meta_glasses_simulator: {
      task_id: simulatorData.task_id ?? null, hardware_free: simulatorData.boundary?.hardware_free === true,
      physical_hardware_claimed: simulatorData.boundary?.physical_hardware_claimed === true,
      replay_count: simulatorData.replays?.length ?? 0, modality_summary: simulatorData.modality_summary ?? {},
      acceptance: simulatorData.acceptance ?? {},
    },
    no_new_unknowns: {
      status: unknown.length === 0 ? 'no_new_unknowns' : 'unknown_task_classes_present',
      count: unknown.length,
      statement: namedGaps.length === 0
        ? 'No new unknowns: every required release proof is represented by a named SVD receipt and all required proofs passed.'
        : unknown.length === 0
        ? 'No new unknowns: every release gap is assigned to an existing task class and owner.'
        : 'A release gap lacks a named SVD owner or task class.',
    },
    named_gaps: namedGaps,
    decision: { status: decision, blocker_count: namedGaps.length, blocker_task_ids: unique(namedGaps.map(item => item.task_id)) },
  };
  return report;
}

function readRequiredEvidence(id, file, taskId, schema) {
  const pathName = path.join(evidenceRoot, file);
  const record = { id, file, taskId, schema, path: relative(pathName), data: null, sha256: null, status: 'missing', checks: [], gaps: [] };
  if (!fs.existsSync(pathName)) {
    record.gaps.push(releaseGap(taskId, 'missing_evidence', id, `Required evidence is missing: ${record.path}.`, record.path));
    return record;
  }
  try {
    const bytes = fs.readFileSync(pathName);
    record.data = JSON.parse(bytes.toString('utf8')); record.sha256 = sha256(bytes); record.status = 'present';
  } catch (error) {
    record.gaps.push(releaseGap(taskId, 'invalid_evidence', id, `Evidence is not valid JSON: ${errorMessage(error)}.`, record.path));
    return record;
  }
  releaseCheck(record, record.data.schema === schema, 'schema', `Expected schema ${schema}; observed ${record.data.schema ?? 'missing'}.`);
  releaseCheck(record, record.data.task_id === taskId, 'task_provenance', `Expected task_id ${taskId}; observed ${record.data.task_id ?? 'missing'}.`);
  releaseCheck(record, isIsoDate(record.data.generated_at), 'generated_at', 'Evidence has no valid generated_at timestamp.');
  return record;
}

function releaseGap(taskId, code, scope, reason, evidencePath) {
  return { task_id: taskId, owner_task_id: taskId, owner: ownerForTask(taskId) || 'release', code, scope, reason, evidence_path: evidencePath };
}
function releaseCheck(record, passed, code, reason, scope = record.id) {
  record.checks.push({ code, passed: Boolean(passed), reason, scope });
  if (!passed) record.gaps.push(releaseGap(record.taskId, code, scope, reason, record.path));
}
function allTrue(value) { return value && typeof value === 'object' && Object.values(value).every(item => item === true); }
function exactSet(left, right) { return sameSet(left.filter(nonEmpty), right.filter(nonEmpty)); }

function validateSupervisorReleaseInventory(record, appIds) {
  const data = record.data ?? {};
  releaseCheck(record, data.validation?.valid === true, 'inventory_validation', 'Canonical app/backend contract is not valid.');
  releaseCheck(record, appIds.length > 0 && data.app_count === appIds.length && data.canonical_app_count === appIds.length,
    'inventory_count', 'Canonical app inventory has inconsistent or empty app counts.');
}
function validateSupervisorAllAppUi(record, appIds) {
  const data = record.data ?? {}, apps = data.app_validations ?? [];
  releaseCheck(record, data.decision === 'GO', 'decision', 'All-app Agent Supervisor UI validation did not declare GO.');
  releaseCheck(record, exactSet(apps.map(app => app.app_id), appIds), 'app_coverage', 'Agent Supervisor UI evidence does not exactly cover the canonical app inventory.');
  releaseCheck(record, data.coverage?.opened_app_count === appIds.length && data.coverage?.exercised_route_count === data.coverage?.expected_route_count,
    'ui_route_coverage', 'Not every canonical app and route was opened and exercised.');
  releaseCheck(record, allTrue(data.acceptance), 'ui_acceptance', 'One or more UI/UX acceptance checks failed.');
  for (const key of ['hidden_control_count', 'text_overlap_count', 'broken_focus_count', 'unlabeled_control_count', 'horizontal_overflow_count', 'browser_console_error_count', 'failed_request_count', 'unreported_backend_failure_count']) {
    releaseCheck(record, data.ui_validation?.[key] === 0, `ui_${key}`, `UI/UX counter ${key} is not zero.`);
  }
  releaseCheck(record, apps.some(app => app.app_id === 'agent-supervisor'), 'agent_supervisor_surface', 'Agent Supervisor is absent from all-app UI validation.');
  const screenshots = data.screenshots ?? [];
  releaseCheck(record, screenshots.length >= appIds.length && data.acceptance?.screenshots_recorded === true,
    'ui_screenshots', 'All-app UI screenshot evidence was not recorded by the UI/UX replay.');
  const invalidScreenshots = screenshots.filter(screenshot => !isValidPngReceipt(screenshot));
  releaseCheck(record, screenshots.every(nonEmpty) && unique(screenshots).length === screenshots.length,
    'ui_screenshot_receipt_uniqueness', 'UI screenshot receipt paths must be non-empty and unique.');
  releaseCheck(record, invalidScreenshots.length === 0,
    'ui_screenshot_files', `UI screenshot evidence is missing, outside the project, or not a PNG: ${invalidScreenshots.join(', ') || 'none'}.`);
  for (const app of apps) releaseCheck(record, Array.isArray(app.routes) && app.routes.length > 0 && app.routes.every(route => Array.isArray(route.service_bindings) && route.service_bindings.length === 6),
    `backend_routes_${app.app_id}`, `${app.app_id} has no complete MCP++ backend route binding evidence.`, app.app_id);
}
function validateLiveBindings(record, appIds) {
  const data = record.data ?? {}, bindings = data.bindings ?? [];
  releaseCheck(record, allTrue(data.acceptance), 'binding_acceptance', 'Live MCP++ binding acceptance is incomplete.');
  releaseCheck(record, bindings.length === data.catalog?.binding_count && bindings.length > 0, 'binding_count', 'Live MCP++ binding count is inconsistent or empty.');
  const owners = unique(bindings.map(binding => binding.owner));
  releaseCheck(record, exactSet(owners, REQUIRED_SERVICES), 'binding_owners', 'Live bindings do not cover all three MCP++ backend owners.');
  releaseCheck(record, bindings.every(binding => appIds.includes(binding.app_id) && nonEmpty(binding.ui_control_id) && Array.isArray(binding.recovery_errors) && binding.recovery_errors.length > 0),
    'binding_rows', 'A live binding lacks a canonical app, UI control, or recovery contract.');
}
function validateSupervisorHandoff(record, appIds) {
  const data = record.data ?? {}, packets = data.packets ?? [];
  releaseCheck(record, data.app_count === appIds.length && data.packet_count === packets.length && packets.length > 0, 'handoff_counts', 'Expanded ORB/IDL handoff counts are inconsistent.');
  releaseCheck(record, exactSet(unique(packets.map(packet => packet.app_id)), appIds), 'handoff_app_coverage', 'Expanded ORB/IDL handoff does not cover every canonical app.');
  const supervisor = packets.filter(packet => packet.app_id === 'agent-supervisor');
  releaseCheck(record, supervisor.length > 0, 'agent_supervisor_packets', 'Agent Supervisor has no expanded ORB/IDL handoff packets.');
  releaseCheck(record, packets.every(packet => nonEmpty(packet.packet_cid) && nonEmpty(packet.receipt?.receipt_cid)
    && nonEmpty(packet.receipt?.event_dag_ref) && nonEmpty(packet.rollback?.rollback_token)
    && packet.receipt?.preserved === true && Array.isArray(packet.fallbacks) && packet.fallbacks.length > 0),
    'handoff_lineage', 'An ORB/IDL handoff packet lacks provenance, rollback, or fallback fields.');
}
function validateActionHandoff(record) {
  const data = record.data ?? {}, packets = data.packets ?? [];
  releaseCheck(record, data.packet_count === packets.length && data.supervisor_action_packet_count > 0, 'action_handoff_counts', 'Action handoff packet counts are incomplete.');
  const supervisorActions = unique(packets.filter(packet => String(packet.action_id).startsWith('supervisor.')).map(packet => packet.action_id));
  releaseCheck(record, EXPECTED_SUPERVISOR_CAPABILITIES.every(capability => supervisorActions.includes(capability)),
    'action_handoff_supervisor', `Action handoff is missing Agent Supervisor control-plane actions: ${EXPECTED_SUPERVISOR_CAPABILITIES.filter(capability => !supervisorActions.includes(capability)).join(', ') || 'none'}.`);
  releaseCheck(record, packets.every(packet => Array.isArray(packet.receipt_refs) && packet.receipt_refs.length > 0 && Array.isArray(packet.event_dag_refs) && packet.event_dag_refs.length > 0),
    'action_handoff_provenance', 'Action handoff packet lacks receipt or event-DAG provenance.');
}
function validateSimulatorReplay(record, handoff, appIds) {
  const data = record.data ?? {}, replays = data.replays ?? [];
  releaseCheck(record, data.decision === 'GO' && data.passed === true && data.valid === true && allTrue(data.acceptance), 'simulator_decision', 'Meta glasses simulator replay did not fully pass.');
  releaseCheck(record, data.boundary?.simulator_only === true && data.boundary?.hardware_free === true && data.boundary?.physical_hardware_claimed === false,
    'simulator_boundary', 'Meta glasses simulator evidence claims or requires physical hardware.');
  releaseCheck(record, data.source_handoff?.task_id === 'SVD-071' && data.source_handoff?.packet_count === handoff?.packet_count,
    'simulator_handoff_provenance', 'Meta glasses simulator replay is not bound to the current SVD-071 handoff packet set.');
  releaseCheck(record, replays.length === handoff?.packet_count && exactSet(unique(replays.map(replay => replay.app_id)), appIds),
    'simulator_replay_coverage', 'Meta glasses simulator did not replay every SVD-071 packet and canonical app.');
  releaseCheck(record, Object.values(data.modality_summary ?? {}).length === 7
    && Object.values(data.modality_summary ?? {}).every(count => count === appIds.length),
  'simulator_modalities', 'Every Meta glasses modality must replay every canonical application.');
}
function validateThreeBackendRuntime(record) {
  const data = record.data ?? {}, coverage = data.coverage ?? {}, observations = data.observations ?? [];
  releaseCheck(record, data.decision === 'GO', 'runtime_decision', 'Agent Supervisor three-backend runtime did not declare GO.');
  releaseCheck(record, exactSet(coverage.owners_observed ?? [], REQUIRED_SERVICES) && coverage.owner_count === REQUIRED_SERVICES.length,
    'runtime_owners', 'Agent Supervisor runtime did not observe all three backend owners.');
  releaseCheck(record, coverage.available_observation_count === REQUIRED_SERVICES.length && coverage.direct_host_access_observed === false,
    'runtime_boundary', 'Agent Supervisor runtime availability or browser mediation boundary failed.');
  releaseCheck(record, observations.filter(item => item.state === 'available').every(item => item.assertions?.mediated !== false
    && (item.assertions?.receipt_observed === true || item.assertions?.content_cid_visible === true)),
  'runtime_receipts', 'An available Agent Supervisor runtime operation lacks mediated receipt or content provenance.');
  const guardrail = observations.find(item => item.id === 'governed-action-persistence-failure-guardrail');
  releaseCheck(record, guardrail?.state === 'unavailable' && guardrail.assertions?.governed_action_was_not_reported_as_success === true
    && guardrail.assertions?.event_dag_checkpoint_required_before_completion === true,
  'runtime_guardrail', 'Agent Supervisor persistence-failure guardrail is not visible and fail-closed.');
}

function renderSupervisorManagedMarkdown(report) {
  const lines = [
    '# Supervisor-Managed All-App MCP++ Release Evidence', '',
    `Generated: ${report.generated_at}`, `Evidence revision: \`${report.source_revision}\``, `Decision: **${report.decision.status.replace('_', '-')}**`, '',
    '## Release conclusion', '',
    report.decision.status === 'GO'
      ? 'The supervisor-managed release loop is complete: every canonical SwissKnife app has current UI/UX and MCP++ route evidence, the Agent Supervisor control plane is present in ORB/IDL packets, and the Meta glasses simulator replay is current.'
      : 'The release is **NO-GO**. Only the explicit evidence gaps below may be used to reopen the release loop.', '',
    '## Agent Supervisor', '',
    `- Goal/subgoal/taskboard control-plane actions: ${report.agent_supervisor.goal_subgoal_taskboard_capabilities.map(value => `\`${value}\``).join(', ')}.`,
    `- Goal/subgoal/taskboard steering is packet-verified: **${report.agent_supervisor.goal_subgoal_taskboard_steering_verified}**.`,
    `- App UI validation includes Agent Supervisor: **${report.agent_supervisor.present_in_app_validation}**.`,
    `- Backend owners: ${report.agent_supervisor.service_owners.map(value => `\`${value}\``).join(', ')}.`, '',
    '## All-app UI/UX and MCP++ backend evidence', '',
    `- Canonical apps / opened apps: **${report.app_coverage.canonical_app_count}/${report.app_coverage.opened_app_count}**.`,
    `- Routes exercised: **${report.app_coverage.exercised_route_count}/${report.app_coverage.required_route_count}**.`,
    `- Screenshot receipts: **${report.app_coverage.screenshots_recorded}**.`,
    `- Live MCP++ bindings: **${report.mcp_plus_plus_backend_evidence.binding_count}** across ${report.mcp_plus_plus_backend_evidence.service_owners.map(value => `\`${value}\``).join(', ')}.`,
    `- UI counters: hidden=${report.app_coverage.ui_ux.hidden_control_count}, overlap=${report.app_coverage.ui_ux.text_overlap_count}, broken-focus=${report.app_coverage.ui_ux.broken_focus_count}, unreported-backend-failures=${report.app_coverage.ui_ux.unreported_backend_failure_count}.`, '',
    '## ORB/IDL and Meta glasses simulator', '',
    `- Expanded ORB/IDL packets: **${report.orb_idl_handoff.expanded_handoff_packet_count}** for **${report.orb_idl_handoff.expanded_handoff_app_count}** apps; Agent Supervisor packets: **${report.orb_idl_handoff.supervisor_packets}**.`,
    `- Action handoff packets: **${report.orb_idl_handoff.action_packet_count}**; Agent Supervisor action packets: **${report.orb_idl_handoff.action_supervisor_packet_count}**.`,
    `- Meta glasses simulator replay: **${report.meta_glasses_simulator.replay_count}** packets, hardware-free=${report.meta_glasses_simulator.hardware_free}, physical-hardware-claimed=${report.meta_glasses_simulator.physical_hardware_claimed}.`,
    `- Modalities: ${Object.entries(report.meta_glasses_simulator.modality_summary).map(([key, value]) => `${key}=${value}`).join(', ')}.`, '',
    '## Evidence receipts', '',
    '| Evidence | Task | Status | Generated |', '| --- | --- | --- | --- |',
    ...Object.entries(report.artifacts).map(([id, artifact]) => `| \`${id}\` | ${artifact.task_id} | ${artifact.status} | ${artifact.generated_at ?? 'missing'} |`), '',
    '## No new unknowns', '',
    `- Status: **${report.no_new_unknowns.status}**`, `- ${report.no_new_unknowns.statement}`, '',
    '## Blockers', '',
    ...(report.named_gaps.length === 0 ? ['- None.'] : report.named_gaps.map(item => `- **${item.task_id}** — \`${item.scope}\`: ${item.reason}`)), '',
  ];
  return `${lines.join('\n')}\n`;
}
function renderSupervisorManagedSignoff(report) {
  return [
    '# Refactor Final Signoff', '', 'Task: SVD-066 — Close the supervisor-managed all-app MCP++ release loop', '',
    `Observed: ${report.generated_at}`, `SwissKnife evidence revision: \`${report.source_revision}\``, `Decision: **${report.decision.status.replace('_', '-')}**`, '',
    '## Final decision', '',
    report.decision.status === 'GO'
      ? 'GO. Agent Supervisor can steer goals, subgoals, and taskboard work through packet-verified MCP++ control-plane actions with all three backend owners; all canonical app UI/UX, ORB/IDL, and Meta glasses simulator evidence is current.'
      : 'NO-GO. The named release evidence gaps remain unresolved.', '',
    '## Evidence basis', '',
    `- Agent Supervisor UI/UX: ${report.app_coverage.opened_app_count}/${report.app_coverage.canonical_app_count} apps, ${report.app_coverage.exercised_route_count}/${report.app_coverage.required_route_count} routes.`,
    `- Agent Supervisor goal/subgoal/taskboard steering: packet-verified=${report.agent_supervisor.goal_subgoal_taskboard_steering_verified}; ${report.agent_supervisor.goal_subgoal_taskboard_capabilities.length} observed control-plane actions.`,
    `- MCP++ backend bindings: ${report.mcp_plus_plus_backend_evidence.binding_count} across ${report.mcp_plus_plus_backend_evidence.service_owners.join(', ')}.`,
    `- ORB/IDL: ${report.orb_idl_handoff.expanded_handoff_packet_count} expanded packets including ${report.orb_idl_handoff.supervisor_packets} Agent Supervisor packets.`,
    `- Meta glasses simulator: ${report.meta_glasses_simulator.replay_count} replayed packets; hardware-free=${report.meta_glasses_simulator.hardware_free}; physical pairing not claimed.`,
    `- No new unknowns: ${report.no_new_unknowns.statement}`, '',
    '## Artifacts', '',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json`',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/all-tools-release-evidence.md`',
    '- `docs/virtual-desktop-release-evidence.fingerprint.json`', '',
  ].join('\n') + '\n';
}
function renderSupervisorManagedDiscovery(report) {
  return ['# All-Tools Closeout: No New Unknowns', '', `Decision: **${report.decision.status.replace('_', '-')}**`, '', '## No new unknowns', '', report.no_new_unknowns.statement, ''].join('\n');
}

function loadEvidence(definition, context) {
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
  check(record, !isIsoDate(record.generated_at) || Date.parse(record.generated_at) <= Date.now() + 5 * 60 * 1000,
    'generated_at_in_future', `Evidence timestamp ${record.generated_at ?? 'missing'} is implausibly in the future.`);
  for (const source of record.source_fingerprint.files.filter(file => !file.exists)) {
    check(record, false, `missing_evidence_source_${source.path}`, `Evidence source dependency is missing: ${source.path}.`);
  }
  validateDependencyFreshness(record, context.priorFreshnessReceipt);
  definition.validate(record, context);
  if (record.gaps.length === 0) record.status = 'passed';
  else record.status = 'failed';
  return record;
}

function loadReleaseInventory() {
  const relativePath = relative(canonicalAppContractPath);
  const result = {
    appIds: [],
    gaps: [],
    summary: {
      path: relativePath,
      status: 'missing',
      schema: null,
      generated_at: null,
      sha256: null,
      canonical_app_count: 0,
      app_ids: [],
    },
  };
  if (!fs.existsSync(canonicalAppContractPath)) {
    result.gaps.push(gap('SVD-096', 'missing_canonical_app_inventory', 'canonical-app-inventory',
      `Canonical app inventory is missing: ${relativePath}.`, relativePath));
    return result;
  }
  const data = readJson(canonicalAppContractPath);
  if (!data) {
    result.summary.status = 'invalid';
    result.gaps.push(gap('SVD-096', 'invalid_canonical_app_inventory', 'canonical-app-inventory',
      `Canonical app inventory is not valid JSON: ${relativePath}.`, relativePath));
    return result;
  }
  const appIds = (Array.isArray(data.apps) ? data.apps : []).map(app => app.app_id).filter(nonEmpty);
  const uniqueAppIds = unique(appIds);
  result.appIds = uniqueAppIds;
  result.summary = {
    path: relativePath,
    status: 'present',
    schema: data.schema ?? null,
    generated_at: data.generated_at ?? null,
    sha256: sha256(fs.readFileSync(canonicalAppContractPath)),
    canonical_app_count: uniqueAppIds.length,
    app_ids: uniqueAppIds,
  };
  const valid = data.schema === 'swissknife.virtual-desktop-app-backend-contract.v1'
    && data.validation?.valid === true
    && uniqueAppIds.length > 0
    && uniqueAppIds.length === appIds.length
    && data.app_count === uniqueAppIds.length
    && data.canonical_app_count === uniqueAppIds.length;
  if (!valid) {
    result.summary.status = 'invalid';
    result.gaps.push(gap('SVD-096', 'invalid_canonical_app_inventory', 'canonical-app-inventory',
      'Canonical app inventory schema, validation, counts, or unique app IDs are inconsistent.', relativePath));
  } else {
    result.summary.status = 'passed';
  }
  return result;
}

function validateDependencyFreshness(record, priorReceipt) {
  const receiptValid = priorReceipt?.schema === 'swr_029_evidence_freshness_receipt_v1'
    && priorReceipt.id === 'virtual-desktop-release-evidence'
    && Array.isArray(priorReceipt.sourceFiles)
    && isIsoDate(priorReceipt.generatedAt);
  const current = record.source_fingerprint.files;
  const prior = new Map((receiptValid ? priorReceipt.sourceFiles : []).map(file => [file.path, file.sha256]));
  const currentPaths = new Set(current.map(file => file.path));
  const changed = current.filter(file => prior.has(file.path) && prior.get(file.path) !== file.sha256).map(file => file.path);
  const added = current.filter(file => receiptValid && !prior.has(file.path)).map(file => file.path);
  const removed = receiptValid ? [...prior.keys()].filter(filePath => !currentPaths.has(filePath)
    && record.sourcePaths.some(sourcePath => pathIsWithinSource(filePath, sourcePath))) : [];
  const dependencyChanges = unique([...changed, ...added, ...removed]);
  const regeneratedAfterBaseline = receiptValid && isIsoDate(record.generated_at)
    && Date.parse(record.generated_at) > Date.parse(priorReceipt.generatedAt);
  record.dependency_freshness = {
    policy: 'prior-certified-source-fingerprint-or-newer-capture',
    prior_receipt_present: Boolean(receiptValid),
    prior_receipt_generated_at: receiptValid ? priorReceipt.generatedAt : null,
    dependency_change_count: dependencyChanges.length,
    changed_dependency_paths: dependencyChanges,
    regenerated_after_dependency_baseline: regeneratedAfterBaseline,
    status: !receiptValid ? 'first_certification'
      : dependencyChanges.length === 0 ? 'current'
        : regeneratedAfterBaseline ? 'refreshed_after_change' : 'stale',
  };
  if (receiptValid && dependencyChanges.length > 0 && !regeneratedAfterBaseline) {
    record.gaps.push(gap(record.taskId, 'stale_dependency_fingerprint', record.id,
      `Evidence predates changed dependency paths: ${dependencyChanges.join(', ')}. Regenerate ${record.path}.`, record.path));
  }
}

function validateCanonicalCoverage(record, observedIds, canonicalIds, label) {
  const observed = observedIds.filter(nonEmpty);
  const duplicates = observed.filter((id, index) => observed.indexOf(id) !== index);
  check(record, canonicalIds.length > 0, `${label}_canonical_inventory`,
    `Cannot validate ${label} without a canonical application inventory.`);
  check(record, duplicates.length === 0, `${label}_duplicates`,
    `${label} contains duplicate app IDs: ${unique(duplicates).join(', ')}.`);
  check(record, sameSet(observed, canonicalIds), `${label}_coverage`,
    `${label} does not exactly cover canonical apps; missing=${canonicalIds.filter(id => !observed.includes(id)).join(', ') || 'none'}; unexpected=${observed.filter(id => !canonicalIds.includes(id)).join(', ') || 'none'}.`);
}

function validateMetaReplayPacket(record, packet) {
  const id = packet.packet_id ?? 'unknown-packet';
  for (const key of ['packet_id', 'app_id', 'correlation_id', 'interface_cid']) {
    check(record, nonEmpty(packet[key]), `${id}_${key}`, `${id} has no ${key}.`, id);
  }
  check(record, packet.status === 'passed', `${id}_status`, `${id} replay did not pass.`, id);
  check(record, packet.layout?.bounded === true && packet.layout?.controls_overlap === false,
    `${id}_layout`, `${id} layout is unbounded or has overlapping controls.`, id);
  check(record, packet.receipt_preservation?.preserved === true,
    `${id}_receipt_preservation`, `${id} did not preserve receipt and event-DAG references.`, id);
  check(record, nonEmpty(packet.rollback?.expected_mode)
    && String(packet.rollback?.observed_state ?? '').includes(packet.rollback.expected_mode),
  `${id}_rollback`, `${id} did not visibly replay its rollback mode.`, id);
  check(record, packet.fallback?.user_visible === true && nonEmpty(packet.fallback?.observed_surface),
    `${id}_fallback`, `${id} has no visible typed fallback.`, id);
  check(record, Array.isArray(packet.operator_decisions) && packet.operator_decisions.length > 0,
    `${id}_operator_decision`, `${id} has no visible operator decision.`, id);
  for (const modality of REQUIRED_MODALITIES) {
    const replay = packet.modality_replays?.[modality];
    check(record, replay?.modality === modality, `${id}_${modality}`, `${id} has no ${modality} replay.`, id);
    if (!replay) continue;
    check(record, replay.raw_payload_captured === false, `${id}_${modality}_privacy`,
      `${id}/${modality} captured a raw media payload.`, id);
    check(record, sameSet((replay.flows ?? []).map(flow => flow.scenario), REQUIRED_REPLAY_SCENARIOS),
      `${id}_${modality}_scenarios`, `${id}/${modality} does not cover all replay scenarios.`, id);
    check(record, (replay.flows ?? []).every(flow => flow.receipt_refs_preserved === true
      && flow.operator_decision_visible === true), `${id}_${modality}_provenance`,
    `${id}/${modality} has a flow without preserved receipts or a visible operator decision.`, id);
  }
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
      if (cell) {
        check(record, cell.capability_state === 'supported', `profile_${profile}_${service}_${cell.capability_state ?? 'unknown'}`,
          `${service}/Profile ${profile} is ${cell.capability_state ?? 'unknown'}; supported proof or an approved non-release disposition is required.`, `${service}:${profile}`);
        for (const transport of REQUIRED_TRANSPORTS) {
          const state = cell[`${transport}_state`] ?? cell.transport_states?.[transport];
          check(record, state === 'supported', `profile_${profile}_${service}_${transport}_${state ?? 'unknown'}`,
            `${service}/Profile ${profile}/${transport} is ${state ?? 'unobserved'}; an independent supported proof or approved disposition is required.`, `${service}:${profile}:${transport}`);
        }
        check(record, nonEmpty(cell.fallback?.decision) && nonEmpty(cell.fallback?.reason),
          `profile_${profile}_${service}_fallback`, `${service}/Profile ${profile} has no explicit transport selection/fallback decision.`, `${service}:${profile}`);
      }
    }
  }
  for (const serviceId of REQUIRED_SERVICES) {
    const service = data.services?.find(item => item.service === serviceId);
    check(record, Boolean(service), `service_${serviceId}`, `${serviceId} is absent from the live matrix.`, serviceId);
    check(record, service?.http?.live === true, `${serviceId}_http`, `${serviceId} HTTP route is not live.`, `${serviceId}:http`);
    check(record, service?.libp2p?.live === true, `${serviceId}_libp2p`, `${serviceId} libp2p route is not live.`, `${serviceId}:libp2p`);
  }
}

function validateAppBehavior(record, { releaseInventory }) {
  const data = record.data;
  const apps = Array.isArray(data.apps) ? data.apps : [];
  check(record, data.status === 'passed', 'status', `All-app behavior status is ${data.status ?? 'missing'}.`);
  check(record, Number.isInteger(data.app_count) && data.app_count > 0 && data.app_count === apps.length,
    'app_count', `App count ${data.app_count ?? 'missing'} does not match ${apps.length} app rows.`);
  validateCanonicalCoverage(record, apps.map(app => app.app_id), releaseInventory.appIds, 'app behavior');
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
  for (const owner of REQUIRED_SERVICES) {
    check(record, nonEmpty(data.live_state?.transport_by_owner?.[owner]), `owner_transport_${owner}`,
      `Supervisor owner ${owner} has no observed transport.`, owner);
  }
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
  check(record, Array.isArray(outcomes) && outcomes.length >= EXPECTED_SUPERVISOR_CAPABILITIES.length,
    'outcome_count', `Supervisor recorded ${outcomes.length} outcomes; at least ${EXPECTED_SUPERVISOR_CAPABILITIES.length} named outcomes are required.`);
  for (const capability of EXPECTED_SUPERVISOR_CAPABILITIES) {
    const capabilityOutcomes = outcomes.filter(item => item.capability_id === capability);
    check(record, capabilityOutcomes.length > 0, `capability_${capability}`,
      `Supervisor capability ${capability} has no current outcome.`, capability);
    for (const outcome of capabilityOutcomes) {
      check(record, outcome.state === 'available' && outcome.reported_in_ui === true,
        `capability_${capability}_outcome`, `Supervisor capability ${capability} was not available and visibly reported.`, capability);
      check(record, REQUIRED_SERVICES.includes(outcome.owner), `capability_${capability}_owner`,
        `Supervisor capability ${capability} has invalid owner ${outcome.owner ?? 'missing'}.`, capability);
      check(record, nonEmpty(outcome.correlation_id), `capability_${capability}_correlation`,
        `Supervisor capability ${capability} has no correlation ID.`, capability);
      check(record, nonEmpty(outcome.receipt_cid), `capability_${capability}_receipt`,
        `Supervisor capability ${capability} has no receipt CID.`, capability);
    }
  }
  const governed = outcomes.filter(item => ['supervisor.prompt-steering.request', 'supervisor.task-control.request'].includes(item.capability_id));
  check(record, governed.length >= 3 && governed.every(item => nonEmpty(item.receipt_cid) && nonEmpty(item.event_dag_cid)), 'governed_provenance',
    'A governed Supervisor outcome is missing its receipt or event-DAG CID.');
  record.screenshots.push(...validateScreenshots(record, data.screenshots, 'agent-supervisor'));
}

function validateOrbIdl(record, { releaseInventory }) {
  const data = record.data;
  const packets = Array.isArray(data.packets) ? data.packets : [];
  check(record, data.packet_count === packets.length && packets.length > 0, 'packet_count',
    `ORB/IDL packet count ${data.packet_count ?? 'missing'} does not match ${packets.length} rows.`);
  check(record, data.app_count > 0, 'app_count', 'ORB/IDL handoff contains no applications.');
  validateCanonicalCoverage(record, unique(packets.filter(packet => packet.route_id?.startsWith('app:')).map(packet => packet.app_id)),
    releaseInventory.appIds, 'ORB/IDL app packets');
  check(record, new Set(packets.map(packet => packet.packet_id)).size === packets.length,
    'packet_id_uniqueness', 'ORB/IDL packet IDs are not unique.');
  check(record, new Set(packets.map(packet => packet.packet_cid)).size === packets.length,
    'packet_cid_uniqueness', 'ORB/IDL packet CIDs are not unique.');
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
    check(record, /^sha256:[0-9a-f]{64}$/.test(packet.packet_cid ?? ''), `${id}_packet_cid_format`,
      `${id} packet CID is not a deterministic sha256 CID.`, id);
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

function validateMetaSimulator(record, { releaseInventory }) {
  const data = record.data;
  const packets = Array.isArray(data.packets) ? data.packets : [];
  check(record, data.status === 'passed', 'status', `Meta simulator status is ${data.status ?? 'missing'}.`);
  check(record, data.boundary?.simulator_only === true && data.boundary?.hardware_free === true,
    'simulator_boundary', 'Meta evidence is not explicitly simulator-only and hardware-free.');
  check(record, data.boundary?.hardware_pairing_required === false && data.boundary?.physical_hardware_claimed === false,
    'hardware_claim', 'Meta evidence requires or claims physical hardware.');
  const acceptanceEntries = Object.entries(data.acceptance ?? {});
  check(record, acceptanceEntries.length > 0, 'acceptance_present', 'Meta evidence has no named acceptance checks.');
  for (const [name, passed] of acceptanceEntries) {
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
  validateCanonicalCoverage(record, (data.applications ?? []).map(app => app.app_id), releaseInventory.appIds,
    'Meta simulator applications');
  check(record, packets.length > 0, 'packet_rows', 'Meta simulator has no replay packet rows.');
  for (const packet of packets) validateMetaReplayPacket(record, packet);
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
  check(record, tools.length > 0, 'tool_inventory', 'Peer interoperability evidence has no exact per-tool rows.');
  check(record, data.summary?.explicitly_observed_tool_count === tools.length, 'tool_count',
    `Peer tool summary ${data.summary?.explicitly_observed_tool_count ?? 'missing'} does not match ${tools.length} exact rows.`);
  const flattenedTools = services.flatMap(service => (service.tools ?? []).map(tool => `${service.service}:${tool.name}`));
  check(record, sameSet(flattenedTools, tools.map(tool => `${tool.service}:${tool.name}`)), 'tool_reconciliation',
    'Top-level peer tool inventory does not match the exact per-service tool inventories.');
  for (const serviceId of REQUIRED_SERVICES) {
    const service = services.find(item => item.service === serviceId);
    check(record, Boolean(service), `service_${serviceId}`, `${serviceId} has no peer evidence.`, serviceId);
    if (!service) continue;
    check(record, normalizeDecision(service?.decision) === 'GO', `${serviceId}_decision`, `${serviceId} peer decision is ${service?.decision ?? 'missing'}.`, serviceId);
    check(record, (service?.gates ?? []).every(item => item.passed === true), `${serviceId}_gates`, `${serviceId} has failed peer gates.`, serviceId);
    check(record, Array.isArray(service.tools) && service.tools.length > 0, `${serviceId}_tools`,
      `${serviceId} has no exact discovered tool rows.`, serviceId);
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
    check(record, REQUIRED_SERVICES.includes(tool.service) && nonEmpty(tool.name), `tool_${scope}_identity`,
      `${scope} lacks a valid service and exact tool name.`, scope);
    check(record, ALLOWED_TOOL_DISPOSITIONS.has(tool.disposition), `tool_${scope}_disposition`,
      `${scope} has invalid disposition ${tool.disposition ?? 'missing'}.`, scope);
    check(record, nonEmpty(tool.disposition_reason), `tool_${scope}_reason`, `${scope} has no disposition reason.`, scope);
    check(record, tool.availability_inferred_from_count === false, `tool_${scope}_count`, `${scope} availability was inferred from a count.`, scope);
    for (const transport of REQUIRED_TRANSPORTS) {
      const observation = tool.observations?.[transport];
      check(record, Boolean(observation), `tool_${scope}_${transport}_observation`,
        `${scope} has no ${transport} name-level observation.`, scope);
      if (!observation) continue;
      if (tool.disposition === 'executed') {
        check(record, observation.status === 'executed' && observation.invocation_attempted === true
          && observation.invocation_succeeded === true && observation.discovered === true && observation.descriptor_method === true,
        `tool_${scope}_${transport}_executed`, `${scope}/${transport} lacks complete execution, discovery, and descriptor proof.`, scope);
      } else if (tool.disposition === 'denied') {
        check(record, observation.status === 'denied' && observation.invocation_attempted === false
          && observation.discovered === true && observation.descriptor_method === true,
        `tool_${scope}_${transport}_denied`, `${scope}/${transport} denial is not backed by discovery, descriptor, and non-invocation proof.`, scope);
      }
    }
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
  const routes = readPhaseFourArtifact('all-tools-app-route-coverage.json');
  const calls = readPhaseFourArtifact('all-tools-call-envelope-fixtures.json');
  const packets = readPhaseFourArtifact('all-tools-glasses-handoff-packets.json');
  const replay = readPhaseFourArtifact('all-tools-glasses-handoff-replay-bundles.json');
  const controlPlane = readPhaseFourArtifact('all-tools-glasses-control-plane-handoff.json');

  const smokeChecks = validatePhaseFourSmoke(smoke);
  const policyChecks = validatePhaseFourPolicy(policy);
  const adapterChecks = validatePhaseFourAdapter(adapter, policy);
  const browserChecks = validatePhaseFourBrowser(browser, smoke);
  const legacyMetaChecks = validatePhaseFourMeta(legacyMeta);
  const routeOrbGlassesChecks = validateRouteOrbGlassesArtifacts(routes, calls, packets, replay, controlPlane);

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
      'all_tools_route_orb_glasses',
      'SVD-047',
      'Every tool app-route, MCP++ call, ORB/IDL packet, and glasses handoff artifact',
      routeOrbGlassesChecks.every(item => item.passed),
      failedReasons(routeOrbGlassesChecks),
      [routes, calls, packets, replay, controlPlane].map(artifactReference),
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
      'SVD-059',
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
      unknown_task_class_count: gates.filter(item => !/^SVD-\d+$/.test(item.task_id) || !nonEmpty(item.owner)).length,
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
    generated_at: null,
    freshness_status: 'missing',
    error: null,
  };
  if (!fs.existsSync(filePath)) return record;
  try {
    const bytes = fs.readFileSync(filePath);
    record.data = JSON.parse(bytes.toString('utf8'));
    record.sha256 = sha256(bytes);
    record.generated_at = record.data.generated_at ?? record.data.generatedAt ?? null;
    record.status = 'present';
    evaluatePhaseArtifactFreshness(record);
  } catch (error) {
    record.status = 'invalid';
    record.error = errorMessage(error);
  }
  return record;
}

function evaluatePhaseArtifactFreshness(record) {
  const receipt = readJson(freshnessReceiptPath);
  const relativePath = record.path;
  const previous = receipt?.sourceFiles?.find(file => file.path === relativePath);
  if (!previous) {
    record.freshness_status = 'first_observation';
    return;
  }
  if (previous.sha256 === record.sha256) {
    record.freshness_status = 'current';
    return;
  }
  const regeneratedAfterBaseline = isIsoDate(record.generated_at) && isIsoDate(receipt.generatedAt)
    && Date.parse(record.generated_at) > Date.parse(receipt.generatedAt);
  record.freshness_status = regeneratedAfterBaseline ? 'refreshed_after_change' : 'stale';
}

function phaseArtifactChecks(record, expectedSchema) {
  return [
    phaseCheck(record.status === 'present', `${record.path} is missing or invalid${record.error ? `: ${record.error}` : ''}`),
    phaseCheck(record.data?.schema === expectedSchema, `${record.path} has an unexpected schema.`),
    phaseCheck(isIsoDate(record.generated_at), `${record.path} has no valid generated_at timestamp.`),
    phaseCheck(record.freshness_status !== 'stale', `${record.path} changed after the last certification but was not regenerated afterward.`),
  ];
}

function validateRouteOrbGlassesArtifacts(routes, calls, packets, replay, controlPlane) {
  const routeCount = routes.data?.app_routable_tool_count;
  const packetCount = packets.data?.packet_count;
  const checks = [
    ...phaseArtifactChecks(routes, 'swissknife.all-tools-app-route-coverage.v1'),
    ...phaseArtifactChecks(calls, 'swissknife.all-tools-call-envelope-fixtures.v1'),
    ...phaseArtifactChecks(packets, 'swissknife.all-tools-glasses-handoff-packets.v1'),
    ...phaseArtifactChecks(replay, 'swissknife.all-tools-glasses-handoff-replay-bundles.v1'),
    ...phaseArtifactChecks(controlPlane, 'swissknife.all-tools-glasses-control-plane-handoff.v1'),
    phaseCheck((routes.data?.ledger_tool_count ?? 0) > 0, `${routes.path} has no exact ledger tools.`),
    phaseCheck(routes.data?.configured_live_tool_count + routes.data?.real_local_accelerate_tool_count === routes.data?.ledger_tool_count,
      `${routes.path} does not reconcile configured and real-local tools to the exact ledger.`),
    phaseCheck(routeCount + routes.data?.non_app_disposition_count === routes.data?.ledger_tool_count,
      `${routes.path} does not account for every tool with an app route or deliberate disposition.`),
    phaseCheck(routes.data?.missing_binding_count === 0 && routes.data?.missing_policy_count === 0 && routes.data?.metadata_gap_count === 0,
      `${routes.path} declares binding, policy, or route metadata gaps.`),
    phaseCheck(calls.data?.envelope_count === routeCount && calls.data?.app_routable_tool_count === routeCount,
      `${calls.path} does not cover every app-routable tool.`),
    phaseCheck(packetCount > 0 && packets.data?.packets?.length === packetCount,
      `${packets.path} packet rows do not match its packet count.`),
    phaseCheck(replay.data?.bundle_count === packetCount && replay.data?.bundles?.length === packetCount,
      `${replay.path} does not compile every ORB/IDL packet.`),
    phaseCheck(controlPlane.data?.route_count === replay.data?.bundle_count
      && controlPlane.data?.accepted_count === controlPlane.data?.route_count,
    `${controlPlane.path} did not accept every glasses replay bundle.`),
    phaseCheck(controlPlane.data?.receipt_preserved_count === controlPlane.data?.route_count
      && controlPlane.data?.event_dag_preserved_count === controlPlane.data?.route_count,
    `${controlPlane.path} did not preserve every receipt/event-DAG route.`),
  ];
  return checks;
}

function validatePhaseFourSmoke(record) {
  const data = record.data;
  const appCount = data?.app_count;
  const routed = data?.app_with_dispatch_count;
  const unrouted = data?.app_without_dispatch_count;
  return [
    ...phaseArtifactChecks(record, 'swissknife.all-tools-virtual-desktop-app-smoke-coverage.v1'),
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
    phaseCheck(isIsoDate(record.generated_at), `${record.path} has no valid generated_at timestamp.`),
    phaseCheck(record.freshness_status !== 'stale', `${record.path} changed after the last certification but was not regenerated afterward.`),
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
    phaseCheck(isIsoDate(adapter.generated_at), `${adapter.path} has no valid generated_at timestamp.`),
    phaseCheck(adapter.freshness_status !== 'stale', `${adapter.path} changed after the last certification but was not regenerated afterward.`),
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
    ...phaseArtifactChecks(browser, 'swissknife.browser-all-app-compatibility.v1'),
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
    phaseCheck(isIsoDate(record.generated_at), `${record.path} has no valid generated_at timestamp.`),
    phaseCheck(record.freshness_status !== 'stale', `${record.path} changed after the last certification but was not regenerated afterward.`),
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
function artifactReference(record) {
  return {
    path: record.path,
    status: record.status,
    generated_at: record.generated_at ?? null,
    freshness_status: record.freshness_status ?? null,
    sha256: record.sha256,
  };
}
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
    owner: ownerForTask(taskId),
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
    owner_task_id: taskId,
    owner: ownerForTask(taskId),
    code,
    scope: String(scope ?? 'unknown'),
    reason,
    evidence_path: evidencePath ?? null,
    status: 'open',
  };
}

/**
 * A NO-GO is a release result, not an escape hatch. Preserve enough detail to
 * make every unresolved item actionable without inventing a follow-up class:
 * a known SVD task, its queue owner, a concrete scope and reason, and the
 * evidence location that produced the result.
 */
function assessCloseoutIntegrity(decision, blockers) {
  const violations = [];
  if (decision === 'GO' && blockers.length > 0) {
    violations.push({ code: 'go_with_blockers', reason: 'GO cannot be recorded while named blockers remain.' });
  }
  if (decision === 'NO_GO' && blockers.length === 0) {
    violations.push({ code: 'no_go_without_blockers', reason: 'NO-GO requires at least one explicit blocker.' });
  }
  blockers.forEach((item, index) => {
    const identity = `${item.task_id ?? 'unknown'}:${item.scope ?? index}`;
    if (!/^SVD-\d+$/.test(item.task_id ?? '')) {
      violations.push({ code: 'invalid_blocker_task', blocker: identity, reason: 'Blocker task_id is not an existing SVD task-class identifier.' });
    }
    if (item.owner_task_id !== item.task_id) {
      violations.push({ code: 'owner_task_mismatch', blocker: identity, reason: 'Blocker owner_task_id does not match task_id.' });
    }
    if (!nonEmpty(item.owner)) {
      violations.push({ code: 'missing_blocker_owner', blocker: identity, reason: 'Blocker has no named queue owner.' });
    }
    if (!nonEmpty(item.code) || !nonEmpty(item.scope) || !nonEmpty(item.reason)) {
      violations.push({ code: 'incomplete_blocker_detail', blocker: identity, reason: 'Blocker lacks a code, scope, or reason.' });
    }
    if (!nonEmpty(item.evidence_path)) {
      violations.push({ code: 'missing_blocker_evidence', blocker: identity, reason: 'Blocker has no evidence path.' });
    }
  });
  return {
    status: violations.length === 0 ? 'passed' : 'failed',
    decision,
    explicit_blocker_count: blockers.length,
    owner_assigned_blocker_count: blockers.filter(item => nonEmpty(item.owner)).length,
    violations,
    statement: violations.length === 0
      ? (decision === 'GO'
        ? 'GO has no unresolved blockers.'
        : 'NO-GO contains only explicit blockers with an existing SVD task class, named owner, scope, reason, and evidence path.')
      : 'The closeout decision has incomplete or unassigned blocker metadata.',
  };
}

function ownerForTask(taskId) {
  if (!taskOwnerCache) {
    const queue = readJson(supervisorQueuePath);
    taskOwnerCache = new Map(Object.entries(queue?.tasks ?? {}).map(([id, task]) => [id, task.owner]));
  }
  return taskOwnerCache.get(taskId) ?? null;
}

function collectDispositions(records) {
  const approved = [{
    id: 'meta-physical-hardware',
    task_id: 'SVD-059',
    scope: 'meta:physical-hardware-pairing',
    disposition: 'simulator-only',
    rationale: 'SVD-059 explicitly validates the simulator without requiring or claiming physical hardware pairing; SVD-099 may provide a newer compatible proof.',
    approved_by: 'SVD-059 acceptance policy',
    approval_task_id: 'SVD-059',
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
    // A wildcard may describe a reporting category, but it cannot silently
    // waive a named release gap. Every closeout disposition is scope-exact.
    if (disposition.scope !== item.scope) return false;
    if (disposition.closes_gap_code) return disposition.closes_gap_code === item.code;
    return /(denied|unavailable|unsupported|static.only|skip)/i.test(item.code);
  });
}

function buildAppMatrix(appBehavior, orb, meta, releaseInventory) {
  const behaviorApps = appBehavior?.data?.apps ?? [];
  const orbPackets = orb?.data?.packets ?? [];
  const metaApps = meta?.data?.applications ?? [];
  const appIds = unique([
    ...releaseInventory.appIds,
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
    canonical_inventory_status: releaseInventory.summary.status,
    required_app_count: releaseInventory.appIds.length,
    matrix_row_count: rows.length,
    observed_app_count: behaviorApps.length,
    passing_app_count: rows.filter(row => row.passing).length,
    rows,
  };
}

function buildServiceMatrix(profile, peer, approved) {
  const profileRows = profile?.data?.profile_matrix ?? [];
  const profileServices = profile?.data?.services ?? [];
  const peerServices = peer?.data?.services ?? [];
  const cells = REQUIRED_SERVICES.flatMap(service => REQUIRED_PROFILES.map(profileId => {
    const profileCell = profileRows.find(row => row.profile === profileId)?.services?.find(item => item.service === service);
    const profileService = profileServices.find(item => item.service === service);
    const peerService = peerServices.find(item => item.service === service);
    const transportStates = Object.fromEntries(REQUIRED_TRANSPORTS.map(transport => [
      transport,
      profileCell?.[`${transport}_state`] ?? profileCell?.transport_states?.[transport] ?? 'unobserved',
    ]));
    const passing = profileCell?.capability_state === 'supported'
      && REQUIRED_TRANSPORTS.every(transport => transportStates[transport] === 'supported');
    const cellDispositionApproved = approved.some(item => item.scope === `${service}:${profileId}`);
    const capabilitySatisfied = profileCell?.capability_state === 'supported' || cellDispositionApproved;
    const transportsSatisfied = REQUIRED_TRANSPORTS.every(transport => transportStates[transport] === 'supported'
      || cellDispositionApproved || approved.some(item => item.scope === `${service}:${profileId}:${transport}`));
    const approvedNonRelease = !passing && capabilitySatisfied && transportsSatisfied;
    return {
      service,
      profile: profileId,
      capability_state: profileCell?.capability_state ?? 'unobserved',
      http_state: transportStates.http === 'unobserved' ? transportState(peerService, 'http') : transportStates.http,
      libp2p_state: transportStates.libp2p === 'unobserved' ? transportState(peerService, 'libp2p') : transportStates.libp2p,
      selected_transport: profileCell?.fallback?.selected_transport ?? profileCell?.transport_fallback?.selected_transport ?? null,
      fallback_decision: profileCell?.fallback?.decision ?? profileCell?.transport_fallback?.decision ?? null,
      fallback_reason: profileCell?.fallback?.reason ?? profileCell?.transport_fallback?.reason ?? null,
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
    services: REQUIRED_SERVICES.map(serviceId => {
      const service = profileServices.find(item => item.service === serviceId);
      const peerService = peerServices.find(item => item.service === serviceId);
      return {
        service: serviceId,
        owner: service?.owner ?? null,
        live_on_both_transports: service?.live_on_both_transports ?? false,
        http: summarizeServiceTransport(service?.http, peerService?.transports?.http),
        libp2p: summarizeServiceTransport(service?.libp2p, peerService?.transports?.libp2p),
        transport_parity: service?.transport_parity ?? peerService?.parity ?? null,
      };
    }),
    cells,
  };
}

function summarizeServiceTransport(serviceTransport, peerTransport) {
  return {
    live: serviceTransport?.live ?? peerTransport?.connected ?? false,
    endpoint: serviceTransport?.endpoint ?? peerTransport?.endpoint ?? null,
    no_transport_fallback: peerTransport?.no_transport_fallback ?? null,
    remote_ucan_did: peerTransport?.identity?.remote_did ?? serviceTransport?.identity?.remote_did ?? null,
    identity_verified: peerTransport?.identity?.verified ?? null,
    descriptor_cids: peerTransport?.descriptor?.cids ?? serviceTransport?.descriptor_cids ?? [],
    descriptor_cid_retrieval_complete: peerTransport?.descriptor?.cid_retrieval_complete ?? null,
    tool_count: serviceTransport?.tool_catalog?.tool_count ?? peerTransport?.discovered_tool_names?.length ?? 0,
    tool_names: serviceTransport?.tool_catalog?.tool_names ?? peerTransport?.discovered_tool_names ?? [],
    schema_cids: serviceTransport?.tool_catalog?.schema_cids ?? [],
    negotiated_profiles: peerTransport?.normalized_negotiated_profiles ?? [],
    fixture_status: peerTransport?.fixture?.status ?? null,
    event_dag_visible: peerTransport?.fixture?.event_dag?.execution_event_present ?? null,
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
    evidence_status: peer?.status ?? 'missing',
    inventory_complete: peer?.status === 'passed' && rows.length > 0,
    count_only_inference_forbidden: peer?.data?.availability_evidence_policy?.count_only_inference_forbidden ?? false,
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
    replay_packet_count: meta?.data?.packets?.length ?? 0,
    replay_packets: (meta?.data?.packets ?? []).map(packet => ({
      packet_id: packet.packet_id ?? null,
      app_id: packet.app_id ?? null,
      correlation_id: packet.correlation_id ?? null,
      status: packet.status ?? null,
      rollback: packet.rollback ?? null,
      fallback: packet.fallback ?? null,
      receipt_preservation: packet.receipt_preservation ?? null,
    })),
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
    dependency_freshness: record.dependency_freshness ?? null,
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
  else for (const item of report.named_gaps) lines.push(`- **${item.task_id}** (owner: \`${escapeMd(item.owner ?? 'unassigned')}\`) — \`${escapeMd(item.scope)}\` / \`${item.code}\`: ${escapeMd(item.reason)}`);
  lines.push('', '## Closeout integrity', '',
    `- Status: **${report.closeout_integrity.status}**`,
    `- Explicit blockers: ${report.closeout_integrity.explicit_blocker_count}`,
    `- Owner-assigned blockers: ${report.closeout_integrity.owner_assigned_blocker_count}`,
    `- ${report.closeout_integrity.statement}`);
  for (const violation of report.closeout_integrity.violations) {
    lines.push(`- **${violation.code}**: ${escapeMd(violation.reason)}`);
  }
  lines.push('', '## Evidence freshness and status', '', '| Evidence | Task | Status | Generated | SHA-256 |', '| --- | --- | --- | --- | --- |');
  for (const [id, artifact] of Object.entries(report.artifacts)) lines.push(`| \`${id}\` | ${artifact.task_id} | ${artifact.status} | ${artifact.generated_at ?? 'missing'} | \`${artifact.sha256?.slice(0, 12) ?? 'missing'}\` |`);
  lines.push('', '## App behavior', '', `Passing complete app rows: ${report.app_behavior_matrix.passing_app_count}/${report.app_behavior_matrix.required_app_count ?? report.app_behavior_matrix.observed_app_count}.`, '',
    '| App | Backend | Tool / owner / transport | Recovery | ORB packets | Meta |', '| --- | --- | --- | --- | ---: | --- |');
  for (const row of report.app_behavior_matrix.rows) lines.push(`| \`${row.app_id}\` | ${row.backend_behavior} | \`${row.tool_id ?? 'missing'}\` / \`${row.owner ?? 'missing'}\` / \`${row.transport ?? 'missing'}\` | ${row.outage_recovery_reopen ? 'passed' : 'missing'} | ${row.orb_idl_packet_count} | ${row.meta_simulator} |`);
  lines.push('', '## Service / profile / transport matrix', '', `Passing proof cells: ${report.service_profile_transport_matrix.passing_cell_count}/${report.service_profile_transport_matrix.required_cell_count}; release-satisfied cells: ${report.service_profile_transport_matrix.release_satisfied_cell_count}/${report.service_profile_transport_matrix.required_cell_count}.`, '',
    '| Service | Profile | Capability | HTTP | libp2p | Selection |', '| --- | --- | --- | --- | --- | --- |');
  for (const cell of report.service_profile_transport_matrix.cells) lines.push(`| \`${cell.service}\` | ${cell.profile} | ${cell.capability_state} | ${cell.http_state} | ${cell.libp2p_state} | ${cell.fallback_decision ?? 'unobserved'} → ${cell.selected_transport ?? 'none'} |`);
  lines.push('', '## Exact tool accounting', '',
    `- Evidence status: ${report.tool_behavior_matrix.evidence_status}`,
    `- Inventory complete: ${report.tool_behavior_matrix.inventory_complete}`,
    `- Name-level tool rows: ${report.tool_behavior_matrix.tool_count}`,
    `- Executed rows: ${report.tool_behavior_matrix.executed_count}`,
    `- Approved non-release rows: ${report.tool_behavior_matrix.approved_non_release_count}`,
    `- Unsatisfied rows: ${report.tool_behavior_matrix.unsatisfied_count}`,
    `- Count-only availability inference forbidden by evidence: ${report.tool_behavior_matrix.count_only_inference_forbidden}`, '',
    '## Supervisor Console', '',
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
    lines.push(`- **${item.task_id}** (owner: \`${escapeMd(item.owner ?? 'unassigned')}\`) — \`${escapeMd(item.scope)}\`: ${escapeMd(item.reason)}`);
  }
  lines.push('', '## Closeout integrity', '',
    `- Status: **${report.closeout_integrity.status}**`,
    `- Explicit blockers: ${report.closeout_integrity.explicit_blocker_count}`,
    `- Owner-assigned blockers: ${report.closeout_integrity.owner_assigned_blocker_count}`,
    `- ${report.closeout_integrity.statement}`);
  lines.push('', '## Task-class conclusion', '',
    report.unknown_task_class_audit.statement,
    'This ledger does not create follow-up task classes; it records only the existing owner task for each unsatisfied gate.');
  return `${lines.join('\n')}\n`;
}

function renderSignoff(report) {
  const lines = [
    '# Refactor Final Signoff', '',
    'Task: SVD-060 — Final all-tools ORB/IDL Meta glasses release closeout', '',
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
  else for (const item of report.named_gaps) lines.push(`- **${item.task_id}** (owner: \`${escapeMd(item.owner ?? 'unassigned')}\`) — \`${escapeMd(item.scope)}\`: ${escapeMd(item.reason)}`);
  lines.push('', '## Non-release boundary', '',
    '- Physical Meta hardware pairing is not required, was not tested, and is not claimed. SVD-059 simulator evidence is the approved release scope.',
    '- Denied non-mutating peer tools are accepted only when SVD-100 records exact name-level discovery, a typed denial reason, and no count-based inference.',
    '- Any other unavailable, unsupported, static-only, missing, or failed case remains a named blocker unless an explicit approved disposition is added to its source artifact.', '',
    '## Evidence', '',
    '- Machine report: `test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json`',
    '- Readable report: `test-results/virtual-desktop-ipfs-mcp-orb/all-tools-release-evidence.md`',
    '- Freshness receipt: `docs/virtual-desktop-release-evidence.fingerprint.json`', '',
    report.decision.status === 'GO'
      ? 'The SVD-060 release scope is approved.'
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

function releaseEvidenceGeneratedAt(records) {
  const timestamps = records
    .map(record => record.data?.generated_at)
    .filter(isIsoDate)
    .sort();
  return timestamps.at(-1) ?? '1970-01-01T00:00:00.000Z';
}

function releaseEvidenceRevision(records) {
  const inputs = records
    .map(record => `${record.id}:${record.sha256 ?? 'MISSING'}`)
    .sort()
    .join('\n');
  return `content-addressed:${sha256(inputs)}`;
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

/** Screenshot paths originate in evidence JSON; fail the release as a named
 * check instead of allowing malformed paths or unreadable files to abort the
 * compiler before it can emit a useful NO-GO receipt. */
function isValidPngReceipt(declaredPath) {
  const filePath = safeProjectPath(declaredPath);
  try {
    return Boolean(filePath && fs.statSync(filePath).isFile() && isPng(filePath));
  } catch {
    return false;
  }
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
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === value) return;
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function normalizePath(value) { return value.split(path.sep).join('/'); }
function pathIsWithinSource(filePath, sourcePath) {
  const normalizedFile = normalizePath(filePath);
  const normalizedSource = normalizePath(sourcePath).replace(/\/$/, '');
  return normalizedFile === normalizedSource || normalizedFile.startsWith(`${normalizedSource}/`);
}
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

if (require.main === module) main();

module.exports = {
  _test: {
    buildAppMatrix,
    assessCloseoutIntegrity,
    expectedSupervisorCapabilities: EXPECTED_SUPERVISOR_CAPABILITIES,
    isClosedByDisposition,
    loadReleaseInventory,
    phaseArtifactChecks,
    validateCanonicalCoverage,
    validateDependencyFreshness,
    validateActionHandoff,
    validateMetaReplayPacket,
    validateSimulatorReplay,
    validateSupervisorAllAppUi,
    validatePeerEvidence,
    validateRouteOrbGlassesArtifacts,
    isPlaceholderExecution,
    validateFreshToolBackedPairs,
    validateFreshCatalog,
    buildFreshReleaseReport,
  },
};
