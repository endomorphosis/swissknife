const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  cidForBytes,
  cidForValue,
  stableStringify,
  isContentCid,
} = require("./mcpplusplus-profile-a.cjs");
const bootstrapConfig = require("../config/mcpplusplus-helia-bootstrap-peers.json");

const DEFAULT_CACHE_ROOT = path.join(
  os.homedir(),
  ".cache",
  "swissknife",
  "mcpplusplus-artifacts",
);
const DEFAULT_HELIA_REPO = path.join(
  os.homedir(),
  ".cache",
  "swissknife",
  "mcpplusplus-helia",
);
const DEFAULT_IPFS_KIT_ENDPOINT = "http://127.0.0.1:8014/mcp/artifacts";
const DEFAULT_MCPPLUSPLUS_BOOTSTRAP_PEERS = [...bootstrapConfig.peers];
const heliaRuntimes = new Map();

function cacheRoot() {
  return path.resolve(
    process.env.MCPPLUSPLUS_ARTIFACT_STORE_DIR || DEFAULT_CACHE_ROOT,
  );
}

function cacheBlockPath(cid) {
  if (!isContentCid(cid))
    throw new Error("Artifact CID must be a valid content CID.");
  return path.join(cacheRoot(), "blocks", cid);
}

function cacheMetadataPath(cid) {
  if (!isContentCid(cid))
    throw new Error("Artifact CID must be a valid content CID.");
  return path.join(cacheRoot(), "metadata", `${cid}.json`);
}

function heliaRepo() {
  return path.resolve(process.env.MCPPLUSPLUS_HELIA_REPO || DEFAULT_HELIA_REPO);
}

function heliaNodeRepo() {
  const configured = process.env.MCPPLUSPLUS_HELIA_NODE_REPO;
  if (configured) return path.resolve(configured);
  const service =
    process.env.MCPPLUSPLUS_HELIA_SERVICE_ID || `process-${process.pid}`;
  return path.join(heliaRepo(), "network", service);
}

function heliaNetworkingEnabled() {
  const configured =
    process.env.MCPPLUSPLUS_HELIA_LIBP2P ?? process.env.SWISSKNIFE_HELIA_LIBP2P;
  return configured === undefined || /^(1|true|yes|on)$/i.test(configured);
}

function heliaPeerMultiaddrs() {
  return [
    ...new Set(
      [
        ...(process.env.MCPPLUSPLUS_HELIA_PEERS || "").split(/[\s,]+/),
        ...(process.env.SWISSKNIFE_HELIA_PEERS || "").split(/[\s,]+/),
      ].filter(Boolean),
    ),
  ];
}

function heliaBootstrapMultiaddrs() {
  const configured = [
    ...new Set(
      [
        ...(process.env.MCPPLUSPLUS_HELIA_BOOTSTRAP_PEERS || "").split(
          /[\s,]+/,
        ),
        ...(process.env.SWISSKNIFE_HELIA_BOOTSTRAP_PEERS || "").split(/[\s,]+/),
        ...(process.env.LIBP2P_BOOTSTRAP_PEERS || "").split(/[\s,]+/),
      ].filter(Boolean),
    ),
  ];
  return configured.length > 0
    ? configured
    : [...DEFAULT_MCPPLUSPLUS_BOOTSTRAP_PEERS];
}

function heliaFetchTimeout() {
  const configured = Number.parseInt(
    process.env.MCPPLUSPLUS_HELIA_FETCH_TIMEOUT_MS ||
      process.env.SWISSKNIFE_HELIA_FETCH_TIMEOUT_MS ||
      "",
    10,
  );
  return Number.isInteger(configured) && configured > 0 ? configured : 30000;
}

