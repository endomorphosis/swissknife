#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const evidenceRoot = path.join(
  projectRoot,
  "test-results",
  "virtual-desktop-ipfs-mcp-orb",
);
const REQUIRED_HELIA_SERVICES = [
  "autoNAT",
  "delegatedContentRouting",
  "delegatedPeerRouting",
  "dht",
  "identify",
  "relay",
];
const REQUIRED_HELIA_DISCOVERY = ["bootstrap", "mdns"];
const adapters = [
  {
    service: "ipfs_kit_py",
    endpoint: "http://127.0.0.1:8014/api/mcp/status",
    script: "start-ipfs-kit-mcp-compat.cjs",
    pidFile: "ipfs-kit-compat.pid",
    logFile: "ipfs-kit-compat.log",
    version: "0.8.0",
    env: {
      PYTHON:
        process.env.IPFS_KIT_PYTHON ||
        "/home/barberb/ipfs_kit_py/.venv/bin/python",
    },
  },
  {
    service: "ipfs_datasets_py",
    endpoint: "http://127.0.0.1:3002/api/mcp/status",
    script: "start-ipfs-datasets-mcp-compat.cjs",
    pidFile: "ipfs-datasets-compat.pid",
    logFile: "ipfs-datasets-compat.log",
    version: "0.8.0",
    env: {
      IPFS_DATASETS_PY_ROOT:
        process.env.IPFS_DATASETS_PY_ROOT || "/home/barberb/ipfs_datasets_py",
    },
  },
];

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const results = [];
  for (const adapter of adapters) results.push(await ensureAdapter(adapter));
  console.log(JSON.stringify({ adapters: results }, null, 2));
  if (results.some((result) => !result.ready)) process.exitCode = 1;
}

async function ensureAdapter(adapter) {
  const endpointIsReady = await endpointReady(adapter.endpoint);
  const helia = endpointIsReady ? await heliaReady(adapter) : null;
  if (endpointIsReady && (await profileEReady(adapter)) && helia?.ready) {
    const ownedPid = findOwnedAdapterProcess(adapter);
    if (ownedPid) {
      fs.writeFileSync(path.join(evidenceRoot, adapter.pidFile), `${ownedPid}\n`, "utf8");
    }
    return {
      service: adapter.service,
      ready: true,
      action: "already_running",
      endpoint: adapter.endpoint,
      helia: helia.status,
      pid: ownedPid,
    };
  }

  if (endpointIsReady) {
    const stopped = await stopOwnedStaleAdapter(adapter);
    if (!stopped) {
      return {
        service: adapter.service,
        ready: false,
        action: "stale_listener_not_owned_by_swissknife_adapter",
        endpoint: adapter.endpoint,
      };
    }
  }

  const logPath = path.join(evidenceRoot, adapter.logFile);
  const logFd = fs.openSync(logPath, "a");
  const endpointUrl = new URL(adapter.endpoint);
  const child = spawn(
    process.execPath,
    [
      path.join(projectRoot, "scripts", adapter.script),
      "--host",
      endpointUrl.hostname,
      "--port",
      endpointUrl.port,
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...adapter.env,
        MCPPLUSPLUS_HELIA_LIBP2P: process.env.MCPPLUSPLUS_HELIA_LIBP2P ?? "1",
        MCPPLUSPLUS_HELIA_SERVICE_ID: adapter.service,
      },
      detached: true,
      stdio: ["ignore", logFd, logFd],
    },
  );
  child.unref();
  fs.closeSync(logFd);
  fs.writeFileSync(
    path.join(evidenceRoot, adapter.pidFile),
    `${child.pid}\n`,
    "utf8",
  );

  const ready =
    (await waitForEndpoint(adapter.endpoint, 30000)) &&
    (await profileEReady(adapter));
  const heliaStatus = ready ? await waitForHelia(adapter, 30000) : null;
  return {
    service: adapter.service,
    ready: ready && heliaStatus?.ready === true,
    action: "started",
    endpoint: adapter.endpoint,
    helia: heliaStatus?.status ?? null,
    pid: child.pid,
    log_path: path.relative(projectRoot, logPath),
  };
}

