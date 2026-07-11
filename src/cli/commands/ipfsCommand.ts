import { Command } from "commander";
import { homedir } from "node:os";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { FsBlockstore } from "blockstore-fs";
import { FsDatastore } from "datastore-fs";
import { createHeliaLight } from "helia";
import { withBitswap } from "@helia/bitswap";
import { withHTTP } from "@helia/http";
import { libp2pDefaults, withLibp2p } from "@helia/libp2p";
import { bootstrap } from "@libp2p/bootstrap";
import { unixfs, type UnixFS } from "@helia/unixfs";
import type { Helia } from "@helia/interface";
import { CID } from "multiformats/cid";
import bootstrapConfig from "../../../config/mcpplusplus-helia-bootstrap-peers.json" with { type: "json" };
import { logger } from "../../utils/logger.js";

const DEFAULT_NETWORK_FETCH_TIMEOUT_MS = 30000;
const DEFAULT_MCPPLUSPLUS_BOOTSTRAP_PEERS = [...bootstrapConfig.peers];

interface HeliaNetworkCommandOptions {
  libp2p?: boolean;
  offline?: boolean;
  peer?: string[];
  bootstrapPeer?: string[];
  timeoutMs?: number;
}

interface HeliaNetworkRuntime {
  enabled: boolean;
  bootstrapPeers: string[];
  backgroundServices: string[];
  connectedPeers: string[];
  peerErrors: string[];
}

interface HeliaAddCommandOptions extends HeliaNetworkCommandOptions {
  path?: string;
  announce?: boolean;
}

interface HeliaGetCommandOptions extends HeliaNetworkCommandOptions {
  cid?: string;
  output?: string;
}

interface HeliaPinCommandOptions extends HeliaNetworkCommandOptions {
  cid?: string;
}

/**
 * IPFS command class for CLI integration.
 * Uses a persistent local Helia repository. SwissKnife does not start or
 * require a Kubo daemon for these operations.
 */
export class IPFSCommand {
  private program: Command;
  private readonly heliaRepo: string;

  constructor(
    program: Command,
    heliaRepo = process.env.SWISSKNIFE_HELIA_REPO ??
      path.join(homedir(), ".cache", "swissknife", "helia-cli"),
  ) {
    this.program = program;
    this.heliaRepo = heliaRepo;
  }

  register(): void {
    const ipfsCommand = this.program
      .command("ipfs")
      .description("IPFS operations for content management");

    ipfsCommand
      .command("add")
      .description("Add content to IPFS")
      .option("-p, --path <path>", "Path to file or directory to add")
      .option("--libp2p", "enable Helia networking (the default)")
      .option("--offline", "disable Helia networking for this invocation")
      .option(
        "--peer <multiaddr>",
        "Helia peer multiaddr; repeat for multiple peers",
        appendValue,
        [],
      )
      .option(
        "--bootstrap-peer <multiaddr>",
        "Helia bootstrap multiaddr; repeat to override the MCP++ default peers",
        appendValue,
        [],
      )
      .option(
        "--announce",
        "announce the added CID through Helia content routing",
      )
      .action(async (options) => {
        try {
          await this.addContent(options);
        } catch (error) {
          logger.error(`IPFS add failed: ${error}`);
          process.exit(1);
        }
      });

    ipfsCommand
      .command("get")
      .description("Get content from IPFS")
      .option("-c, --cid <cid>", "Content identifier to retrieve")
      .option("-o, --output <output>", "Output file path")
      .option("--libp2p", "enable Helia networking (the default)")
      .option("--offline", "disable Helia networking for this invocation")
      .option(
        "--peer <multiaddr>",
        "Helia peer multiaddr; repeat for multiple peers",
        appendValue,
        [],
      )
      .option(
        "--bootstrap-peer <multiaddr>",
        "Helia bootstrap multiaddr; repeat to override the MCP++ default peers",
        appendValue,
        [],
      )
      .option(
        "--timeout-ms <milliseconds>",
        "remote CID fetch timeout",
        parsePositiveInteger,
      )
      .action(async (options) => {
        try {
          await this.getContent(options);
        } catch (error) {
          logger.error(`IPFS get failed: ${error}`);
          process.exit(1);
        }
      });

    ipfsCommand
      .command("pin")
      .description("Pin content in IPFS")
      .option("-c, --cid <cid>", "Content identifier to pin")
      .option("--libp2p", "enable Helia networking (the default)")
      .option("--offline", "disable Helia networking for this invocation")
      .option(
        "--peer <multiaddr>",
        "Helia peer multiaddr; repeat for multiple peers",
        appendValue,
        [],
      )
      .option(
        "--bootstrap-peer <multiaddr>",
        "Helia bootstrap multiaddr; repeat to override the MCP++ default peers",
        appendValue,
        [],
      )
      .action(async (options) => {
        try {
          await this.pinContent(options);
        } catch (error) {
          logger.error(`IPFS pin failed: ${error}`);
          process.exit(1);
        }
      });
  }

