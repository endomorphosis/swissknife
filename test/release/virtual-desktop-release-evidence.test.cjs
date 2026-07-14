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
