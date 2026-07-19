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
