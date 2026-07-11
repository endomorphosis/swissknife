#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const KUBO = resolveKuboBinary();

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

async function main() {
  if (!KUBO) {
    throw new Error('Kubo interoperability probe requires KUBO_INTEROP_BINARY or an installed ipfs_kit_py Kubo binary.');
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swissknife-helia-kubo-'));
  const kuboRepo = path.join(root, 'kubo');
  const heliaRepo = path.join(root, 'helia');
  const env = { ...process.env, IPFS_PATH: kuboRepo, IPFS_TELEMETRY: 'off' };
  let daemon;
  let helia;
  try {
    runKubo(['init', '--profile=server'], env);
    runKubo(['config', '--json', 'Addresses.Swarm', '["/ip4/127.0.0.1/tcp/0"]'], env);
    runKubo(['config', '--json', 'Addresses.API', '["/ip4/127.0.0.1/tcp/0"]'], env);
    runKubo(['config', '--json', 'Addresses.Gateway', '[]'], env);
    // Kubo's server profile filters loopback by default. This isolated,
    // disposable probe needs a loopback Helia-to-Kubo connection.
    runKubo(['config', '--json', 'Swarm.AddrFilters', '[]'], env);

    const log = fs.openSync(path.join(root, 'kubo.log'), 'a');
    daemon = spawn(KUBO, ['daemon', '--routing=dhtclient'], {
      env,
      detached: true,
      stdio: ['ignore', log, log],
    });
    daemon.unref();
    fs.closeSync(log);

    const api = await waitForKuboApi(kuboRepo);
    const content = Buffer.from('swissknife-helia-kubo-bitswap-interoperability-v1\n', 'utf8');
    const cid = runKubo(['add', '--cid-version=1', '--pin=true', '--quieter'], env, content).trim();
    const identity = await kuboApi(api, '/id');
    const listenAddresses = await kuboApi(api, '/swarm/addrs/listen');
    const addresses = (listenAddresses.Strings ?? []).filter(address => typeof address === 'string');
    const listenAddress = addresses.find(address => /^\/ip4\/127\.0\.0\.1\/tcp\/\d+$/.test(address));
    const peer = listenAddress && typeof identity.ID === 'string' ? `${listenAddress}/p2p/${identity.ID}` : null;
    if (!peer) throw new Error('Temporary Kubo peer did not publish a loopback TCP multiaddr.');

    const [{ createHelia }, { FsBlockstore }, { FsDatastore }, { unixfs }, { multiaddr }] = await Promise.all([
      import('helia'),
      import('blockstore-fs'),
      import('datastore-fs'),
      import('@helia/unixfs'),
      import('@multiformats/multiaddr'),
    ]);
    helia = createHelia({
      blockstore: new FsBlockstore(path.join(heliaRepo, 'blocks')),
      datastore: new FsDatastore(path.join(heliaRepo, 'datastore')),
    });
    await helia.start();
    await helia.libp2p.dial(multiaddr(peer));
    const chunks = [];
    for await (const chunk of unixfs(helia).cat(cid, { signal: AbortSignal.timeout(30000) })) {
      chunks.push(Buffer.from(chunk));
    }
    const retrieved = Buffer.concat(chunks);
    if (!retrieved.equals(content)) throw new Error('Helia retrieved different bytes from the Kubo peer.');

    console.log(JSON.stringify({
      decision: 'go',
      transport: 'libp2p-bitswap',
      cid,
      kubo_binary: KUBO,
      kubo_version: kuboVersion(),
      kubo_peer: peer,
      helia_peer: helia.libp2p.peerId.toString(),
      bytes: retrieved.length,
      bytes_verified: true,
      temporary_kubo_repo: true,
      kubo_stopped_after_probe: true,
    }, null, 2));
  } finally {
    if (helia) await helia.stop();
    if (daemon) await stopProcess(daemon.pid);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function resolveKuboBinary() {
  const candidates = [
    process.env.KUBO_INTEROP_BINARY,
    process.env.IPFS_KIT_BIN_DIR && path.join(process.env.IPFS_KIT_BIN_DIR, 'ipfs'),
    path.join(os.homedir(), 'ipfs_kit_py', 'ipfs_kit_py', 'bin', 'ipfs'),
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function runKubo(args, env, input) {
  return execFileSync(KUBO, args, { env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function kuboVersion() {
  const output = execFileSync(KUBO, ['version'], { encoding: 'utf8' });
  return output.trim();
}

async function waitForKuboApi(repo) {
  const apiPath = path.join(repo, 'api');
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const multiaddr = fs.readFileSync(apiPath, 'utf8').trim();
      const endpoint = apiEndpoint(multiaddr);
      await kuboApi(endpoint, '/version');
      return endpoint;
    } catch (_error) {
      await delay(100);
    }
  }
  throw new Error('Temporary Kubo API did not become ready within 30 seconds.');
}

function apiEndpoint(address) {
  const match = address.match(/^\/ip4\/([^/]+)\/tcp\/(\d+)$/);
  if (!match) throw new Error(`Unsupported temporary Kubo API multiaddr: ${address}`);
  return `http://${match[1]}:${match[2]}/api/v0`;
}

async function kuboApi(endpoint, pathname) {
  const response = await fetch(`${endpoint}${pathname}`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Temporary Kubo API ${pathname} returned ${response.status}.`);
  return response.json();
}

async function stopProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return;
  try { process.kill(pid, 'SIGTERM'); } catch (_error) { return; }
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await delay(100);
    } catch (_error) {
      return;
    }
  }
  try { process.kill(pid, 'SIGKILL'); } catch (_error) { /* Process already exited. */ }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
