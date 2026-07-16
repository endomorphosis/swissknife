'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { _test: releaseEvidence } = require('../../scripts/build-virtual-desktop-release-evidence.cjs');

function record(taskId = 'SVD-060') {
  return { taskId, path: 'fixture.json', checks: [], gaps: [] };
}

test('canonical inventory prevents partial app evidence from satisfying the release', () => {
  const inventory = releaseEvidence.loadReleaseInventory();
  assert.equal(inventory.summary.status, 'passed');
  assert.ok(inventory.appIds.length > 0);

  const appMatrix = releaseEvidence.buildAppMatrix({
    data: { apps: [{ app_id: inventory.appIds[0], status: 'passed' }] },
  }, { data: { packets: [] } }, { data: { applications: [] } }, inventory);

  assert.equal(appMatrix.required_app_count, inventory.appIds.length);
  assert.equal(appMatrix.matrix_row_count, inventory.appIds.length);
  assert.equal(appMatrix.observed_app_count, 1);
  assert.equal(appMatrix.passing_app_count, 0);
  assert.equal(appMatrix.rows.filter(row => row.backend_behavior === 'missing').length, inventory.appIds.length - 1);
});

test('canonical coverage rejects missing, unexpected, and duplicate app IDs', () => {
  const observed = record('SVD-096');
  releaseEvidence.validateCanonicalCoverage(observed, ['terminal', 'terminal', 'unexpected'],
    ['terminal', 'vibecode'], 'app behavior');

  assert.ok(observed.gaps.some(gap => gap.code === 'app behavior_duplicates'));
  assert.ok(observed.gaps.some(gap => gap.code === 'app behavior_coverage'));
});

test('empty peer tool inventories cannot pass on service counts alone', () => {
  const observed = record('SVD-100');
  observed.data = {
    decision: 'go',
    availability_evidence_policy: { count_only_inference_forbidden: true },
    summary: { explicitly_observed_tool_count: 0 },
    blockers: [],
    services: [],
    tools: [],
  };
  releaseEvidence.validatePeerEvidence(observed);

  assert.ok(observed.gaps.some(gap => gap.code === 'tool_inventory'));
  assert.ok(observed.gaps.some(gap => gap.code === 'service_count'));
});

test('Meta replay packets require every modality, scenario, provenance link, and privacy result', () => {
  const observed = record('SVD-099');
  releaseEvidence.validateMetaReplayPacket(observed, {
    packet_id: 'packet-1',
    app_id: 'terminal',
    correlation_id: 'corr-1',
    interface_cid: 'bafy-interface',
    status: 'passed',
    layout: { bounded: true, controls_overlap: false },
    receipt_preservation: { preserved: true },
    rollback: { expected_mode: 'restore', observed_state: 'restore-complete' },
    fallback: { user_visible: true, observed_surface: 'mobile_card' },
    operator_decisions: ['approved'],
    modality_replays: {},
  });

  assert.equal(observed.gaps.filter(gap => /has no .* replay/.test(gap.reason)).length, 5);
});

test('a wildcard disposition cannot silently close named gaps', () => {
  const gap = { code: 'tool_unavailable', scope: 'tool:ipfs_kit_py:add' };
  const wildcard = [{ scope: '*', disposition: 'unavailable' }];
  const exact = [{ scope: gap.scope, disposition: 'unavailable' }];

  assert.equal(releaseEvidence.isClosedByDisposition(gap, wildcard), false);
  assert.equal(releaseEvidence.isClosedByDisposition(gap, exact), true);
});

test('NO-GO closeout requires explicit owner-assigned blocker evidence', () => {
  const valid = releaseEvidence.assessCloseoutIntegrity('NO_GO', [{
    task_id: 'SVD-060', owner_task_id: 'SVD-060', owner: 'mcp',
    code: 'missing_evidence', scope: 'meta-simulator', reason: 'Simulator evidence is missing.',
    evidence_path: 'test-results/meta-simulator.json',
  }]);
  assert.equal(valid.status, 'passed');
  assert.equal(valid.owner_assigned_blocker_count, 1);

  const invalid = releaseEvidence.assessCloseoutIntegrity('NO_GO', [{
    task_id: 'unknown', owner_task_id: 'SVD-060', owner: '', code: '', scope: '', reason: '', evidence_path: null,
  }]);
  assert.equal(invalid.status, 'failed');
  assert.deepEqual(invalid.violations.map(item => item.code).sort(), [
    'incomplete_blocker_detail', 'invalid_blocker_task', 'missing_blocker_evidence',
    'missing_blocker_owner', 'owner_task_mismatch',
  ]);
});

test('changed dependencies stale evidence captured before the prior certification', () => {
  const observed = record('SVD-098');
  observed.id = 'orb_idl_packets';
  observed.generated_at = '2026-07-13T00:00:00.000Z';
  observed.sourcePaths = ['src/example.ts'];
  observed.source_fingerprint = {
    files: [{ path: 'src/example.ts', sha256: 'new', exists: true }],
  };
  releaseEvidence.validateDependencyFreshness(observed, {
    schema: 'swr_029_evidence_freshness_receipt_v1',
    id: 'virtual-desktop-release-evidence',
    generatedAt: '2026-07-14T00:00:00.000Z',
    sourceFiles: [{ path: 'src/example.ts', sha256: 'old' }],
  });

  assert.equal(observed.dependency_freshness.status, 'stale');
  assert.ok(observed.gaps.some(gap => gap.code === 'stale_dependency_fingerprint'));
});

