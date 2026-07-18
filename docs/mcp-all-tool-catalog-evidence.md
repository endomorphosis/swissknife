# MCP All-Tool Catalog Evidence

Generated: 2026-07-18T18:13:59.160Z

Decision: **go**

## Summary

| Measure | Count |
| --- | ---: |
| Services | 3 |
| Available services | 3 |
| Services with full hierarchical facade | 3 |
| Flat MCP tools | 417 |
| Hierarchical MCP tools | 421 |
| Reconciled descriptors | 569 |
| Expected live descriptors | 417 |
| Live reconciled descriptors | 417 |
| Read dispatch receipts | 218 |
| Policy-gated evidence entries | 348 |
| Direct-only descriptors | 26 |
| Host-only descriptors | 108 |
| Advertised libp2p endpoints | 1 |
| Reachable advertised libp2p endpoints | 1 |

## Service Catalogs

| Service | Endpoint | Flat tools | Hierarchical tools | Facade | Missing expected | Unexplained flat | Read receipts | Policy gated |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| ipfs_kit_py | http://127.0.0.1:8014/mcp | 28 | 28 | yes | 0 | 0 | 32 | 24 |
| ipfs_datasets_py | http://127.0.0.1:3002/mcp | 271 | 271 | yes | 0 | 0 | 158 | 118 |
| ipfs_accelerate_py | http://127.0.0.1:3003/mcp | 118 | 122 | yes | 0 | 0 | 0 | 206 |

## MCP++ / libp2p

Decision: **go**

| Service | Eligible descriptors | Advertised transport |
| --- | ---: | --- |
| ipfs_kit_py | 60 | mcp++-idl-only |
| ipfs_datasets_py | 283 | mcp++-idl-only |
| ipfs_accelerate_py | 238 | libp2p |

## Policy

- Missing required MCP servers, missing hierarchical facade meta-tools, unexplained catalog deltas, missing read receipts, and unreachable advertised libp2p endpoints are blockers.
- Read-only descriptors are verified with live MCP dispatch receipts.
- Write, heavy-compute, external-network, credential, destructive, and media-capture descriptors are verified by normalized catalog route plus dry-run, fixture, or confirmation-route evidence.
- Static descriptor-pack and real-local source rows remain reconciled to app/global ownership, but are not counted as required live configured endpoint descriptors.

## Warnings

- 4 ipfs_accelerate_py hierarchical entries were not present in the flat tools/list surface.

## Artifacts

- `test-results/virtual-desktop-ipfs-mcp-orb/all-server-tool-catalog.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/mcp-plus-plus-libp2p-catalog.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/mcp-hierarchical-facade-live-probes.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/mcpplusplus-libp2p-reachability.json`

