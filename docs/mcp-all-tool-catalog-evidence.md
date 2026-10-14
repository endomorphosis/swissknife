# MCP All-Tool Catalog Evidence

Generated: 2026-10-14T00:24:26.806Z

Decision: **no_go**

## Summary

| Measure | Count |
| --- | ---: |
| Services | 3 |
| Available services | 3 |
| Services with full hierarchical facade | 3 |
| Flat MCP tools | 449 |
| Hierarchical MCP tools | 453 |
| Reconciled descriptors | 494 |
| Expected live descriptors | 449 |
| Live reconciled descriptors | 449 |
| Read dispatch receipts | 69 |
| Policy-gated evidence entries | 246 |
| Direct-only descriptors | 35 |
| Host-only descriptors | 0 |
| Advertised libp2p endpoints | 0 |
| Reachable advertised libp2p endpoints | 0 |

## Service Catalogs

| Service | Endpoint | Flat tools | Hierarchical tools | Facade | Missing expected | Unexplained flat | Read receipts | Policy gated |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| ipfs_kit_py | http://127.0.0.1:8014/mcp | 120 | 120 | yes | 0 | 0 | 69 | 80 |
| ipfs_datasets_py | http://127.0.0.1:3002/mcp | 315 | 315 | yes | 0 | 0 | 0 | 144 |
| ipfs_accelerate_py | http://127.0.0.1:3003/mcp | 14 | 18 | yes | 0 | 0 | 0 | 22 |

## MCP++ / libp2p

Decision: **go**

| Service | Eligible descriptors | Advertised transport |
| --- | ---: | --- |
| ipfs_kit_py | 153 | mcp++-idl-only |
| ipfs_datasets_py | 327 | mcp++-idl-only |
| ipfs_accelerate_py | 26 | mcp++-idl-only |

## Policy

- Missing required MCP servers, missing hierarchical facade meta-tools, unexplained catalog deltas, missing read receipts, and unreachable advertised libp2p endpoints are blockers.
- Read-only descriptors are verified with live MCP dispatch receipts.
- Write, heavy-compute, external-network, credential, destructive, and media-capture descriptors are verified by normalized catalog route plus dry-run, fixture, or confirmation-route evidence.
- Static descriptor-pack and real-local source rows remain reconciled to app/global ownership, but are not counted as required live configured endpoint descriptors.

## Blockers

- 175 read-only ipfs_datasets_py descriptors lacked a passing live dispatch receipt.

## Warnings

- 4 ipfs_accelerate_py hierarchical entries were not present in the flat tools/list surface.

## Artifacts

- `test-results/virtual-desktop-ipfs-mcp-orb/all-server-tool-catalog.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/mcp-plus-plus-libp2p-catalog.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/mcp-hierarchical-facade-live-probes.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/mcpplusplus-libp2p-reachability.json`