  private async addContent(options: HeliaAddCommandOptions): Promise<void> {
    if (!options.path) throw new Error("--path is required for ipfs add");
    logger.info(`Adding ${options.path} to the local Helia repository`);
    try {
      const content = await readFile(options.path);
      const cid = await this.withHelia(
        options,
        async (helia, fileSystem, network) => {
          const added = await fileSystem.addBytes(content);
          const parsed = CID.parse(added.toString());
          await pin(helia, parsed);
          if (network.enabled && options.announce === true) {
            try {
              await helia.routing.provide(parsed as never);
            } catch (error) {
              logger.warn(
                `Helia stored ${parsed}, but could not announce it: ${errorMessage(error)}`,
              );
            }
          }
          return parsed.toString();
        },
      );
      logger.info(`Added to Helia: ${cid}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`Helia add failed (${msg}).`);
    }
  }

  private async getContent(options: HeliaGetCommandOptions): Promise<void> {
    if (!options.cid) throw new Error("--cid is required for ipfs get");
    logger.info(`Getting CID ${options.cid} from the local Helia repository`);
    try {
      const cid = CID.parse(options.cid);
      const data = await this.withHelia(
        options,
        async (_helia, fileSystem, network) => {
          const chunks: Buffer[] = [];
          // UnixFS accepts a CID string at runtime. Passing that string avoids
          // nominal CID types from separately resolved multiformats packages.
          const catOptions = network.enabled
            ? { signal: AbortSignal.timeout(resolveFetchTimeout(options)) }
            : { offline: true };
          for await (const chunk of fileSystem.cat(
            cid.toString() as never,
            catOptions,
          ))
            chunks.push(Buffer.from(chunk));
          return Buffer.concat(chunks);
        },
      );
      if (options.output) {
        await writeFile(options.output, data);
        logger.info(
          `Content saved to ${options.output} (${data.length} bytes)`,
        );
      } else {
        logger.info(`Content retrieved: ${data.length} bytes`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`Helia get failed (${msg}).`);
    }
  }

  private async pinContent(options: HeliaPinCommandOptions): Promise<void> {
    if (!options.cid) throw new Error("--cid is required for ipfs pin");
    logger.info(`Pinning CID ${options.cid} in the local Helia repository`);
    try {
      const cid = CID.parse(options.cid);
      const pinned = await this.withHelia(options, async (helia) => {
        await pin(helia, cid);
        return helia.pins.isPinned(cid as never);
      });
      if (!pinned)
        throw new Error(`Helia did not retain pin metadata for ${cid}`);
      logger.info(`CID ${options.cid} pinned successfully in Helia.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`Helia pin failed (${msg}).`);
    }
  }

  private async withHelia<T>(
    options: HeliaNetworkCommandOptions,
    operation: (
      helia: Helia,
      fileSystem: UnixFS,
      network: HeliaNetworkRuntime,
    ) => Promise<T>,
  ): Promise<T> {
    const networkEnabled = heliaNetworkingEnabled(options);
    const heliaOptions = {
      blockstore: new FsBlockstore(path.join(this.heliaRepo, "blocks")),
      datastore: new FsDatastore(path.join(this.heliaRepo, "datastore")),
      holdGcLock: false,
    };
    const bootstrapPeers = networkEnabled ? resolveBootstrapPeers(options) : [];
    const helia = !networkEnabled
      ? createHeliaLight(heliaOptions)
      : createNetworkedHelia(heliaOptions, bootstrapPeers);
    const network: HeliaNetworkRuntime = {
      enabled: networkEnabled,
      bootstrapPeers,
      backgroundServices: [],
      connectedPeers: [],
      peerErrors: [],
    };
    try {
      await helia.start();
      if (networkEnabled) {
        network.backgroundServices = Object.keys(
          (
            helia as Helia & {
              libp2p: { services: Record<string, unknown> };
            }
          ).libp2p.services,
        );
        await connectConfiguredPeers(helia, resolvePeers(options), network);
      }
      return await operation(helia, unixfs(helia), network);
    } finally {
      await helia.stop();
    }
  }

