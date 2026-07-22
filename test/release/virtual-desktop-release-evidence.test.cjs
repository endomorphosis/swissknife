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
      invocation: {
        operation_class: 'read_request', narrow_non_mutating_input: true,
        confirmation_required: false, dry_run: true, confirmation_or_policy: 'safe_read_dry_run',
      },
      request: { route: '/mcp/tools/call', same_origin: true },
      policy: { outcome: 'allow', decision_id: 'desktop-policy:terminal', consent: 'not_required', dry_run: true },
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

test('all-app workflow evidence accepts the canonical primary control only with explicit failure and recovery paths', () => {
  const viewport = name => ({
    opened: true,
    primary_control: { probe_id: `terminal-${name}-primary`, name: 'Retrieve content', action_succeeded: true },
    states: { recovery: { closed_to_desktop: true } },
    app_workflow: null,
  });
  const app = {
    pass: true,
    manifest_ux_scenarios: {
      success: 'The retrieved content and receipt are visible.',
      error: 'A policy-aware error identifies the failed request.',
      fallback: 'Retry locally or close the window and return to the desktop.',
    },
    desktop: viewport('desktop'),
    mobile: viewport('mobile'),
  };

  const valid = releaseEvidence.buildPrimaryWorkflowTrace('terminal', 'SVD-135', app);
  assert.equal(valid.status, 'passed');
  assert.equal(valid.evidence_kind, 'canonical_primary_control');
  assert.equal(valid.owner_task_id, 'SVD-135');

  const missingRecovery = structuredClone(app);
  missingRecovery.manifest_ux_scenarios.fallback = '';
  assert.equal(releaseEvidence.buildPrimaryWorkflowTrace('terminal', 'SVD-135', missingRecovery).status, 'failed');
});

test('all-app backend evidence requires diagnostic K/D/A plus call-bound receipts for every semantic role', () => {
  const owners = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'];
  const cid = `b${'a'.repeat(58)}`;
  const catalog = new Map(owners.map(owner => [owner, {
    owner,
    transports: Object.fromEntries(['http', 'libp2p'].map(transport => [transport, {
      real_safe_read: true, application_safe_read: true, no_transport_fallback: true,
      policy: { policy_outcome: 'allow' },
      receipt_cid: cid,
      event_dag_cid: cid,
      descriptor_cid: cid,
      remote_did: `did:key:${owner}-${transport}`,
    }])),
  }]));
  const execution = {
    transport: 'http', operation_class: 'read_request', execution_mode: 'real_safe_read',
    correlation_id: 'corr-1', policy: { decision_id: 'allow-1', outcome: 'allow', consent: 'not_required' },
    confirmation: { required: false, dry_run: false },
    did_identity: { verified: true, remote_did: 'did:key:peer', identity_proof_cid: cid },
    descriptor_cid: cid, receipt_cid: cid, event_dag_cid: cid,
    persistence_status: 'persisted', outcome: 'executed', same_origin_mediator: true,
    direct_backend_details_exposed: false,
  };
  const toolRecord = {
    disposition: 'tool_backed',
    diagnostic_kda_status: { rows: owners.map((owner, index) => ({
      owner, kda_key: ['K', 'D', 'A'][index], diagnostic_only: true, state: 'reachable', reason: 'Independent safe read passed.',
    })) },
    semantic_backend_roles: { roles: [{
      binding_id: 'terminal.ipfs_kit_py.retrieve', owner: owners[0], semantic_role: 'retrieve content',
      policy_class: 'safe_read', mutates_remote_state: false, executions: [execution],
    }] },
    proof: { diagnostic_status_is_not_semantic_assignment: true },
  };

  const expectedBindings = [{
    app_id: 'terminal', binding_id: 'terminal.ipfs_kit_py.retrieve', owner: owners[0], transports: ['http'],
  }];
  assert.equal(releaseEvidence.buildBackendAndReceiptTrace('terminal', toolRecord, catalog, expectedBindings).status, 'passed');
  const missingReceipt = structuredClone(toolRecord);
  delete missingReceipt.semantic_backend_roles.roles[0].executions[0].receipt_cid;
  const invalid = releaseEvidence.buildBackendAndReceiptTrace('terminal', missingReceipt, catalog, expectedBindings);
  assert.equal(invalid.status, 'failed');
  assert.deepEqual(invalid.failing_binding_ids, ['terminal.ipfs_kit_py.retrieve']);

  const conflatedKda = structuredClone(toolRecord);
  conflatedKda.diagnostic_kda_status.rows[0].kda_key = 'D';
  assert.equal(releaseEvidence.buildBackendAndReceiptTrace('terminal', conflatedKda, catalog, expectedBindings).status, 'failed');

  const ungovernedRead = structuredClone(toolRecord);
  ungovernedRead.semantic_backend_roles.roles[0].executions[0].policy.outcome = 'require_confirmation';
  assert.equal(releaseEvidence.buildBackendAndReceiptTrace('terminal', ungovernedRead, catalog, expectedBindings).status, 'failed');

  const fallbackCatalog = structuredClone(Object.fromEntries(catalog));
  fallbackCatalog[owners[0]].transports.http.no_transport_fallback = false;
  assert.equal(releaseEvidence.buildBackendAndReceiptTrace(
    'terminal', toolRecord, new Map(Object.entries(fallbackCatalog)), expectedBindings,
  ).status, 'failed');

  const forgedLocal = structuredClone(toolRecord);
  forgedLocal.disposition = 'browser_local';
  forgedLocal.semantic_backend_roles.roles = [];
  const reconciled = releaseEvidence.buildBackendAndReceiptTrace('terminal', forgedLocal, catalog, expectedBindings);
  assert.equal(reconciled.status, 'failed');
  assert.equal(reconciled.canonical_binding_reconciliation.status, 'failed');
});