function heliaPositiveInteger(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function heliaResourceLimits() {
  return {
    max_connections: heliaPositiveInteger("MCPPLUSPLUS_HELIA_MAX_CONNECTIONS", 32),
    max_parallel_dials: heliaPositiveInteger("MCPPLUSPLUS_HELIA_MAX_PARALLEL_DIALS", 4),
    dial_timeout_ms: heliaPositiveInteger("MCPPLUSPLUS_HELIA_DIAL_TIMEOUT_MS", 10_000),
  };
}

function publicHeliaRepo() {
  const repo = heliaRepo();
  const home = os.homedir();
  return repo.startsWith(`${home}${path.sep}`)
    ? path.join("~", path.relative(home, repo))
    : repo;
}

function artifactUri(cid) {
  return `ipfs://${cid}`;
}

function publicCachePath(cid) {
  return path.join(
    "~",
    ".cache",
    "swissknife",
    "mcpplusplus-artifacts",
    "blocks",
    cid,
  );
}

function writeAtomically(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, filePath);
}

function decodeBase64(value) {
  if (typeof value !== "string" || !value)
    throw new Error("Artifact bytes_base64 is required.");
  return Buffer.from(value, "base64");
}

function recordError(backend, error) {
  return {
    backend,
    error: error instanceof Error ? error.message : String(error),
  };
}

async function collectHeliaBytes(chunks) {
  if (chunks instanceof Uint8Array) return Buffer.from(chunks);
  const buffers = [];
  for await (const chunk of chunks) buffers.push(Buffer.from(chunk));
  return Buffer.concat(buffers);
}

async function getHeliaRuntime() {
  const repo = heliaRepo();
  const nodeRepo = heliaNodeRepo();
  let runtime = heliaRuntimes.get(repo);
  if (!runtime) {
    runtime = (async () => {
      fs.mkdirSync(repo, { recursive: true });
      fs.mkdirSync(nodeRepo, { recursive: true });
      const networked = heliaNetworkingEnabled();
      const [
        { createHeliaLight },
        { withBitswap },
        { withHTTP },
        { bootstrap },
        { libp2pDefaults, withLibp2p },
        { FsBlockstore },
        { FsDatastore },
        { CID },
      ] = await Promise.all([
        import("helia"),
        import("@helia/bitswap"),
        import("@helia/http"),
        import("@libp2p/bootstrap"),
        import("@helia/libp2p"),
        import("blockstore-fs"),
        import("datastore-fs"),
        import("multiformats/cid"),
      ]);
      const blockstore = new FsBlockstore(repo);
      const datastore = new FsDatastore(nodeRepo);
      const heliaOptions = {
        blockstore,
        datastore,
        // Several compatibility adapters share this store but never run GC.
        holdGcLock: false,
      };
      const helia = !networked
        ? createHeliaLight(heliaOptions)
        : createNetworkedHelia({
            createHeliaLight,
            withBitswap,
            withHTTP,
            bootstrap,
            libp2pDefaults,
            withLibp2p,
            options: heliaOptions,
            bootstrapPeers: heliaBootstrapMultiaddrs(),
          });
      const runtime = {
        background_services: [],
        bootstrap_peers: networked ? heliaBootstrapMultiaddrs() : [],
        CID,
        blockstore,
        connected_peers: [],
        helia,
        networked,
        node_repo: nodeRepo,
        peer_discovery: networked ? ["mdns", "bootstrap"] : [],
        repo,
        resource_limits: networked ? heliaResourceLimits() : null,
        started: false,
      };
      if (networked) {
        await helia.start();
        runtime.started = true;
        runtime.background_services = Object.keys(helia.libp2p.services || {});
        await connectHeliaPeers(runtime);
      }
      return runtime;
    })();
    heliaRuntimes.set(repo, runtime);
    runtime.catch(() => heliaRuntimes.delete(repo));
  }
  return runtime;
}

