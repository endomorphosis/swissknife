# Agent Supervisor Console Evidence

Task: SWR-107

Generated: 2026-07-20T07:42:31.212Z

Decision: go

## Validation

- `node scripts/capture-mcp-live-probe-evidence.cjs`
- `npm run test:e2e:mcp`
- `npm run evidence:mcp-glasses`

## Service Families

| Service | Role | Available | Endpoint | Flat tools | Agent Supervisor descriptors |
| --- | --- | --- | --- | ---: | ---: |
| ipfs_accelerate_py | state_authority | yes | http://127.0.0.1:3003/mcp | 122 | 28 |
| ipfs_kit_py | receipt_authority | yes | http://127.0.0.1:8014/mcp | 153 | 4 |
| ipfs_datasets_py | search_authority | yes | http://127.0.0.1:3002/mcp | 275 | 1 |

## Required Paths

| Path | Source owner | Result | Correlation | Receipt | Observed |
| --- | --- | --- | --- | --- | --- |
| success | ipfs_accelerate_py | available | swr-107-success-state | rcpt-swr-107-success-state | yes |
| receipt_resolve | ipfs_kit_py | available | swr-107-receipt-resolve | rcpt-swr-107-receipt-resolve | yes |
| index_search | ipfs_datasets_py | available | swr-107-index-search | rcpt-swr-107-index-search | yes |
| server_unavailable | ipfs_accelerate_py | unavailable:server_unavailable | swr-107-server-unavailable | rcpt-swr-107-server-unavailable | yes |
| denied | ipfs_accelerate_py | denied:policy_denied | swr-107-denied-steering | rcpt-swr-107-denied-steering | yes |
| stale_state | ipfs_datasets_py | unavailable:index_stale | swr-107-stale-index | rcpt-swr-107-stale-index | yes |
| transport_fallback | ipfs_accelerate_py | available | swr-107-transport-fallback | rcpt-swr-107-transport-fallback | yes |

## Correlation

Every scenario emits an `ipfs_kit_py` evidence receipt in `test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-receipts.json`. The indexed search path records `SWR-107`, `SWR-107-verify-console`, and `run-swr-107-live-probe` as the corresponding goal/task/run tuple owned by `ipfs_datasets_py`.

The console evidence covers success, server-unavailable, denied, stale-state, and transport-fallback paths. All governed prompt steering evidence is non-destructive and prompt content is represented only by policy metadata and redacted receipt statements.

## Outputs

- `test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-e2e.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-receipts.json`
- `docs/agent-supervisor-console-evidence.md`

Receipt count: 7
