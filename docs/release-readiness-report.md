# Release Readiness Report

Generated: 2026-07-19T23:29:37.153Z
Commit: bf8649a1870aa6647015db5cf2e496ede45c408f
Overall status: ✅ PASSED
Release decision: `NO_GO`
Duration: 760.0s

| Gate | Status | Duration |
| --- | --- | --- |
| Release evidence producer manifest ownership preflight (SVD-131) | ✅ passed | 0.0s |
| Browser/service duplicate regression sentinel (SWR-095) | ✅ passed | 0.1s |
| Service-boundary audit (services:audit) | ✅ passed | 5.6s |
| Repository module-boundary audit (audit:module-boundary) | ✅ passed | 5.8s |
| TypeScript project typecheck (typecheck) | ✅ passed | 8.4s |
| Fast unit test lane (test:fast) | ✅ passed | 36.4s |
| Browser compatibility lane (test:browser-compat) | ✅ passed | 17.0s |
| Web bundle build + host-leakage/budget audit (build:web) | ✅ passed | 13.5s |
| Web bundle host-leakage re-audit (audit:bundle-host-leakage) | ✅ passed | 7.6s |
| MCP/glasses manifest + capability coverage evidence (evidence:mcp-glasses) | ✅ passed | 183.8s |
| All-tools HTTP/browser-libp2p peer interoperability evidence (SVD-100) | ✅ passed | 12.0s |
| All-app executable live tool binding catalog (SVD-104) | ✅ passed | 0.7s |
| All backend tools disposition catalog (SVD-105) | ✅ passed | 0.7s |
| All-app live binding gap ledger (SVD-102) | ✅ passed | 0.6s |
| Current real application behavior proof (SVD-106) | ✅ passed | 54.9s |
| Application-originated browser gateway calls (SVD-126) | ✅ passed | 62.1s |
| Profiles A-H HTTP/browser-libp2p transport matrix (SVD-127) | ✅ passed | 5.2s |
| Hardware-free Meta glasses device simulator replay (SVD-099/SVD-111) | ✅ passed | 301.6s |
| Supervisor dispatch artifact CID/event-DAG persistence (SVD-113) | ✅ passed | 2.2s |
| All-app UI/UX accessibility and recovery evidence (SVD-112) | ✅ passed | 39.7s |
| Submodule/workspace merge reconciliation (SVD-116) | ✅ passed | 1.2s |
| Virtual desktop release evidence aggregation (hierarchical MCP + all-tools) | ✅ passed | 0.4s |
| Independent all-app release closeout replay (SVD-115) | ✅ passed | 0.1s |
| Browser/libp2p release evidence freshness certification | ✅ passed | 0.2s |
| MCP dashboard catalog/launch-gate receipt consistency (evidence:dashboard-consumer) | ⏭️ skipped (sibling hallucinate_app checkout not present (standalone swissknife checkout)) | 0.0s |
| Skipped gate policy (explicit reason + browser-safety enforcement) | ✅ passed | 0.0s |

## Virtual Desktop Release Evidence

Path: `test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json`
Decision: `go`
Representative decision: `null`
All-tools decision: `null`
Blockers: 0
Warnings: 0

### SWR-110 Complete Evidence Gate

Decision: `GO`
Required MCP servers: ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py
Required ORB/IDL modalities: display, camera, microphone, speaker, input
Required simulator capabilities: display, camera, microphone, speaker, input
Required supervisor paths: supervisor.goals.read, supervisor.health.read, supervisor.logs.read, supervisor.prompt-steering.request, supervisor.queue.read, supervisor.receipts.read, supervisor.run-history.search, supervisor.subgoals.read, supervisor.task-control.request, supervisor.taskboard.links.read
Missing/failing evidence paths: none

### Hierarchical MCP

Release gate decision: `null`
Evidence decision: `null`
Services live: unknown / unknown
Expected live services: none
Full facade services: unknown / unknown
Dispatch probes: unknown / unknown
Direct-only descriptors: unknown
Unexplained flat hierarchy gaps: unknown
Stale live-service expectations ignored: 0

### Virtual Desktop App Matrix

Release gate decision: `go`
Apps checked: 45
Blockers: 0
Missing backend contracts: none
Missing workflows: none
Missing screenshots: none
Missing ORB/IDL apps: none
Missing ORB/IDL capabilities: none
Missing glasses projection apps: none
Missing glasses projection capabilities: none
Missing catalog tool IDs: none
Missing MCP++/libp2p tool IDs: none
Tool classes with missing coverage: none
Missing simulator modalities: none
Missing simulator capability modalities: none

## Independent All-App Release Replay

Path: `test-results/virtual-desktop-ipfs-mcp-orb/independent-all-app-release-replay.json`
Status: `present`
Decision: `GO`
Blockers: 0
Unfinished task IDs: none

## Release Reproduction Attestation

Path: `docs/release-reproduction-attestation.json`
Markdown: `docs/release-reproduction-attestation.md`
Decision: `NO_GO`
Blockers: 3
Parent gitlink: `bf8649a1870aa6647015db5cf2e496ede45c408f`
Parent gitlink matches HEAD: yes
Pre-run local status entries: 129
Lockfile SHA-256: `584a3304603b208797b50faee86f00f5a6fe987d2289f382ae4f7b93a62dbc21`
Source fingerprint: `4e9dabf4f56c0f187bf7c7b05e1e946b7b25d42e5b00a1c30c45bf8fad788b66`
Clean checkout reproduction: `failed`
Clean checkout child decision: `unknown`
Clean checkout failure: npm run release:readiness failed in clean checkout

## Phase 21 Handoff (SWR-142)

Decision: `NO_GO`
Board: `implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md` (present; SWR-142 status `completed`)
Checkout: `bf8649a1870aa6647015db5cf2e496ede45c408f` on `automation/swissknife-refactor-integration`; pre-run status entries 129
Parent gitlink: `bf8649a1870aa6647015db5cf2e496ede45c408f`; matches HEAD: yes
Lease owner: `all-tools` PID 2436243; active supervisors: 1; active SWR writer covered by lease: no
Duplicate basenames: 0 service / 0 inventory; unapproved basenames: 0
Duplicate content hashes: 1; unapproved content hashes: 0
Conflict counts: unmerged index 0, unresolved markers 0, ownership conflicts 0, browser-unsafe imports 0
libp2p evidence: `fresh` at `docs/browser-libp2p-evidence.fingerprint.json`; engines chromium:fingerprint-only, firefox:fingerprint-only, webkit:fingerprint-only
Proof evidence: `passed`, 81 assertions, engines chromium:passed/27, firefox:passed/27, webkit:passed/27, theorem `typescript-truth-table`, ZKP `browser-schnorr-wasm`, WASM `59fb1c30446716179bab2e5691bbf344aa2a60d123f7101fc0ee731e96976e0c`
Hermetic release: release `NO_GO`, attestation `NO_GO`, clean checkout `failed`, blockers 3

Phase 21 handoff blockers:
- board:SWR-142 is already marked completed before the handoff checks agree
- source:SwissKnife checkout has 129 pre-run status entries
- lease:active SWR board writer is not the checkout lease owner (lease lane all-tools)
- release:release decision is NO_GO
- release:hermetic attestation decision is NO_GO
