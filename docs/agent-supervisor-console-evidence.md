# Agent Supervisor Console Evidence

Task: SWR-107, carried forward by SWR-111 closeout

Generated: 2026-07-10T11:38:54.495Z

Decision: `go`

## Validation

- `node scripts/capture-mcp-live-probe-evidence.cjs`
- `npm run test:e2e:mcp`
- `npm run evidence:mcp-glasses`

Closeout source artifacts:

- `test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-e2e.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-receipts.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/hierarchical-tools-evidence.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/mcpplusplus-libp2p-reachability.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/orb-idl-complete-coverage.json`

## Service Families

| Service | Role | Available | Endpoint | Flat tools | Hierarchical tools | Agent Supervisor descriptors |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `ipfs_accelerate_py` | state authority and governed actions | yes | `http://127.0.0.1:3003/mcp` | 122 | 122 | 28 |
| `ipfs_kit_py` | receipt authority | yes | `http://127.0.0.1:8014/mcp` | 208 | 204 | 4 |
| `ipfs_datasets_py` | searchable task/goal/run indexes | yes | `http://127.0.0.1:3002/mcp` | 340 | 150 | 1 |

The console reads live supervisor state through `ipfs_accelerate_py`, stores or
resolves receipts through `ipfs_kit_py`, and searches indexed goal/task/run
records through `ipfs_datasets_py`. Browser code does not read local supervisor
state files, import Python, spawn processes, or invoke the implementation
supervisor directly.

## Required Paths

| Path | Source owner | Result | Correlation | Receipt | Observed |
| --- | --- | --- | --- | --- | --- |
| success | `ipfs_accelerate_py` | available | `swr-107-success-state` | `rcpt-swr-107-success-state` | yes |
| receipt_resolve | `ipfs_kit_py` | available | `swr-107-receipt-resolve` | `rcpt-swr-107-receipt-resolve` | yes |
| index_search | `ipfs_datasets_py` | available | `swr-107-index-search` | `rcpt-swr-107-index-search` | yes |
| server_unavailable | `ipfs_accelerate_py` | unavailable:server_unavailable | `swr-107-server-unavailable` | `rcpt-swr-107-server-unavailable` | yes |
| denied | `ipfs_accelerate_py` | denied:policy_denied | `swr-107-denied-steering` | `rcpt-swr-107-denied-steering` | yes |
| stale_state | `ipfs_datasets_py` | unavailable:index_stale | `swr-107-stale-index` | `rcpt-swr-107-stale-index` | yes |
| transport_fallback | `ipfs_accelerate_py` | available | `swr-107-transport-fallback` | `rcpt-swr-107-transport-fallback` | yes |

Receipt count: 7

## Receipt Chain

The receipt chain is anchored in `ipfs_kit_py` and correlated by the console
for every visible state:

1. `success` reads live supervisor/taskboard state from `ipfs_accelerate_py`
   and records `rcpt-swr-107-success-state`.
2. `receipt_resolve` resolves an evidence receipt through `ipfs_kit_py` and
   records `rcpt-swr-107-receipt-resolve`.
3. `index_search` finds the task/goal/run tuple through `ipfs_datasets_py` and
   records `rcpt-swr-107-index-search`.
4. `server_unavailable` renders typed unavailable state and records
   `rcpt-swr-107-server-unavailable`.
5. `denied` renders governed steering denial and records
   `rcpt-swr-107-denied-steering`.
6. `stale_state` renders stale-index state and records
   `rcpt-swr-107-stale-index`.
7. `transport_fallback` renders MCP-to-fallback health state and records
   `rcpt-swr-107-transport-fallback`.

The indexed search path records `SWR-107`, `SWR-107-verify-console`, and
`run-swr-107-live-probe` as the corresponding goal/task/run tuple owned by
`ipfs_datasets_py`.

## Gateway Capabilities

| Capability | Owner | Policy | Access | Transports |
| --- | --- | --- | --- | --- |
| `supervisor.health.read` | `ipfs_accelerate_py` | read | read | MCP, MCP++, libp2p |
| `supervisor.queue.read` | `ipfs_accelerate_py` | read | read | MCP, MCP++, libp2p |
| `supervisor.goals.read` | `ipfs_accelerate_py` | read | read | MCP, MCP++, libp2p |
| `supervisor.subgoals.read` | `ipfs_accelerate_py` | read | read | MCP, MCP++, libp2p |
| `supervisor.taskboard.links.read` | `ipfs_datasets_py` | read | read | MCP, MCP++, libp2p |
| `supervisor.logs.read` | `ipfs_accelerate_py` | read | read | MCP, MCP++, libp2p |
| `supervisor.receipts.read` | `ipfs_kit_py` | read | read | MCP, MCP++, libp2p |
| `supervisor.run-history.search` | `ipfs_datasets_py` | read | read | MCP, MCP++, libp2p |
| `supervisor.prompt-steering.request` | `ipfs_accelerate_py` | confirm | governed-write | MCP, MCP++ |
| `supervisor.task-control.request` | `ipfs_accelerate_py` | privileged-control | governed-write | MCP, MCP++ |

Read capabilities are eligible for live evidence. Governed write capabilities
are not executed destructively during closeout; they require explicit review,
confirmation, correlation ID, immutable receipt, dependency and budget policy,
and redacted logs where prompt content is sensitive.

## MCP++/libp2p Status

`mcpplusplus-libp2p-reachability.json` reports:

| Field | Value |
| --- | --- |
| Advertised | `true` |
| Reachability | `ok: true` |
| Protocol | `/mcp+p2p/1.0.0` |
| Tool count | 108 |
| Peer ID | `12D3KooWHjvjTKfDyZ7bRrcd9qex2B33rvzneW1rsdoUaDivzMku` |
| Multiaddr | `/ip4/10.0.0.211/tcp/9101/p2p/12D3KooWHjvjTKfDyZ7bRrcd9qex2B33rvzneW1rsdoUaDivzMku` |
| `get_server_status` | present |
| `p2p_taskqueue_status` | present |

Profile negotiation is successful and additive for profiles
`mcp++/profile-a-idl`, `mcp++/profile-b-cid-artifacts`,
`mcp++/profile-c-ucan`, `mcp++/profile-d-temporal-policy`, and
`mcp++/profile-e-mcp-p2p`.

## ORB/IDL Projection

`orb-idl-complete-coverage.json` records the `agent-supervisor` projection as:

| Field | Value |
| --- | --- |
| Default projection | `read-only` |
| Status read-only | `true` |
| Receipts read-only | `true` |
| Steering requires confirmation | `true` |
| Policy path | `same-as-desktop-confirmation` |

The glasses projection can display status and receipts by default. Steering and
task-control requests must return to the same confirmed policy path used by the
desktop console.

## Policy Outcomes

The console evidence covers success, server-unavailable, denied, stale-state,
and transport-fallback paths. All governed prompt steering evidence is
non-destructive. Prompt content is represented only by policy metadata and
redacted receipt statements.

Non-invoked side-effectful tools remain accounted for by the all-tools policy
matrix: 396 descriptors require confirmation, including write, destructive,
credential, external-network, media-capture, and heavy-compute classes. Their
closeout evidence is schema/discovery, owner, policy, fallback, and
confirmation-route coverage rather than live mutation.

## Outputs

- `test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-e2e.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-receipts.json`
- `docs/agent-supervisor-console-evidence.md`

Closeout decision: `GO`.