test('ORB/IDL and Meta simulator evidence is explicit for both applicable and non-applicable apps', () => {
  const notApplicable = releaseEvidence.buildOrbMetaTrace('calculator', [], [], [], 'browser_local');
  assert.equal(notApplicable.orb_idl.status, 'not_applicable');
  assert.match(notApplicable.orb_idl.rationale, /browser_local/);
  assert.equal(notApplicable.meta_simulator.status, 'not_applicable');

  const missing = releaseEvidence.buildOrbMetaTrace(
    'terminal', [{ binding_id: 'terminal.ipfs_kit_py.retrieve' }], [], [], 'tool_backed',
  );
  assert.equal(missing.orb_idl.status, 'failed');
  assert.deepEqual(missing.orb_idl.missing_binding_ids, ['terminal.ipfs_kit_py.retrieve']);
  assert.equal(missing.meta_simulator.status, 'failed');
});

test('ORB/IDL trace accepts multiple governed action packets for one binding and replays each packet', () => {
  const bindingId = 'agent-supervisor.ipfs_accelerate_py.control';
  const cid = `sha256:${'a'.repeat(64)}`;
  const packet = packetId => ({
    app_id: 'agent-supervisor', binding_id: bindingId, packet_id: packetId,
    interface_cid: cid, peer_did: 'did:key:supervisor-peer',
    correlation_id: `correlation-${packetId}`, receipt_refs: [{ ref: `receipt:${packetId}`, cid }],
    event_dag_refs: [{ ref: `event-dag:${packetId}`, cid }],
  });
  const replay = packetId => ({
    app_id: 'agent-supervisor', packet_id: packetId, status: 'passed',
    compiled_packet_verified: true, receipt_event_dag_preserved: true,
    modalities: Object.fromEntries(['display', 'camera', 'microphone', 'speaker', 'input'].map(modality => [modality, {
      flows: ['primary', 'permission_denied', 'route_unavailable'].map(scenario => ({
        scenario, receipt_refs_preserved: true, event_dag_refs_preserved: true, physical_hardware_claimed: false,
      })),
    }])),
  });

  const result = releaseEvidence.buildOrbMetaTrace(
    'agent-supervisor', [{ binding_id: bindingId }],
    [packet('packet-1'), packet('packet-2')], [replay('packet-1'), replay('packet-2')], 'tool_backed',
  );

  assert.equal(result.orb_idl.status, 'passed');
  assert.deepEqual(result.orb_idl.packet_ids, ['packet-1', 'packet-2']);
  assert.equal(result.meta_simulator.status, 'passed');
  assert.deepEqual(result.meta_simulator.packet_ids, ['packet-1', 'packet-2']);
});

