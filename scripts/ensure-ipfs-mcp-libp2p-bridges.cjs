#!/usr/bin/env node

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const python = process.env.IPFS_ACCELERATE_PYTHON || '/home/barberb/ipfs_accelerate_py/.venv/bin/python3';
const leaseFileNames = {
  ipfs_kit_py: 'ipfs-kit-compat-endpoint.json',
  ipfs_datasets_py: 'ipfs-datasets-compat-endpoint.json',
  ipfs_accelerate_py: 'ipfs-accelerate-compat-endpoint.json',
};
const bridges = [
  { service: 'ipfs_kit_py', endpoint: leasedMcpEndpoint('ipfs_kit_py', 'http://127.0.0.1:8014/mcp'), port: 9114, announce: 'ipfs-kit-mcp-p2p-announce.json', pid: 'ipfs-kit-mcp-p2p.pid', log: 'ipfs-kit-mcp-p2p.log' },
  { service: 'ipfs_datasets_py', endpoint: leasedMcpEndpoint('ipfs_datasets_py', 'http://127.0.0.1:3002/mcp'), port: 9112, announce: 'ipfs-datasets-mcp-p2p-announce.json', pid: 'ipfs-datasets-mcp-p2p.pid', log: 'ipfs-datasets-mcp-p2p.log' },
  { service: 'ipfs_accelerate_py', endpoint: leasedMcpEndpoint('ipfs_accelerate_py', 'http://127.0.0.1:3003/mcp'), port: 9113, announce: 'ipfs-accelerate-mcp-p2p-announce.json', pid: 'ipfs-accelerate-mcp-p2p.pid', log: 'ipfs-accelerate-mcp-p2p.log' },
];

function leasedMcpEndpoint(service, fallback) {
  try {
    const lease = JSON.parse(fs.readFileSync(path.join(evidenceRoot, leaseFileNames[service]), 'utf8'));
    if (lease.schema === 'swissknife.mcp-compat-endpoint.v1' && lease.service === service && typeof lease.endpoint === 'string') {
      return `${lease.endpoint.replace(/\/$/, '')}/mcp`;
    }
  } catch (_error) {
    // A first run has no lease; the conventional local endpoint is still valid.
  }
  return fallback;
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const results = [];
  for (const bridge of bridges) results.push(await ensureBridge(bridge));
  console.log(JSON.stringify({ bridges: results }, null, 2));
  if (results.some(result => !result.ready)) process.exitCode = 1;
}

