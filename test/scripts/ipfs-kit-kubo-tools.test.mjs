import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createKuboKitToolExecutor } = require('../../scripts/ipfs-kit-kubo-tools.cjs');

function owner(replies) {
  const calls = [];
  const execute = createKuboKitToolExecutor({ endpoint: 'http://127.0.0.1:5021', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const reply = replies.shift();
    assert.notEqual(reply, undefined, 'unexpected owner operation');
    return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply), { status: reply?.error ? 500 : 200 });
  } });
  return { execute, calls };
}

test('exact read operations preserve real owner entries and file bytes', async () => {
  const { execute, calls } = owner([{ Entries: [{ Name: 'README.md', Type: 0, Size: 3 }] }, 'abc']);
  assert.equal((await execute('files_ls', { path: '/workspace' })).result.Entries[0].Name, 'README.md');
  const read = await execute('files_read', { path: '/workspace/README.md' });
  assert.equal(read.result.content, 'abc');
  assert.equal(Buffer.from(read.result.bytes_base64, 'base64').toString(), 'abc');
  assert.equal(calls[0].url.pathname, '/api/v0/files/ls');
  assert.equal(calls[1].url.searchParams.get('arg'), '/workspace/README.md');
});

test('a mutation preview verifies its real parent and never writes bytes', async () => {
  const { execute, calls } = owner([{ Type: 'directory', Hash: 'actual-parent' }]);
  const result = await execute('files_write', { path: '/workspace/new.txt', content: 'hello', dry_run: true });
  assert.equal(result.result.validated, true);
  assert.equal(result.result.written, false);
  assert.equal(result.result.planned_bytes, 5);
  assert.deepEqual(calls.map(call => call.url.pathname), ['/api/v0/files/stat']);
});

test('a committed write sends exact content and obtains the resulting owner CID', async () => {
  const { execute, calls } = owner(['', { Hash: 'actual-result', Size: 5 }]);
  const result = await execute('files_write', { path: '/workspace/new.txt', content: 'hello' });
  assert.equal(result.result.cid, 'actual-result');
  assert.equal(await calls[0].options.body.get('file').text(), 'hello');
  assert.equal(calls[1].url.pathname, '/api/v0/files/stat');
});

test('invalid paths, missing content, owner failure and unknown tools cannot claim success', async () => {
  const { execute, calls } = owner([{ error: 'offline' }]);
  assert.equal((await execute('files_write', { path: '/workspace/../escape', content: 'x', dry_run: true })).ok, false);
  assert.equal((await execute('files_write', { path: '/workspace/x', dry_run: true })).ok, false);
  assert.equal(calls.length, 0);
  assert.equal((await execute('files_ls', { path: '/' })).ok, false);
  assert.equal(await execute('not_a_kit_tool'), null);
});

test('IPFS listings preserve actual links and add previews never persist content', async () => {
  const { execute, calls } = owner([{ Objects: [{ Links: [{ Name: 'README.md' }] }] }, { ID: 'real-owner' }]);
  const listing = await execute('ipfs_ls', { path: '/ipfs/bafyfixture' });
  assert.equal(listing.result.Objects[0].Links[0].Name, 'README.md');
  const preview = await execute('ipfs_add', { content: 'preview', dry_run: true });
  assert.equal(preview.result.stored, false);
  assert.match(preview.result.planned_cid, /^b[a-z2-7]+$/);
  assert.deepEqual(calls.map(call => call.url.pathname), ['/api/v0/ls', '/api/v0/id']);
  assert.equal((await execute('ipfs_add', { content: '', dry_run: true })).ok, false);
  assert.equal((await execute('ipfs_ls', { path: 'not-an-ipfs-path' })).ok, false);
});
