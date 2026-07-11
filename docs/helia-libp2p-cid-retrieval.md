# Helia Libp2p CID Retrieval

SwissKnife uses Helia for local CID storage. Kubo is not required for the
desktop, CLI, or MCP++ artifact paths. Helia networking is enabled by default:
SwissKnife starts the complete network profile with Bitswap, delegated HTTP
routing, mDNS, bootstrap discovery, the DHT, AutoNAT, relay, hole punching,
identify, ping, and listeners. Use `--offline` for one CLI invocation or set
`SWISSKNIFE_HELIA_LIBP2P=0` / `MCPPLUSPLUS_HELIA_LIBP2P=0` for an explicitly
air-gapped runtime.

The host profile listens on TCP, WebSockets, and circuit relay. It does not
open the native WebRTC-direct ICE UDP listener because the virtual desktop's
browser libp2p runtime owns WebRTC; avoiding a second host ICE listener keeps
multiple MCP++ adapters stable on the same machine.

The default bootstrap set is shared with
`ipfs_accelerate_py.mcplusplus_module.p2p.connectivity.DEFAULT_BOOTSTRAP_PEERS`
and is stored in
[`config/mcpplusplus-helia-bootstrap-peers.json`](../config/mcpplusplus-helia-bootstrap-peers.json).
It contains the four `bootstrap.libp2p.io` multiaddrs used by the other MCP++
services. A deployment can replace that set with its known-reachable peers by
setting `SWISSKNIFE_HELIA_BOOTSTRAP_PEERS` or
`MCPPLUSPLUS_HELIA_BOOTSTRAP_PEERS`; `LIBP2P_BOOTSTRAP_PEERS` is also honored
for backend parity. `CACHE_BOOTSTRAP_PEERS` is deliberately not consumed here:
it can identify a task-cache or MCP++ service endpoint that does not serve IPFS
content over Bitswap.

## CLI

Retrieve a CID from a known Helia, Kubo, or another Bitswap-capable IPFS peer:

```bash
swissknife ipfs get --cid <cid> --peer <multiaddr> --output <path>
```

Repeat `--peer` for additional candidates. The same configuration can be
provided to the CLI process with:

```bash
export SWISSKNIFE_HELIA_PEERS='/ip4/203.0.113.10/tcp/4001/p2p/<peer-id>'
export SWISSKNIFE_HELIA_BOOTSTRAP_PEERS='/ip4/203.0.113.11/tcp/4001/p2p/<peer-id>'
export SWISSKNIFE_HELIA_FETCH_TIMEOUT_MS=30000
```

Use `--bootstrap-peer <multiaddr>` repeatedly to replace the default bootstrap
set for one CLI invocation. `--peer` is intentionally separate: it is an
immediate direct dial target for Bitswap retrieval.

Use `swissknife ipfs add --announce` when the node should publish the
new CID to its configured content-routing services. Direct peers can retrieve a
pinned CID through Bitswap without that announcement, while DHT routing makes
the CID discoverable beyond the direct peer list.

## Virtual Desktop And MCP++ Artifacts

The compatibility adapters use their Helia blockstore for Profile A and B
artifacts. Enable remote retrieval before starting those adapters:

```bash
export MCPPLUSPLUS_HELIA_PEERS='/ip4/203.0.113.10/tcp/4001/p2p/<peer-id>'
export MCPPLUSPLUS_HELIA_BOOTSTRAP_PEERS='/ip4/203.0.113.11/tcp/4001/p2p/<peer-id>'
export MCPPLUSPLUS_HELIA_FETCH_TIMEOUT_MS=30000
```

Set `MCPPLUSPLUS_HELIA_ANNOUNCE=1` when Profile A/B artifacts should be
announced through content routing. The adapter continues to use the durable
Helia store first, then its configured IPFS-kit artifact endpoint and disk
cache as fallbacks. The compatibility-adapter launcher enables this full
network profile by default and gives each service a separate persistent
libp2p datastore under its Helia repository while the CID blockstore remains
shared. `GET /mcp/helia/status` reports the active bootstrap peers and
background service names and reports `mdns` plus `bootstrap` peer discovery;
adapter readiness requires DHT, both discovery modes, delegated routing,
AutoNAT, identify, and relay services.

An MCP++ Profile E multiaddr is not necessarily a Bitswap endpoint. The
existing Profile E bridge exposes the `/mcp+p2p/1.0.0` protocol for tools and
artifact RPC, while Helia CID transfer requires a peer that also serves IPFS
blocks over Bitswap.

## Verification

Run the local Helia-only persistence suite:

```bash
npx vitest run --config build-tools/configs/vitest.mcpplusplus-artifacts.config.ts
```

Run the explicit Kubo interoperability proof when an external Kubo binary is
available. It creates a disposable Kubo repository on random ports and stops
the peer after Helia has fetched and verified the CID:

```bash
KUBO_INTEROP_BINARY=/path/to/ipfs node scripts/test-helia-kubo-bitswap.cjs
```
