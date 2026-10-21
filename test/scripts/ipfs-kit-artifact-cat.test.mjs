import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createKitToolExecutor } = require('../../scripts/ipfs-kit-artifact-cat.cjs');
const { createArtifactStore, closeArtifactStores } = require('../../scripts/mcpplusplus-artifact-store.cjs');
const { cidForBytes } = require('../../scripts/mcpplusplus-profile-a.cjs');
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=',
  'base64',
);
const cid = cidForBytes(image);

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'ipfs-kit-artifact-cat-'));
  const environment = {
    MCPPLUSPLUS_ARTIFACT_STORE_DIR: path.join(root, 'artifacts'),
    MCPPLUSPLUS_HELIA_REPO: path.join(root, 'unavailable-helia'),
    MCPPLUSPLUS_HELIA_LIBP2P: 'false',
  };
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  // A regular file makes Helia unavailable without mocking persistence. The
  // production store must persist and verify its actual disk fallback.
  await writeFile(environment.MCPPLUSPLUS_HELIA_REPO, 'unavailable');
  t.after(async () => {
    await closeArtifactStores();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });
  const store = createArtifactStore({ service: 'ipfs_kit_py', isKitService: true });
  const persisted = await store.persistBytes({
    cid, bytes: image, profile: 'fixture', kind: 'image', pin: true,
  });
  assert.equal(persisted.verified, true);
  assert.equal(persisted.backend, 'disk');
  return { root, store, block: path.join(environment.MCPPLUSPLUS_ARTIFACT_STORE_DIR, 'blocks', cid) };
}

function noWorker() {
  throw new Error('native worker must not run for a verified stored artifact');
}

test('existing ipfs_cat reads real persisted image bytes and verified provenance', async (t) => {
  const { store } = await fixture(t);
  const execute = createKitToolExecutor({ artifactStore: store, callKitWorker: noWorker });
  const result = await execute('ipfs_cat', { cid });
  assert.equal(result.ok, true);
  assert.deepEqual(Buffer.from(result.result.bytes_base64, 'base64'), image);
  assert.equal(result.result.cid, cid);
  assert.equal(result.result.backend, 'disk');
  assert.equal(result.result.verified, true);
  assert.equal(result.result.size, image.length);
});

test('dry_run still performs a real read and fails after that content is removed', async (t) => {
  const { store, block } = await fixture(t);
  const execute = createKitToolExecutor({
    artifactStore: store,
    callKitWorker: async () => ({ ok: false, error: "tool 'ipfs_cat' has no callable implementation" }),
  });
  const result = await execute('ipfs_cat', { cid, dry_run: true });
  assert.equal(result.ok, true);
  assert.deepEqual(Buffer.from(result.result.bytes_base64, 'base64'), image);
  await rm(block);
  const missing = await execute('ipfs_cat', { cid, dry_run: true });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /not found.*no callable implementation/);
  assert.equal(missing.result, undefined);
});

test('ipfs_cat preserves offset and length over verified stored bytes', async (t) => {
  const { store } = await fixture(t);
  const execute = createKitToolExecutor({ artifactStore: store, callKitWorker: noWorker });
  const result = await execute('ipfs_cat', { cid, offset: 3, length: 9 });
  assert.equal(result.ok, true);
  assert.deepEqual(Buffer.from(result.result.bytes_base64, 'base64'), image.subarray(3, 12));
  assert.equal(result.result.full_size, image.length);
  assert.deepEqual(result.result.range, { offset: 3, length: 9 });
});

test('a corrupted disk block is never returned as verified content', async (t) => {
  const { store, block } = await fixture(t);
  await writeFile(block, 'tampered bytes');
  const execute = createKitToolExecutor({
    artifactStore: store,
    callKitWorker: async () => ({ ok: false, error: 'native content unavailable' }),
  });
  const result = await execute('ipfs_cat', { cid });
  assert.equal(result.ok, false);
  assert.equal(result.result, undefined);
  assert.equal(await readFile(block, 'utf8'), 'tampered bytes');
});

for (const [name, artifact] of [
  ['unverified content', { found: true, verified: false, cid, bytes: image }],
  ['different CID', { found: true, verified: true, cid: cidForBytes(Buffer.from('other')), bytes: image }],
  ['bytes with wrong hash', { found: true, verified: true, cid, bytes: Buffer.from('other') }],
  ['missing bytes', { found: true, verified: true, cid }],
]) {
  test(`ipfs_cat fails closed for ${name}`, async () => {
    const execute = createKitToolExecutor({
      artifactStore: { getArtifact: async () => artifact }, callKitWorker: noWorker,
    });
    const result = await execute('ipfs_cat', { cid, dry_run: true });
    assert.equal(result.ok, false);
    assert.match(result.error, /failed content verification/);
    assert.equal(result.result, undefined);
  });
}

test('missing artifacts retain genuine native backend fallback and its parameters', async () => {
  const args = { cid, dry_run: true, correlation_id: 'native-fallback' };
  const native = { ok: true, result: { bytes_base64: image.toString('base64'), backend: 'native-ipfs' } };
  const execute = createKitToolExecutor({
    artifactStore: { getArtifact: async () => ({ found: false, verified: false }) },
    callKitWorker: async (name, params) => {
      assert.equal(name, 'ipfs_cat');
      assert.equal(params, args);
      return native;
    },
  });
  assert.equal(await execute('ipfs_cat', args), native);
});

test('a structured native failure cannot become a successful read', async () => {
  const execute = createKitToolExecutor({
    artifactStore: { getArtifact: async () => ({ found: false }) },
    callKitWorker: async () => ({ ok: true, result: { success: false, error: 'CID unavailable' } }),
  });
  const result = await execute('ipfs_cat', { cid });
  assert.equal(result.ok, false);
  assert.match(result.error, /CID unavailable/);
});

test('storage and genuine backend exceptions remain an honest failure', async () => {
  const execute = createKitToolExecutor({
    artifactStore: { getArtifact: async () => { throw new Error('store offline'); } },
    callKitWorker: async () => { throw new Error('native offline'); },
  });
  const result = await execute('ipfs_cat', { cid });
  assert.equal(result.ok, false);
  assert.match(result.error, /store offline; native offline/);
});

test('invalid CID and ranges are rejected before invoking any backend', async () => {
  const execute = createKitToolExecutor({
    artifactStore: { getArtifact: noWorker }, callKitWorker: noWorker,
  });
  for (const args of [
    { cid: 'bafyimageviewerg038sourcecidretrieval' },
    { cid, offset: -1 }, { cid, length: '2' }, { cid, length: 0.5 },
  ]) assert.equal((await execute('ipfs_cat', args)).ok, false);
});

test('other existing tools retain the genuine Python worker dispatch', async () => {
  const result = { ok: true, result: { status: 'up' } };
  const args = { scope: 'test' };
  const execute = createKitToolExecutor({
    artifactStore: { getArtifact: noWorker },
    callKitWorker: async (name, input) => {
      assert.equal(name, 'system_health');
      assert.equal(input, args);
      return result;
    },
  });
  assert.equal(await execute('system_health', args), result);
});