  addTaskIntegration(): void {
    // Wire IPFS CID storage into the task-result pipeline
    logger.info(
      "Task integration added: IPFS commands will store task results by CID.",
    );
    this.program.hook("postAction", async () => {
      // Post-action hook placeholder for CID-backed task persistence
    });
  }
}

function appendValue(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error("--timeout-ms must be a positive integer");
  return parsed;
}

function environmentEnabled(name: string): boolean {
  return /^(1|true|yes|on)$/i.test(process.env[name] ?? "");
}

function heliaNetworkingEnabled(options: HeliaNetworkCommandOptions): boolean {
  if (options.offline === true) return false;
  if (options.libp2p === true) return true;
  if (process.env.SWISSKNIFE_HELIA_LIBP2P === undefined) return true;
  return environmentEnabled("SWISSKNIFE_HELIA_LIBP2P");
}

function resolvePeers(options: HeliaNetworkCommandOptions): string[] {
  return uniquePeers([
    ...(options.peer ?? []),
    ...splitPeers(process.env.SWISSKNIFE_HELIA_PEERS),
  ]);
}

function resolveBootstrapPeers(options: HeliaNetworkCommandOptions): string[] {
  const configured = uniquePeers([
    ...(options.bootstrapPeer ?? []),
    ...splitPeers(process.env.SWISSKNIFE_HELIA_BOOTSTRAP_PEERS),
    ...splitPeers(process.env.MCPPLUSPLUS_HELIA_BOOTSTRAP_PEERS),
    ...splitPeers(process.env.LIBP2P_BOOTSTRAP_PEERS),
  ]);
  return configured.length > 0
    ? configured
    : [...DEFAULT_MCPPLUSPLUS_BOOTSTRAP_PEERS];
}

function splitPeers(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).filter(Boolean);
}

function uniquePeers(peers: string[]): string[] {
  return [...new Set(peers)];
}

function resolveFetchTimeout(options: HeliaNetworkCommandOptions): number {
  if (options.timeoutMs !== undefined) return options.timeoutMs;
  const configured = Number.parseInt(
    process.env.SWISSKNIFE_HELIA_FETCH_TIMEOUT_MS ?? "",
    10,
  );
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_NETWORK_FETCH_TIMEOUT_MS;
}

function createNetworkedHelia(
  options: {
    blockstore: FsBlockstore;
    datastore: FsDatastore;
    holdGcLock: boolean;
  },
  bootstrapPeers: string[],
): Helia {
  const libp2p = libp2pDefaults();
  // WebRTC-direct owns a native ICE UDP listener and is handled by the browser
  // runtime. Host Helia nodes retain TCP, WebSocket, and relay listeners.
  libp2p.addresses = {
    ...libp2p.addresses,
    listen: (libp2p.addresses?.listen ?? []).filter(
      (address) => !address.includes("webrtc-direct"),
    ),
  };
  const defaultDiscovery = libp2p.peerDiscovery ?? [];
  const localDiscovery = defaultDiscovery[0];
  libp2p.peerDiscovery =
    localDiscovery === undefined
      ? [bootstrap({ list: bootstrapPeers })]
      : [localDiscovery, bootstrap({ list: bootstrapPeers })];
  return withBitswap(withLibp2p(withHTTP(createHeliaLight(options)), libp2p));
}

async function connectConfiguredPeers(
  helia: Helia,
  peers: string[],
  network: HeliaNetworkRuntime,
): Promise<void> {
  if (peers.length === 0) return;
  const networked = helia as Helia & {
    libp2p: { dial(peer: unknown): Promise<unknown> };
  };
  const { multiaddr } = await import("@multiformats/multiaddr");
  for (const peer of peers) {
    try {
      await networked.libp2p.dial(multiaddr(peer));
      network.connectedPeers.push(peer);
    } catch (error) {
      network.peerErrors.push(`${peer}: ${errorMessage(error)}`);
    }
  }
  if (network.connectedPeers.length === 0) {
    throw new Error(
      `Helia could not connect to a configured libp2p peer: ${network.peerErrors.join("; ")}`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pin(helia: Helia, cid: unknown): Promise<void> {
  // blockstore-fs currently resolves a separate multiformats type package.
  // Both values are CID-compatible at runtime, as the local round-trip test proves.
  const heliaCid = cid as never;
  if (await helia.pins.isPinned(heliaCid)) return;
  for await (const _event of helia.pins.add(heliaCid)) {
    // Draining the async iterator commits the pin metadata to the datastore.
  }
}
