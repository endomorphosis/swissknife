'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { _test: releaseEvidence } = require('../../scripts/build-virtual-desktop-release-evidence.cjs');

function record(taskId = 'SVD-060') {
  return { taskId, path: 'fixture.json', checks: [], gaps: [] };
}

test('fresh release inputs fail closed for absent and stale receipts', () => {
  const missingFindings = [];
  const missingPath = path.join(os.tmpdir(), `svd-114-missing-${process.pid}.json`);
  const missing = releaseEvidence.readFreshReleaseInput(
    'missing', missingPath, 'SVD-TEST', 'test.schema.v1', Date.now(), finding => missingFindings.push(finding),
  );
  assert.equal(missing.status, 'missing');
  assert.equal(missingFindings[0].code, 'missing_evidence_input');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svd-114-stale-'));
  const stalePath = path.join(tempDir, 'receipt.json');
  try {
    fs.writeFileSync(stalePath, JSON.stringify({
      schema: 'test.schema.v1', task_id: 'SVD-TEST', generated_at: '2000-01-01T00:00:00.000Z',
    }));
    const staleFindings = [];
    const stale = releaseEvidence.readFreshReleaseInput(
      'stale', stalePath, 'SVD-TEST', 'test.schema.v1', Date.now(), finding => staleFindings.push(finding),
    );
    assert.equal(stale.freshness, 'stale');
    assert.equal(staleFindings[0].code, 'stale_evidence_timestamp');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

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

test('fresh release evidence distinguishes executable browser bindings from the broader backend catalog', () => {
  const fixtureOnly = [];
  const bindings = {
    bindings: [{
      app_id: 'terminal', binding_id: 'terminal.ipfs_kit_py.retrieve_content',
      owner: 'ipfs_kit_py', capability_id: 'terminal.ipfs_kit_py.ipfs-kit-storage', transports: ['http'],
    }],
  };
  releaseEvidence.validateFreshToolBackedPairs(bindings, {
    fixture_boundary: { kind: 'isolated-browser-behavior-simulator' },
  }, finding => fixtureOnly.push(finding));
  assert.equal(fixtureOnly[0].code, 'fixture_only_behavior_proof');
  assert.equal(fixtureOnly[0].application, 'terminal');
  assert.equal(fixtureOnly[0].tool, 'terminal.ipfs_kit_py.retrieve_content');
  assert.equal(fixtureOnly[0].owner, 'ipfs_kit_py');

  const placeholder = [];
  releaseEvidence.validateFreshToolBackedPairs(bindings, {
    executions: [{ binding_id: 'terminal.ipfs_kit_py.retrieve_content', execution_mode: 'fixture-only' }],
  }, finding => placeholder.push(finding));
  assert.equal(placeholder[0].code, 'placeholder_execution_claim');
  assert.equal(placeholder[0].task_id, 'SVD-106');

  const liveGateway = [];
  releaseEvidence.validateFreshToolBackedPairs(bindings, {
    execution_origin: 'canonical-virtual-desktop-browser',
    browser_origin: 'http://localhost:3001',
    executions: [{
      app_id: 'terminal',
      binding_id: 'terminal.ipfs_kit_py.retrieve_content',
      owner: 'ipfs_kit_py',
      selected_tool_id: 'ipfs_cat',
      selected_transport: 'http',
      correlation_id: 'desktop:terminal:1',
      request: { route: '/mcp/tools/call', same_origin: true },
      policy: { outcome: 'allow', decision_id: 'desktop-policy:terminal' },
      response: { outcome: 'executed', ok: true },
      receipt_refs: ['bafkreifpvbepoilyb5hnhj5zph7cj52xnd2pgw6imbksjzx2rsfyzud5qa'],
      event_dag_refs: ['bafkreiglfkcp2zglgxtvkmhtb5wbibtc4oxtfirupnvxha5vr2eisjodh4'],
      persistence: {
        status: 'persisted',
        receipt_cid: 'bafkreifpvbepoilyb5hnhj5zph7cj52xnd2pgw6imbksjzx2rsfyzud5qa',
        event_cid: 'bafkreiglfkcp2zglgxtvkmhtb5wbibtc4oxtfirupnvxha5vr2eisjodh4',
      },
      transport_observation: {
        transport: 'http',
        descriptor_cid: 'bafkreiea6ifqo536vjhu5iab3gccs3e6mp2hsabokmm7juyh64wz6a2mpi',
        ucan_did_verified: true,
        remote_did: 'did:key:z6MkvAUPBCMQzakz16QeKSg68XSeewjGUvpzUjxQGD33qwKu',
        identity_proof_cid: 'bafkreicz2chhqa2yrdagrztspcknorbyluuypoq2vq7ujcdro4twlvwjrm',
        correlation_id: 'desktop:terminal:1',
      },
      recovery: { correlation_id_preserved: true },
      browser_observed_urls: ['/mcp/tools/call'],
      no_backend_urls_or_credentials_exposed: true,
    }],
  }, finding => liveGateway.push(finding), {
    taskId: 'SVD-126',
    evidencePath: 'test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-gateway-executions.json',
  });
  assert.deepEqual(liveGateway, []);
});

test('fresh release evidence rejects declared-but-unbound tool-backed backend pairs', () => {
  const findings = [];
  releaseEvidence.validateFreshBindingLedger({
    application_backend_assignments: [{
      app_id: 'terminal', backend_owner: 'ipfs_kit_py',
      capability_id: 'terminal.ipfs_kit_py.storage',
      transport_policy: { mcp: 'required', mcp_plus_plus: 'eligible' },
      current_binding_state: 'declared_no_tool_binding',
      reasons: ['The app backend contract explicitly reports declared_no_tool_binding.'],
    }],
  }, {
    apps: [{ app_id: 'terminal', backend_state: 'tool_backed' }],
  }, { bindings: [] }, finding => findings.push(finding));

  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'declared_no_tool_binding');
  assert.equal(findings[0].application, 'terminal');
  assert.equal(findings[0].tool, 'terminal.ipfs_kit_py.storage');
  assert.equal(findings[0].owner, 'ipfs_kit_py');
  assert.equal(findings[0].task_id, 'SVD-102');
  assert.match(findings[0].remediation, /explicit mediated application\/tool binding/);
});

test('fresh release evidence refuses gateway records without complete real-call provenance', () => {
  const findings = [];
  const bindings = { bindings: [{
    app_id: 'terminal', binding_id: 'terminal.ipfs_kit_py.retrieve_content',
    owner: 'ipfs_kit_py', transports: ['http'],
  }] };
  releaseEvidence.validateFreshToolBackedPairs(bindings, {
    execution_origin: 'canonical-virtual-desktop-browser', browser_origin: 'http://localhost:3001',
    executions: [{
      app_id: 'terminal', binding_id: 'terminal.ipfs_kit_py.retrieve_content', owner: 'ipfs_kit_py',
      selected_transport: 'http', selected_tool_id: 'ipfs_cat', response: { outcome: 'executed', ok: true },
    }],
  }, finding => findings.push(finding), { taskId: 'SVD-126' });

  assert.equal(findings[0].code, 'incomplete_live_execution');
  assert.equal(findings[0].application, 'terminal');
  assert.equal(findings[0].owner, 'ipfs_kit_py');
});

test('fresh release evidence rejects every unclassified backend tool with a remediation', () => {
  const findings = [];
  releaseEvidence.validateFreshCatalog({ entries: [{
    owner: 'ipfs_datasets_py', tool_id: 'query', disposition: { kind: 'unclassified' },
    reachability: { approved_transports: ['libp2p'] },
  }] }, null, finding => findings.push(finding));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'unclassified_backend_tool');
  assert.equal(findings[0].transport, 'libp2p');
  assert.match(findings[0].remediation, /Classify/);
});
