#!/usr/bin/env node

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const python = process.env.IPFS_ACCELERATE_PYTHON || '/home/barberb/ipfs_accelerate_py/.venv/bin/python3';
const bridges = [
  { service: 'ipfs_kit_py', endpoint: 'http://127.0.0.1:8014/mcp', port: 9114, announce: 'ipfs-kit-mcp-p2p-announce.json', pid: 'ipfs-kit-mcp-p2p.pid', log: 'ipfs-kit-mcp-p2p.log' },
  { service: 'ipfs_datasets_py', endpoint: 'http://127.0.0.1:3002/mcp', port: 9112, announce: 'ipfs-datasets-mcp-p2p-announce.json', pid: 'ipfs-datasets-mcp-p2p.pid', log: 'ipfs-datasets-mcp-p2p.log' },
  { service: 'ipfs_accelerate_py', endpoint: 'http://127.0.0.1:3003/mcp', port: 9113, announce: 'ipfs-accelerate-mcp-p2p-announce.json', pid: 'ipfs-accelerate-mcp-p2p.pid', log: 'ipfs-accelerate-mcp-p2p.log' },
];

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
  if (await portReady(bridge.port) && readAnnounce(announcePath, bridge.service)) {
    return { service: bridge.service, ready: true, action: 'already_running', announce_file: path.relative(projectRoot, announcePath) };
  }

  const portWasReady = await portReady(bridge.port);
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

function readAnnounce(filePath, service) {
  try {
    const announce = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return announce.service === service
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
  let pid;
  try { pid = Number(fs.readFileSync(pidPath, 'utf8').trim()); } catch (_error) { pid = findOwnedBridgeProcess(bridge); }
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
    const cwd = fs.realpathSync(`/proc/${pid}/cwd`);
    return cwd === projectRoot
      && args.includes('ipfs_mcp_libp2p_bridge.py')
      && args.includes(`--service ${bridge.service}`)
      && args.includes(`--port ${bridge.port}`);
  } catch (_error) {
    return false;
  }
}

async function waitForBridge(port, announcePath, service) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await portReady(port) && readAnnounce(announcePath, service)) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
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
