import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import bootstrapConfig from "../../config/mcpplusplus-helia-bootstrap-peers.json";

const {
  buildProfileAInterface,
} = require("../../scripts/mcpplusplus-profile-a.cjs");
const {
  executeProfileB,
  verifyProfileBResult,
  verifyProfileBPersistence,
} = require("../../scripts/mcpplusplus-profile-b.cjs");
const {
  closeArtifactStores,
  createArtifactStore,
  getHeliaNetworkStatus,
} = require("../../scripts/mcpplusplus-artifact-store.cjs");

describe("MCP++ Profile A/B artifact storage", () => {
  const originalEnv = {
    root: process.env.MCPPLUSPLUS_ARTIFACT_STORE_DIR,
    helia: process.env.MCPPLUSPLUS_HELIA_REPO,
    heliaLibp2p: process.env.MCPPLUSPLUS_HELIA_LIBP2P,
    heliaPeers: process.env.MCPPLUSPLUS_HELIA_PEERS,
    heliaBootstrapPeers: process.env.MCPPLUSPLUS_HELIA_BOOTSTRAP_PEERS,
    swissknifeHeliaLibp2p: process.env.SWISSKNIFE_HELIA_LIBP2P,
    swissknifeHeliaPeers: process.env.SWISSKNIFE_HELIA_PEERS,
    kit: process.env.MCPPLUSPLUS_IPFS_KIT_ARTIFACT_URL,
  };
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(
      path.join(os.tmpdir(), "swissknife-mcppp-artifacts-"),
    );
    process.env.MCPPLUSPLUS_ARTIFACT_STORE_DIR = root;
    process.env.MCPPLUSPLUS_HELIA_REPO = path.join(root, "helia");
    delete process.env.MCPPLUSPLUS_HELIA_LIBP2P;
    delete process.env.MCPPLUSPLUS_HELIA_PEERS;
    delete process.env.MCPPLUSPLUS_HELIA_BOOTSTRAP_PEERS;
    delete process.env.SWISSKNIFE_HELIA_LIBP2P;
    delete process.env.SWISSKNIFE_HELIA_PEERS;
    // The test deliberately proves the local Helia store without depending on
    // a compatibility service or a Kubo daemon.
    process.env.MCPPLUSPLUS_IPFS_KIT_ARTIFACT_URL =
      "http://127.0.0.1:9/mcp/artifacts";
  });

  afterEach(async () => {
    await closeArtifactStores();
    fs.rmSync(root, { recursive: true, force: true });
    restoreEnv("MCPPLUSPLUS_ARTIFACT_STORE_DIR", originalEnv.root);
    restoreEnv("MCPPLUSPLUS_HELIA_REPO", originalEnv.helia);
    restoreEnv("MCPPLUSPLUS_HELIA_LIBP2P", originalEnv.heliaLibp2p);
    restoreEnv("MCPPLUSPLUS_HELIA_PEERS", originalEnv.heliaPeers);
    restoreEnv(
      "MCPPLUSPLUS_HELIA_BOOTSTRAP_PEERS",
      originalEnv.heliaBootstrapPeers,
    );
    restoreEnv("SWISSKNIFE_HELIA_LIBP2P", originalEnv.swissknifeHeliaLibp2p);
    restoreEnv("SWISSKNIFE_HELIA_PEERS", originalEnv.swissknifeHeliaPeers);
    restoreEnv("MCPPLUSPLUS_IPFS_KIT_ARTIFACT_URL", originalEnv.kit);
  });

  it("persists and verifies the canonical Profile A descriptor in Helia without Kubo", async () => {
    const catalog = buildProfileAInterface("artifact-test", [
      { name: "status", inputSchema: { type: "object" } },
    ]);
    const store = createArtifactStore({ service: "artifact-test" });

    const persistence = await store.persistProfileA(catalog);
    const retrieved = await store.getArtifact(catalog.interface_cid);

    expect(persistence.complete).toBe(true);
    expect(persistence.interface_descriptor).toMatchObject({
      backend: "helia",
      persisted: true,
      verified: true,
      cid: catalog.interface_cid,
    });
    expect(retrieved).toMatchObject({
      found: true,
      verified: true,
      backend: "helia",
      cid: catalog.interface_cid,
    });
    expect(retrieved.bytes.toString("utf8")).toBe(
      Buffer.from(catalog.canonical_bytes_base64, "base64").toString("utf8"),
    );
  });

  it("persists and retrieves every CID-native Profile B artifact", async () => {
    const catalog = buildProfileAInterface("artifact-test", [
      { name: "status", inputSchema: { type: "object" } },
    ]);
    const store = createArtifactStore({ service: "artifact-test" });
    const result = await executeProfileB({
      catalog,
      params: {
        interface_cid: catalog.interface_cid,
        tool: "status",
        arguments: {},
        timestamp: "2026-07-10T00:00:00.000Z",
        correlation_id: "artifact-store-test",
      },
      invoke: async () => ({ ok: true }),
      artifactStore: store,
    });

    expect(verifyProfileBResult(result)).toBe(true);
    expect(verifyProfileBPersistence(result)).toBe(true);
    expect(Object.keys(result.artifact_persistence.artifacts).sort()).toEqual([
      "envelope",
      "event",
      "input",
      "intent",
      "output",
      "receipt",
    ]);
    const retrieved = await store.getArtifact(result.envelope_cid);
    expect(retrieved).toMatchObject({
      found: true,
      verified: true,
      cid: result.envelope_cid,
    });
  });

  it("retrieves a missing artifact CID from a configured Helia libp2p peer", async () => {
    const bytes = Buffer.from(
      "swissknife-mcpplusplus-helia-libp2p-test\n",
      "utf8",
    );
    const cid = require("../../scripts/mcpplusplus-profile-a.cjs").cidForBytes(
      bytes,
    );

    process.env.MCPPLUSPLUS_HELIA_REPO = path.join(root, "producer");
    delete process.env.MCPPLUSPLUS_HELIA_PEERS;
    const producer = createArtifactStore({ service: "producer" });
    await producer.persistBytes({
      profile: "A",
      kind: "libp2p_test",
      cid,
      bytes,
      pin: true,
    });
    const provider = await getHeliaNetworkStatus();
    expect(provider.enabled).toBe(true);
    expect(provider.bootstrap_peers).toEqual(bootstrapConfig.peers);
    expect(provider.node_repo).toContain(path.join("producer", "network"));
    expect(provider.peer_discovery).toEqual(["mdns", "bootstrap"]);
    expect(
      provider.multiaddrs.some(
        (address: string) =>
          address.includes("webrtc-direct") &&
          !address.includes("/p2p-circuit"),
      ),
    ).toBe(false);
    expect(provider.background_services).toEqual(
      expect.arrayContaining([
        "autoNAT",
        "dht",
        "delegatedContentRouting",
        "delegatedPeerRouting",
        "relay",
      ]),
    );
    const peer = provider.multiaddrs.find((address: string) =>
      address.startsWith("/ip4/127.0.0.1/tcp/"),
    );
    expect(peer).toEqual(expect.any(String));

    process.env.MCPPLUSPLUS_HELIA_REPO = path.join(root, "consumer");
    process.env.MCPPLUSPLUS_HELIA_PEERS = peer;
    const consumer = createArtifactStore({ service: "consumer" });
    const retrieved = await consumer.getArtifact(cid);

    expect(retrieved).toMatchObject({
      found: true,
      verified: true,
      backend: "helia",
      cid,
    });
    expect(retrieved.bytes).toEqual(bytes);
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