function createNetworkedHelia({
  createHeliaLight,
  withBitswap,
  withHTTP,
  bootstrap,
  libp2pDefaults,
  withLibp2p,
  options,
  bootstrapPeers,
}) {
  const libp2p = libp2pDefaults();
  const resourceLimits = heliaResourceLimits();
  // Keep default bootstrap, DHT, and mDNS discovery enabled, but bound the
  // long-lived host adapters so a descriptor-heavy MCP++ workload cannot
  // turn peer discovery into unbounded memory or dial pressure.
  libp2p.connectionManager = {
    ...libp2p.connectionManager,
    maxConnections: resourceLimits.max_connections,
    maxParallelDials: resourceLimits.max_parallel_dials,
    dialTimeout: resourceLimits.dial_timeout_ms,
  };
  // The browser owns WebRTC-direct. Avoid a native ICE UDP listener for every
  // long-lived host adapter while keeping TCP, WebSocket, and relay listeners.
  libp2p.addresses = {
    ...libp2p.addresses,
    listen: (libp2p.addresses?.listen || []).filter(
      (address) => !address.includes("webrtc-direct"),
    ),
  };
  const localDiscovery = libp2p.peerDiscovery[0];
  libp2p.peerDiscovery =
    localDiscovery === undefined
      ? [bootstrap({ list: bootstrapPeers })]
      : [localDiscovery, bootstrap({ list: bootstrapPeers })];
  return withBitswap(withLibp2p(withHTTP(createHeliaLight(options)), libp2p));
}

