import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createGovernedKitExecutor } = require('../../scripts/ipfs-kit-governed-tools.cjs');
const { cidForBytes } = require('../../scripts/mcpplusplus-profile-a.cjs');
const bytes = Buffer.from('{"event":"real caller bytes"}');
const input = { cid: cidForBytes(bytes), bytes_base64: bytes.toString('base64'), service: 'ipfs_kit_py' };
function fixture() {
  const mutations = [];
  const execute = createGovernedKitExecutor({
    persistArtifact: async value => { mutations.push(['artifact', value]); return { persisted: true, cid: value.cid }; },
    getArtifact: async cid => ({ found: true, verified: true, cid, bytes_base64: bytes.toString('base64') }),
    eventDag: { frontier: async () => ({ heads: [] }), history: async limit => ({ events: [], limit }),
      record: async event => { mutations.push(['event', event]); return { event_cid: 'actual-owner-result' }; } },
  });
  return { mutations, execute };
}
test('artifact preview verifies the exact caller bytes without storing an artifact', async () => {
  const { execute, mutations } = fixture();
  const preview = await execute('artifacts_put', { ...input, dry_run: true });
  assert.equal(preview.result.expected_cid, input.cid);
  assert.equal(preview.result.persisted, false);
  assert.equal(preview.result.mutation_performed, false);
  assert.deepEqual(mutations, []);
  assert.equal((await execute('artifacts_put', { ...input, cid: cidForBytes(Buffer.from('wrong')), dry_run: true })).ok, false);
});
test('committed artifact operation forwards original bytes and returns actual owner outcome', async () => {
  const { execute, mutations } = fixture();
  assert.equal((await execute('artifacts_put', input)).result.persisted, true);
  assert.equal(mutations[0][1].bytes_base64, input.bytes_base64);
  assert.equal((await execute('artifacts_get', { cid: input.cid })).result.bytes_base64, input.bytes_base64);
});
test('DAG preview reads the owner frontier, and only committed append records an event', async () => {
  const { execute, mutations } = fixture();
  const event = { event_type: 'native-send', parents: [] };
  const preview = await execute('dag_append', { event, dry_run: true });
  assert.equal(preview.result.appended, false);
  assert.equal(mutations.length, 0);
  assert.equal((await execute('dag_append', { event })).result.event_cid, 'actual-owner-result');
  assert.deepEqual(mutations[0], ['event', event]);
  assert.equal((await execute('dag_history', { limit: 10 })).result.limit, 10);
  assert.equal((await execute('dag_append', { event: { event_type: 'bad', parents: ['invalid'] } })).ok, false);
});
