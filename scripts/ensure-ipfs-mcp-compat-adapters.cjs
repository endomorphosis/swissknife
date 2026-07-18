#!/usr/bin/env node

const fs = require("node:fs");
const net = require("node:net");
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
const ADAPTER_FALLBACK_PORT_LIMIT = 32;
const adapterEndpointConfig = {
  ipfs_kit_py: {
    environmentName: "IPFS_KIT_MCP_ENDPOINT",
    defaultEndpoint: "http://127.0.0.1:8014/api/mcp/status",
    fallbackPortStart: 31014,
    leasePath: path.join(evidenceRoot, "ipfs-kit-compat-endpoint.json"),
  },
  ipfs_datasets_py: {
    environmentName: "IPFS_DATASETS_MCP_ENDPOINT",
    defaultEndpoint: "http://127.0.0.1:3002/api/mcp/status",
    fallbackPortStart: 31002,
    leasePath: path.join(evidenceRoot, "ipfs-datasets-compat-endpoint.json"),
  },
  ipfs_accelerate_py: {
    environmentName: "IPFS_ACCELERATE_MCP_ENDPOINT",
    defaultEndpoint: "http://127.0.0.1:3003/api/mcp/status",
    fallbackPortStart: 31003,
    leasePath: path.join(evidenceRoot, "ipfs-accelerate-compat-endpoint.json"),
  },
};
const adapters = [
  {
    service: "ipfs_kit_py",
    endpoint: configuredAdapterEndpoint("ipfs_kit_py"),
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
    endpoint: configuredAdapterEndpoint("ipfs_datasets_py"),
    script: "start-ipfs-datasets-mcp-compat.cjs",
    pidFile: "ipfs-datasets-compat.pid",
    logFile: "ipfs-datasets-compat.log",
    version: "0.8.0",
    env: {
      IPFS_DATASETS_PY_ROOT:
        process.env.IPFS_DATASETS_PY_ROOT || "/home/barberb/ipfs_datasets_py",
    },
  },
  {
    service: "ipfs_accelerate_py",
    endpoint: configuredAdapterEndpoint("ipfs_accelerate_py"),
    script: "start-ipfs-accelerate-mcp-compat.cjs",
    pidFile: "ipfs-accelerate-compat.pid",
    logFile: "ipfs-accelerate-compat.log",
    version: "1.0.0",
    env: {},
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
      if (!process.env[adapterEndpointConfig[adapter.service]?.environmentName]) {
        const fallback = await availableFallbackAdapter(adapter);
        if (fallback) return ensureAdapter(fallback);
      }
      return {
        service: adapter.service,
        ready: false,
        action: "stale_listener_not_owned_by_swissknife_adapter",
        endpoint: adapter.endpoint,
      };
    }
  }

  // A listener can be occupied but unhealthy, so endpointReady() returns
  // false. Do not race it by spawning on its port; lease a private fallback.
  const endpointUrl = new URL(adapter.endpoint);
  if (!(await canListen(endpointUrl.hostname, Number(endpointUrl.port)))) {
    if (!process.env[adapterEndpointConfig[adapter.service]?.environmentName]) {
      const fallback = await availableFallbackAdapter(adapter);
      if (fallback) return ensureAdapter(fallback);
    }
    return {
      service: adapter.service,
      ready: false,
      action: "listener_not_owned_by_swissknife_adapter",
      endpoint: adapter.endpoint,
    };
  }

  const logPath = path.join(evidenceRoot, adapter.logFile);
  const logFd = fs.openSync(logPath, "a");
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
  const result = {
    service: adapter.service,
    ready: ready && heliaStatus?.ready === true,
    action: "started",
    endpoint: adapter.endpoint,
    helia: heliaStatus?.status ?? null,
    pid: child.pid,
    log_path: path.relative(projectRoot, logPath),
  };
  if (result.ready) writeAdapterEndpointLease(adapter.service, adapter.endpoint);
  return result;
}

/**
 * An unowned default-port listener must never be killed or treated as this
 * worktree's evidence adapter. Lease an available loopback port instead and
 * make consumers use only that recorded, verified endpoint.
 */
function configuredAdapterEndpoint(service) {
  const config = adapterEndpointConfig[service];
  if (!config) throw new Error(`No endpoint configuration for ${service}`);
  const configured = process.env[config.environmentName];
  if (configured) return datasetsStatusEndpoint(configured);
  try {
    const lease = JSON.parse(fs.readFileSync(config.leasePath, "utf8"));
    if (lease?.schema === "swissknife.mcp-compat-endpoint.v1" && lease.service === service && typeof lease.endpoint === "string") {
      return datasetsStatusEndpoint(lease.endpoint);
    }
  } catch (_error) {
    // No verified local lease exists; use the conventional interoperability endpoint.
  }
  return config.defaultEndpoint;
}

async function availableFallbackAdapter(adapter) {
  const config = adapterEndpointConfig[adapter.service];
  if (!config) return null;
  for (let offset = 0; offset < ADAPTER_FALLBACK_PORT_LIMIT; offset += 1) {
    const port = config.fallbackPortStart + offset;
    if (!(await canListen("127.0.0.1", port))) continue;
    return { ...adapter, endpoint: `http://127.0.0.1:${port}/api/mcp/status` };
  }
  return null;
}

function canListen(host, port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen({ host, port, exclusive: true }, () => server.close(error => resolve(!error)));
  });
}

function datasetsStatusEndpoint(endpoint) {
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}/api/mcp/status`;
}

function writeAdapterEndpointLease(service, endpoint) {
  const config = adapterEndpointConfig[service];
  if (!config) return;
  const url = new URL(endpoint);
  const record = {
    schema: "swissknife.mcp-compat-endpoint.v1",
    service,
    endpoint: `${url.protocol}//${url.host}`,
    status_endpoint: endpoint,
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(config.leasePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
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
              "mcp++/event-dag": true,
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
      body?.result?.capabilities?.experimental?.["mcp++/event-dag"] === true &&
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