async function heliaReady(adapter) {
  const endpoint = adapter.endpoint.replace(
    /\/api\/mcp\/status$/,
    "/mcp/helia/status",
  );
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(5000),
    });
    const status = await response.json();
    const services = new Set(
      Array.isArray(status?.background_services)
        ? status.background_services
        : [],
    );
    const discovery = new Set(
      Array.isArray(status?.peer_discovery) ? status.peer_discovery : [],
    );
    const hasHostWebRTCDirectListener =
      Array.isArray(status?.multiaddrs) &&
      status.multiaddrs.some(
        (address) =>
          String(address).includes("webrtc-direct") &&
          !String(address).includes("/p2p-circuit"),
      );
    return {
      ready:
        response.ok &&
        status?.enabled === true &&
        Array.isArray(status?.bootstrap_peers) &&
        status.bootstrap_peers.length > 0 &&
        REQUIRED_HELIA_SERVICES.every((service) => services.has(service)) &&
        REQUIRED_HELIA_DISCOVERY.every((method) => discovery.has(method)) &&
        !hasHostWebRTCDirectListener,
      status,
    };
  } catch (_error) {
    return { ready: false, status: null };
  }
}

async function waitForHelia(adapter, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await heliaReady(adapter);
    if (result.ready) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ready: false, status: null };
}

async function profileEReady(adapter) {
  const endpoint = adapter.endpoint.replace(/\/api\/mcp\/status$/, "/mcp");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "profile-e-bootstrap",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          clientInfo: {
            name: "swissknife-profile-e-bootstrap",
            version: "1.0.0",
          },
          capabilities: {
            experimental: {
              "mcp++/mcp-idl": true,
              "mcp++/cid-envelope": true,
              "mcp++/ucan": true,
              "mcp++/p2p-transport": true,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(1500),
    });
    const body = await response.json();
    return (
      response.ok &&
      body?.result?.protocolVersion === "2024-11-05" &&
      body?.result?.serverInfo?.version === adapter.version &&
      body?.result?.capabilities?.experimental?.["mcp++/mcp-idl"] === true &&
      body?.result?.capabilities?.experimental?.["mcp++/cid-envelope"] ===
        true &&
      body?.result?.capabilities?.experimental?.["mcp++/ucan"] === true &&
      body?.result?.capabilities?.experimental?.["mcp++/p2p-transport"] === true
    );
  } catch (_error) {
    return false;
  }
}

async function stopOwnedStaleAdapter(adapter) {
  const pidPath = path.join(evidenceRoot, adapter.pidFile);
  let pid;
  try {
    pid = Number(fs.readFileSync(pidPath, "utf8").trim());
  } catch (_error) {
    pid = null;
  }
  if (!Number.isInteger(pid) || pid <= 1 || !ownedAdapterProcess(pid, adapter)) {
    pid = findOwnedAdapterProcess(adapter);
  }
  if (!Number.isInteger(pid) || pid <= 1 || !ownedAdapterProcess(pid, adapter))
    return false;
  try {
    process.kill(pid, "SIGTERM");
  } catch (_error) {
    return false;
  }
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (!(await endpointReady(adapter.endpoint))) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function findOwnedAdapterProcess(adapter) {
  try {
    for (const entry of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      const pid = Number(entry);
      if (ownedAdapterProcess(pid, adapter)) return pid;
    }
  } catch (_error) {
    return null;
  }
  return null;
}

function ownedAdapterProcess(pid, adapter) {
  try {
    const args = fs
      .readFileSync(`/proc/${pid}/cmdline`, "utf8")
      .replace(/\0/g, " ");
    return args.includes(adapter.script);
  } catch (_error) {
    return false;
  }
}

async function endpointReady(endpoint) {
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch (_error) {
    return false;
  }
}

async function waitForEndpoint(endpoint, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await endpointReady(endpoint)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}
