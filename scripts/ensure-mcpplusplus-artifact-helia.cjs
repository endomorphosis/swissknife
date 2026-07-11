#!/usr/bin/env node

const { cidForBytes } = require('./mcpplusplus-profile-a.cjs');
const { closeArtifactStores, createArtifactStore } = require('./mcpplusplus-artifact-store.cjs');

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}).finally(closeArtifactStores);

async function main() {
  const bytes = Buffer.from('swissknife-mcpplusplus-helia-readiness-v1\n', 'utf8');
  const cid = cidForBytes(bytes);
  const store = createArtifactStore({ service: 'swissknife-helia-readiness' });
  const persisted = await store.persistBytes({
    profile: 'A',
    kind: 'helia_readiness_probe',
    cid,
    bytes,
    pin: true,
  });
  const retrieved = await store.getArtifact(cid);
  if (!persisted.persisted || !persisted.verified || persisted.backend !== 'helia') {
    throw new Error('Helia did not persist the MCP++ readiness probe.');
  }
  if (!retrieved.found || !retrieved.verified || retrieved.backend !== 'helia' || !retrieved.bytes.equals(bytes)) {
    throw new Error('Helia did not retrieve the MCP++ readiness probe.');
  }
  console.log(JSON.stringify({
    ready: true,
    backend: 'helia',
    cid,
    bytes: bytes.length,
    helia_repo: persisted.helia_repo,
  }, null, 2));
}