async function ensureBridge(bridge) {
  const announcePath = path.join(evidenceRoot, bridge.announce);
  const healthPortReady = await portReady(bridge.port);
  const announceValid = readAnnounce(announcePath, bridge.service, bridge.endpoint);
  // SVD-131: the health-check port and a structurally valid announce file
  // are not sufficient proof the bridge is actually reachable over libp2p.
  // A long-running bridge's internal libp2p swarm can silently rebind (or
  // die) while its unrelated HTTP health endpoint keeps responding, leaving
  // a stale multiaddr/port in the announce file that no longer accepts
  // connections. Every application-originated libp2p call would then fail
  // with a real transport error even though this "already_running" check
  // reported success. Independently verify the announced multiaddr's own
  // TCP port is live before trusting this bridge as fresh evidence.
  const multiaddrReady = announceValid && (await multiaddrPortReady(announcePath));
  if (healthPortReady && announceValid && multiaddrReady) {
    return { service: bridge.service, ready: true, action: 'already_running', announce_file: path.relative(projectRoot, announcePath) };
  }

  const portWasReady = healthPortReady;
  if (portWasReady) {
    const stopped = await stopOwnedStaleBridge(bridge);
    if (!stopped) {
      return {
        service: bridge.service,
        ready: false,
        action: 'stale_listener_not_owned_by_swissknife_bridge',
        announce_file: path.relative(projectRoot, announcePath),
      };
    }
  }

  const logPath = path.join(evidenceRoot, bridge.log);
  const logFd = fs.openSync(logPath, 'a');
  const child = spawn(python, [
    path.join(projectRoot, 'scripts', 'ipfs_mcp_libp2p_bridge.py'),
    '--service', bridge.service,
    '--endpoint', bridge.endpoint,
    '--port', String(bridge.port),
    '--announce-file', announcePath,
  ], {
    cwd: projectRoot,
    env: process.env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);
  fs.writeFileSync(path.join(evidenceRoot, bridge.pid), `${child.pid}\n`, 'utf8');
  const ready = await waitForBridge(bridge.port, announcePath, bridge.service);
  return {
    service: bridge.service,
    ready,
    action: 'started',
    pid: child.pid,
    announce_file: path.relative(projectRoot, announcePath),
    log_path: path.relative(projectRoot, logPath),
  };
}

function readAnnounce(filePath, service, endpoint) {
  try {
    const announce = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return announce.service === service
      && announce.endpoint === endpoint
      && announce.protocol === '/mcp+p2p/1.0.0'
      && announce.profile_e_version === '1.9.0'
      && announce.canonical_initialize === true
      && announce.profile_a_mcp_idl === true
      && announce.profile_b_cid_envelope === true
      && announce.profile_c_ucan === true
      && announce.profile_f_event_dag === true
      && typeof announce.multiaddr === 'string';
  } catch (_error) {
    return false;
  }
}

async function stopOwnedStaleBridge(bridge) {
  const pidPath = path.join(evidenceRoot, bridge.pid);
  let pid = null;
  try { pid = Number(fs.readFileSync(pidPath, 'utf8').trim()); } catch (_error) {}
  if (!Number.isInteger(pid) || pid <= 1 || !ownedBridgeProcess(pid, bridge)) {
    pid = findOwnedBridgeProcess(bridge);
  }
  if (!Number.isInteger(pid) || pid <= 1 || !ownedBridgeProcess(pid, bridge)) return false;
  try { process.kill(pid, 'SIGTERM'); } catch (_error) { return false; }
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (!(await portReady(bridge.port))) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

function findOwnedBridgeProcess(bridge) {
  try {
    for (const entry of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      const pid = Number(entry);
      if (ownedBridgeProcess(pid, bridge)) return pid;
    }
  } catch (_error) {
    return null;
  }
  return null;
}

function ownedBridgeProcess(pid, bridge) {
  try {
    const args = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
    return args.includes('ipfs_mcp_libp2p_bridge.py')
      && args.includes(`--service ${bridge.service}`)
      && args.includes(`--port ${bridge.port}`);
  } catch (_error) {
    return false;
  }
}

async function waitForBridge(port, announcePath, service) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (
      await portReady(port)
      && readAnnounce(announcePath, service, bridges.find(bridge => bridge.service === service)?.endpoint)
      && (await multiaddrPortReady(announcePath))
    ) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

/**
 * Parses the TCP port out of a `/ip4/<host>/tcp/<port>/p2p/<peer-id>`
 * multiaddr. Returns `null` for any other transport shape (e.g. QUIC) this
 * ensure script does not know how to independently freshness-check.
 */
function multiaddrTcpPort(multiaddr) {
  const match = /\/tcp\/(\d+)(?:\/|$)/.exec(typeof multiaddr === 'string' ? multiaddr : '');
  return match ? Number(match[1]) : null;
}

/**
 * Independently proves the announced libp2p multiaddr is actually reachable
 * right now, not merely that the announce file has the right shape. This is
 * the freshness guarantee that a stale-but-structurally-valid announce file
 * left over from an earlier bridge instance cannot be mistaken for a live
 * one just because the unrelated HTTP health port still responds.
 */
async function multiaddrPortReady(announcePath) {
  try {
    const announce = JSON.parse(fs.readFileSync(announcePath, 'utf8'));
    const port = multiaddrTcpPort(announce.multiaddr);
    if (!port) return false;
    return await portReady(port);
  } catch (_error) {
    return false;
  }
}

function portReady(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}