test('app improvement gap owners are stable by app ID rather than catalog position', () => {
  const expected = {
    terminal: 'SVD-135', vibecode: 'SVD-136', 'music-studio-unified': 'SVD-137', 'ai-chat': 'SVD-138',
    'file-manager': 'SVD-139', 'task-manager': 'SVD-140', todo: 'SVD-141', 'model-browser': 'SVD-142',
    huggingface: 'SVD-143', openrouter: 'SVD-144', 'ipfs-explorer': 'SVD-145', 'device-manager': 'SVD-146',
    settings: 'SVD-147', 'mcp-control': 'SVD-148', 'api-keys': 'SVD-149', github: 'SVD-150',
    'oauth-login': 'SVD-151', cron: 'SVD-152', navi: 'SVD-153', 'p2p-network': 'SVD-154',
    'p2p-chat-unified': 'SVD-155', 'neural-network-designer': 'SVD-156', 'training-manager': 'SVD-157',
    calculator: 'SVD-158', clock: 'SVD-159', calendar: 'SVD-160', peertube: 'SVD-161',
    'friends-list': 'SVD-162', 'image-viewer': 'SVD-163', notes: 'SVD-164', 'media-player': 'SVD-165',
    'system-monitor': 'SVD-166', 'neural-photoshop': 'SVD-167', cinema: 'SVD-168', strudel: 'SVD-169',
    'strudel-ai-daw': 'SVD-170', 'music-studio': 'SVD-171', 'p2p-chat': 'SVD-172',
    'datasets-browser': 'SVD-173', 'accelerate-panel': 'SVD-174', 'idl-explorer': 'SVD-175',
    'glasses-preview': 'SVD-176', 'orb-auto-ui': 'SVD-177', 'mcp-plus-plus': 'SVD-178',
    'agent-supervisor': 'SVD-179',
  };

  assert.deepEqual(releaseEvidence.APP_IMPROVEMENT_TASK_BY_APP_ID, expected);
  assert.equal(new Set(Object.values(expected)).size, 45);
  assert.equal(releaseEvidence.appImprovementTaskId('ai-chat'), 'SVD-138');
  assert.equal(releaseEvidence.appImprovementTaskId('unknown-app'), null);
});

test('release validation accepts only fully evidenced confirmation-gated governed dry runs', () => {
  const cid = `b${'a'.repeat(58)}`;
  const binding = {
    app_id: 'terminal', binding_id: 'terminal.ipfs_kit_py.retrieve_content', owner: 'ipfs_kit_py', transports: ['http'],
  };
  const execution = {
    app_id: binding.app_id, binding_id: binding.binding_id, owner: binding.owner,
    selected_tool_id: 'ipfs_cat', selected_transport: 'http', correlation_id: 'desktop:terminal:1',
    invocation: {
      operation_class: 'governed_write_request', confirmation_required: true, dry_run: true,
      confirmation_or_policy: 'confirmation_gated_dry_run',
    },
    request: { same_origin: true, route: '/mcp/tools/call' },
    response: { outcome: 'executed', ok: true },
    policy: { outcome: 'require_confirmation', decision_id: 'policy-1', consent: 'granted', dry_run: true },
    receipt_refs: [cid], event_dag_refs: [cid],
    persistence: { status: 'persisted', receipt_cid: cid, event_cid: cid },
    transport_observation: {
      transport: 'http', descriptor_cid: cid, ucan_did_verified: true, remote_did: 'did:key:peer',
      identity_proof_cid: cid, correlation_id: 'desktop:terminal:1',
    },
    recovery: { correlation_id_preserved: true }, browser_observed_urls: ['/mcp/tools/call'],
    no_backend_urls_or_credentials_exposed: true,
  };

  assert.equal(releaseEvidence.validLiveGatewayExecution(execution, binding, true), true);
  for (const missing of ['consent', 'dry_run']) {
    const invalid = structuredClone(execution);
    delete invalid.policy[missing];
    assert.equal(releaseEvidence.validLiveGatewayExecution(invalid, binding, true), false);
  }
  const invalidConfirmation = structuredClone(execution);
  invalidConfirmation.invocation.confirmation_required = false;
  assert.equal(releaseEvidence.validLiveGatewayExecution(invalidConfirmation, binding, true), false);
  const forgedAllow = structuredClone(execution);
  forgedAllow.policy.outcome = 'allow';
  forgedAllow.policy.consent = 'not_required';
  assert.equal(releaseEvidence.validLiveGatewayExecution(forgedAllow, binding, true), false);
});

test('profile transport validation preserves explicit governed dry-run evidence', () => {
  const cid = `b${'a'.repeat(58)}`;
  const observation = {
    transport: 'libp2p', application_originated: true, selected_tool_id: 'ipfs_cat',
    correlation_id: 'desktop:ai-chat:1', descriptor_cid: cid, receipt_cid: cid, event_cid: cid,
    ucan_did_verified: true, remote_did: 'did:key:peer', identity_proof_cid: cid,
    policy_outcome: 'require_confirmation', policy_decision_id: 'policy-1',
    policy_dry_run: true, confirmation_required: true, persistence_verified: true,
    recovery: { observed: true, correlation_id_preserved: true },
  };
  assert.equal(releaseEvidence.validApplicationTransportObservation(observation, 'libp2p'), true);
  for (const missing of ['policy_dry_run', 'confirmation_required']) {
    const invalid = structuredClone(observation);
    delete invalid[missing];
    assert.equal(releaseEvidence.validApplicationTransportObservation(invalid, 'libp2p'), false);
  }
  const safeRead = { ...observation, policy_outcome: 'allow', policy_dry_run: false, confirmation_required: false };
  assert.equal(releaseEvidence.validApplicationTransportObservation(safeRead, 'libp2p'), true);
});