test('route, call, ORB/IDL, replay, and control-plane counts must reconcile exactly', () => {
  const artifact = (schema, data = {}) => ({
    status: 'present', path: `${schema}.json`, generated_at: '2026-07-14T00:00:00.000Z',
    freshness_status: 'current', data: { schema, ...data },
  });
  const checks = releaseEvidence.validateRouteOrbGlassesArtifacts(
    artifact('swissknife.all-tools-app-route-coverage.v1', {
      ledger_tool_count: 3, configured_live_tool_count: 2, real_local_accelerate_tool_count: 1,
      app_routable_tool_count: 2, non_app_disposition_count: 1,
      missing_binding_count: 0, missing_policy_count: 0, metadata_gap_count: 0,
    }),
    artifact('swissknife.all-tools-call-envelope-fixtures.v1', { envelope_count: 1, app_routable_tool_count: 2 }),
    artifact('swissknife.all-tools-glasses-handoff-packets.v1', { packet_count: 1, packets: [{}] }),
    artifact('swissknife.all-tools-glasses-handoff-replay-bundles.v1', { bundle_count: 1, bundles: [{}] }),
    artifact('swissknife.all-tools-glasses-control-plane-handoff.v1', {
      route_count: 1, accepted_count: 1, receipt_preserved_count: 1, event_dag_preserved_count: 1,
    }),
  );

  assert.ok(checks.some(check => !check.passed && /call-envelope-fixtures/.test(check.reason)));
});

test('supervisor all-app UI evidence fails closed when the control-plane app is absent', () => {
  const valid = record('SVD-070');
  valid.data = {
    decision: 'GO',
    app_validations: [{
      app_id: 'agent-supervisor',
      routes: [{ service_bindings: Array.from({ length: 6 }, () => ({})) }],
    }],
    coverage: { opened_app_count: 1, exercised_route_count: 1, expected_route_count: 1 },
    acceptance: { screenshots_recorded: true },
    screenshots: ['test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/expanded-meta-io/00-agent-supervisor-control-plane.png'],
    ui_validation: {
      hidden_control_count: 0,
      text_overlap_count: 0,
      broken_focus_count: 0,
      unlabeled_control_count: 0,
      horizontal_overflow_count: 0,
      browser_console_error_count: 0,
      failed_request_count: 0,
      unreported_backend_failure_count: 0,
    },
  };
  releaseEvidence.validateSupervisorAllAppUi(valid, ['agent-supervisor']);
  assert.equal(valid.gaps.length, 0);

  const missingSupervisor = record('SVD-070');
  missingSupervisor.data = { ...valid.data, app_validations: [] };
  releaseEvidence.validateSupervisorAllAppUi(missingSupervisor, ['agent-supervisor']);
  assert.ok(missingSupervisor.gaps.some(gap => gap.code === 'agent_supervisor_surface'));

  const missingScreenshot = record('SVD-070');
  missingScreenshot.data = {
    ...valid.data,
    screenshots: ['test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/expanded-meta-io/missing.png'],
  };
  releaseEvidence.validateSupervisorAllAppUi(missingScreenshot, ['agent-supervisor']);
  assert.ok(missingScreenshot.gaps.some(gap => gap.code === 'ui_screenshot_files'));
});

test('control-plane action handoff requires every supervisor steering capability', () => {
  const capabilities = releaseEvidence.expectedSupervisorCapabilities;
  const valid = record('SVD-110');
  valid.data = {
    packet_count: capabilities.length,
    supervisor_action_packet_count: capabilities.length,
    packets: capabilities.map(action_id => ({
      action_id,
      receipt_refs: ['receipt-cid'],
      event_dag_refs: ['event-dag-ref'],
    })),
  };
  releaseEvidence.validateActionHandoff(valid);
  assert.equal(valid.gaps.length, 0);

  const incomplete = record('SVD-110');
  incomplete.data = {
    ...valid.data,
    packet_count: capabilities.length - 1,
    supervisor_action_packet_count: capabilities.length - 1,
    packets: valid.data.packets.slice(1),
  };
  releaseEvidence.validateActionHandoff(incomplete);
  assert.ok(incomplete.gaps.some(gap => gap.code === 'action_handoff_supervisor'));
});

test('Meta glasses simulator requires every modality for each canonical app', () => {
  const valid = record('SVD-072');
  valid.data = {
    decision: 'GO',
    passed: true,
    valid: true,
    acceptance: { full_replay: true },
    boundary: { simulator_only: true, hardware_free: true, physical_hardware_claimed: false },
    source_handoff: { task_id: 'SVD-071', packet_count: 1 },
    replays: [{ app_id: 'agent-supervisor' }],
    modality_summary: {
      'display.output': 1,
      'camera.photo_capture': 1,
      'camera.video_capture': 1,
      'microphone.input': 1,
      'microphone.transcription': 1,
      'speaker.output': 1,
      'headphone.output': 1,
    },
  };
  releaseEvidence.validateSimulatorReplay(valid, { packet_count: 1 }, ['agent-supervisor']);
  assert.equal(valid.gaps.length, 0);

  const incomplete = record('SVD-072');
  incomplete.data = {
    ...valid.data,
    modality_summary: { ...valid.data.modality_summary, 'speaker.output': 0 },
  };
  releaseEvidence.validateSimulatorReplay(incomplete, { packet_count: 1 }, ['agent-supervisor']);
  assert.ok(incomplete.gaps.some(gap => gap.code === 'simulator_modalities'));
});
