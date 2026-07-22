'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { _test: replay } = require('../../scripts/replay-all-app-release-closeout.cjs');

test('the independent replay requires every A-H transport profile', () => {
  const findings = [];
  replay.validateProfiles({
    decision: 'GO',
    profiles: replay.REQUIRED_PROFILES.map(profile => ({ profile })),
    coverage: { all_profiles_represented: true, application_transport_observation_count: 1 },
  }, 'fixture.json', (...args) => findings.push(args));
  assert.equal(findings.length, 0);

  replay.validateProfiles({
    decision: 'GO', profiles: [{ profile: 'A' }],
    coverage: { all_profiles_represented: false, application_transport_observation_count: 0 },
  }, 'fixture.json', (...args) => findings.push(args));
  assert.equal(findings.at(-1)[1], 'profile_transport_incomplete');
  assert.deepEqual(findings.at(-1)[5].missing_profiles, ['B', 'C', 'D', 'E', 'F', 'G', 'H']);
});

test('the all-tools replay accepts explicit unavailable evidence but rejects unclassified tools', () => {
  const findings = [];
  const catalog = {
    decision: 'GO',
    entries: [{
      entry_id: 'tool:example:unavailable', owner: 'example', tool_id: 'unavailable',
      disposition: { kind: 'server_only', rationale: 'Host-only path needs review.' },
      reachability: { observations: [{ transport: 'http', state: 'unavailable', rationale: 'No receipt yet.' }] },
    }],
  };
  replay.validateDispositionCatalog(catalog, 'fixture.json', (...args) => findings.push(args));
  assert.equal(findings.length, 0);

  replay.validateDispositionCatalog({ decision: 'GO', entries: [{}] }, 'fixture.json', (...args) => findings.push(args));
  assert.equal(findings.at(-1)[1], 'unclassified_tool_disposition');
});

test('the independent replay rejects ungoverned reads and write claims', () => {
  const safeRead = {
    operation_class: 'read_request', execution_mode: 'real_safe_read',
    policy: { outcome: 'allow', consent: 'not_required' },
    confirmation: { required: false, dry_run: false },
  };
  assert.equal(replay.compiledExecutionPolicyPasses({ mutates_remote_state: false }, safeRead), true);

  const wrongReadPolicy = structuredClone(safeRead);
  wrongReadPolicy.policy.outcome = 'require_confirmation';
  assert.equal(replay.compiledExecutionPolicyPasses({ mutates_remote_state: false }, wrongReadPolicy), false);

  const governedWrite = {
    operation_class: 'governed_write_request', execution_mode: 'confirmation_gated_dry_run',
    policy: { outcome: 'require_confirmation', consent: 'granted', dry_run: true },
    confirmation: { required: true, policy: 'explicit', dry_run: true },
  };
  assert.equal(replay.compiledExecutionPolicyPasses({ mutates_remote_state: true }, governedWrite), true);

  const liveWrite = structuredClone(governedWrite);
  liveWrite.confirmation.dry_run = false;
  assert.equal(replay.compiledExecutionPolicyPasses({ mutates_remote_state: true }, liveWrite), false);
});