async function connectHeliaPeers(runtime) {
  const peers = heliaPeerMultiaddrs();
  if (peers.length === 0) return;
  const { multiaddr } = await import("@multiformats/multiaddr");
  for (const peer of peers) {
    try {
      await runtime.helia.libp2p.dial(multiaddr(peer));
      runtime.connected_peers.push(peer);
    } catch (error) {
      runtime.connected_peers.push({
        peer,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!runtime.connected_peers.some((peer) => typeof peer === "string")) {
    throw new Error(
      `Helia could not connect to a configured libp2p peer: ${runtime.connected_peers.map((peer) => (typeof peer === "string" ? peer : `${peer.peer}: ${peer.error}`)).join("; ")}`,
    );
  }
}

async function putHeliaBlock({ cid, bytes, pin = true }) {
  const runtime = await getHeliaRuntime();
  const parsedCid = runtime.CID.parse(cid);
  await runtime.helia.blockstore.put(parsedCid, bytes);
  if (!(await runtime.helia.blockstore.has(parsedCid))) {
    throw new Error(`Helia did not retain ${cid}.`);
  }
  const readBack = await collectHeliaBytes(
    await runtime.helia.blockstore.get(parsedCid),
  );
  if (!readBack.equals(bytes) || cidForBytes(readBack) !== cid) {
    throw new Error(`Helia did not verify ${cid}.`);
  }
  let announced = false;
  let announceError = null;
  if (
    runtime.networked &&
    /^(1|true|yes|on)$/i.test(process.env.MCPPLUSPLUS_HELIA_ANNOUNCE || "")
  ) {
    try {
      await runtime.helia.routing.provide(parsedCid);
      announced = true;
    } catch (error) {
      announceError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    persisted: true,
    verified: true,
    backend: "helia",
    cid,
    bytes: bytes.length,
    uri: artifactUri(cid),
    helia_repo: publicHeliaRepo(),
    libp2p: runtime.networked,
    libp2p_peers: runtime.connected_peers,
    announced,
    announce_error: announceError,
    pinned: Boolean(pin),
    retention: "persistent-blockstore",
  };
}

async function getHeliaBlock(cid) {
  const runtime = await getHeliaRuntime();
  const parsedCid = runtime.CID.parse(cid);
  if (!(await runtime.helia.blockstore.has(parsedCid)) && !runtime.networked)
    return null;
  const bytes = await collectHeliaBytes(
    await runtime.helia.blockstore.get(parsedCid),
  );
  if (cidForBytes(bytes) !== cid)
    throw new Error("Helia returned bytes for a different CID.");
  return bytes;
}

async function getHeliaNetworkStatus() {
  const runtime = await getHeliaRuntime();
  return {
    enabled: runtime.networked,
    background_services: runtime.background_services,
    bootstrap_peers: runtime.bootstrap_peers,
    node_repo: runtime.node_repo,
    peer_id: runtime.networked ? runtime.helia.libp2p.peerId.toString() : null,
    peer_discovery: runtime.peer_discovery,
    resource_limits: runtime.resource_limits,
    multiaddrs: runtime.networked
      ? runtime.helia.libp2p
          .getMultiaddrs()
          .map((address) => address.toString())
      : [],
    connected_peers: runtime.connected_peers,
  };
}

async function getKitArtifact(kitEndpoint, cid) {
  const response = await fetch(`${kitEndpoint}/${encodeURIComponent(cid)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(
      Number(process.env.MCPPLUSPLUS_IPFS_TIMEOUT_MS || 5000),
    ),
  });
  const body = await response.json();
  if (
    !response.ok ||
    body?.found !== true ||
    body?.verified !== true ||
    body?.cid !== cid
  ) {
    throw new Error(
      body?.error ||
        `ipfs_kit_py artifact endpoint returned ${response.status}`,
    );
  }
  const bytes = decodeBase64(body.bytes_base64);
  if (cidForBytes(bytes) !== cid)
    throw new Error("ipfs_kit_py returned bytes for a different CID.");
  return { ...body, bytes };
}

function putDiskBlock({ cid, bytes, pin = true, profile, kind, service }) {
  const blockPath = cacheBlockPath(cid);
  const metadataPath = cacheMetadataPath(cid);
  writeAtomically(blockPath, bytes);
  const readBack = fs.readFileSync(blockPath);
  if (!readBack.equals(bytes) || cidForBytes(readBack) !== cid) {
    throw new Error(`Disk cache did not verify ${cid}.`);
  }
  writeAtomically(
    metadataPath,
    Buffer.from(
      `${JSON.stringify(
        {
          schema: "swissknife.mcpplusplus.artifact-metadata.v1",
          cid,
          profile,
          kind,
          service,
          bytes: bytes.length,
          pinned: Boolean(pin),
          stored_at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    ),
  );
  return {
    persisted: true,
    verified: true,
    backend: "disk",
    cid,
    bytes: bytes.length,
    uri: artifactUri(cid),
    cache_path: publicCachePath(cid),
    pinned: Boolean(pin),
  };
}

function createArtifactStore({ service, isKitService = false } = {}) {
  const kitEndpoint = String(
    process.env.MCPPLUSPLUS_IPFS_KIT_ARTIFACT_URL || DEFAULT_IPFS_KIT_ENDPOINT,
  ).replace(/\/$/, "");

  async function persistBytes({ profile, kind, cid, bytes, pin = true }) {
    const raw = Buffer.from(bytes);
    const computedCid = cidForBytes(raw);
    if (!isContentCid(cid) || computedCid !== cid) {
      throw new Error(
        `Artifact ${kind} CID does not match its canonical bytes.`,
      );
    }
    const attempts = [];

    try {
      return {
        ...(await putHeliaBlock({ cid, bytes: raw, pin })),
        profile,
        kind,
        service,
        attempts,
      };
    } catch (error) {
      attempts.push(recordError("helia", error));
    }

    if (!isKitService) {
      try {
        const response = await fetch(`${kitEndpoint}/put`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            cid,
            bytes_base64: raw.toString("base64"),
            profile,
            kind,
            service,
            pin,
          }),
          signal: AbortSignal.timeout(
            Number(process.env.MCPPLUSPLUS_IPFS_TIMEOUT_MS || 5000),
          ),
        });
        const body = await response.json();
        if (
          !response.ok ||
          body?.persisted !== true ||
          body?.verified !== true ||
          body?.cid !== cid
        ) {
          throw new Error(
            body?.error ||
              `ipfs_kit_py artifact endpoint returned ${response.status}`,
          );
        }
        return {
          ...body,
          profile,
          kind,
          service,
          via: "ipfs_kit_py",
          attempts,
        };
      } catch (error) {
        attempts.push(recordError("ipfs_kit_py", error));
      }
    }

    return {
      ...putDiskBlock({ cid, bytes: raw, pin, profile, kind, service }),
      profile,
      kind,
      service,
      attempts,
    };
  }

  async function persistValue({ profile, kind, value, cid, pin = true }) {
    const bytes = Buffer.from(stableStringify(value), "utf8");
    return persistBytes({
      profile,
      kind,
      bytes,
      cid: cid || cidForBytes(bytes),
      pin,
    });
  }

  async function persistProfileA(catalog) {
    const interfaceArtifact = await persistValue({
      profile: "A",
      kind: "interface_descriptor",
      value: catalog.canonical_descriptor,
      cid: catalog.interface_cid,
      pin: true,
    });
    return {
      profile: "A",
      complete:
        interfaceArtifact.persisted === true &&
        interfaceArtifact.verified === true,
      interface_descriptor: interfaceArtifact,
    };
  }

  async function persistProfileB({
    input,
    inputCid,
    intent,
    intentCid,
    envelope,
    envelopeCid,
    output,
    outputCid,
    receiptArtifact,
    receiptCid,
    event,
    eventCid,
  }) {
    const rows = await Promise.all([
      persistValue({
        profile: "B",
        kind: "input",
        value: input,
        cid: inputCid,
        pin: true,
      }),
      persistValue({
        profile: "B",
        kind: "intent",
        value: intent,
        cid: intentCid,
        pin: true,
      }),
      persistValue({
        profile: "B",
        kind: "envelope",
        value: envelope,
        cid: envelopeCid,
        pin: true,
      }),
      persistValue({
        profile: "B",
        kind: "output",
        value: output,
        cid: outputCid,
        pin: true,
      }),
      persistValue({
        profile: "B",
        kind: "receipt",
        value: receiptArtifact,
        cid: receiptCid,
        pin: true,
      }),
      persistValue({
        profile: "B",
        kind: "event",
        value: event,
        cid: eventCid,
        pin: true,
      }),
    ]);
    const artifacts = Object.fromEntries(rows.map((row) => [row.kind, row]));
    return {
      profile: "B",
      complete: rows.every(
        (row) => row.persisted === true && row.verified === true,
      ),
      artifacts,
    };
  }

  async function getArtifact(cid) {
    if (!isContentCid(cid))
      throw new Error("Artifact CID must be a valid content CID.");
    try {
      const bytes = await getHeliaBlock(cid);
      if (bytes)
        return {
          found: true,
          verified: true,
          backend: "helia",
          cid,
          bytes,
          metadata: null,
        };
    } catch (error) {
      // Continue through the explicitly configured service and disk fallbacks.
    }
    if (!isKitService) {
      try {
        const result = await getKitArtifact(kitEndpoint, cid);
        return {
          found: true,
          verified: true,
          backend: result.backend ?? "ipfs_kit_py",
          cid,
          bytes: result.bytes,
          metadata: result.metadata ?? null,
          via: "ipfs_kit_py",
        };
      } catch (error) {
        // The disk cache remains available when the MCP compatibility endpoint is unavailable.
      }
    }
    const blockPath = cacheBlockPath(cid);
    if (fs.existsSync(blockPath)) {
      const bytes = fs.readFileSync(blockPath);
      if (cidForBytes(bytes) === cid) {
        return {
          found: true,
          verified: true,
          backend: "disk",
          cid,
          bytes,
          metadata: readMetadata(cid),
        };
      }
    }
    return {
      found: false,
      verified: false,
      cid,
      error:
        "Artifact was not found in Helia, the configured MCP endpoint, or disk cache.",
    };
  }

  function readMetadata(cid) {
    try {
      return JSON.parse(fs.readFileSync(cacheMetadataPath(cid), "utf8"));
    } catch (_error) {
      return null;
    }
  }

  return {
    persistBytes,
    persistValue,
    persistProfileA,
    persistProfileB,
    getArtifact,
  };
}

async function closeArtifactStores() {
  const runtimes = [...heliaRuntimes.values()];
  heliaRuntimes.clear();
  await Promise.all(
    runtimes.map(async (runtimePromise) => {
      try {
        const runtime = await runtimePromise;
        if (runtime.started) await runtime.helia.stop();
      } catch (_error) {
        // A partially initialized runtime has no resources that need closing.
      }
    }),
  );
}

function isPersistenceComplete(value) {
  return value?.complete === true;
}

module.exports = {
  DEFAULT_CACHE_ROOT,
  DEFAULT_HELIA_REPO,
  closeArtifactStores,
  createArtifactStore,
  decodeBase64,
  getHeliaNetworkStatus,
  isPersistenceComplete,
};
