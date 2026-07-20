# Release Readiness Report

Generated: 2026-07-20T07:52:17.539Z
Commit: 9252e108bf10b80593adc3e36b441b75affe51b3
Overall status: ✅ PASSED
Release decision: `GO`
Duration: 1009.0s

| Gate | Status | Duration |
| --- | --- | --- |
| Release evidence producer manifest ownership preflight (SVD-131) | ✅ passed | 0.0s |
| Browser/service duplicate regression sentinel (SWR-095) | ✅ passed | 0.1s |
| Service-boundary audit (services:audit) | ✅ passed | 18.3s |
| Repository module-boundary audit (audit:module-boundary) | ✅ passed | 17.7s |
| TypeScript project typecheck (typecheck) | ✅ passed | 10.2s |
| Fast unit test lane (test:fast) | ✅ passed | 109.2s |
| Browser compatibility lane (test:browser-compat) | ✅ passed | 22.0s |
| Web bundle build + host-leakage/budget audit (build:web) | ✅ passed | 17.0s |
| Web bundle host-leakage re-audit (audit:bundle-host-leakage) | ✅ passed | 8.8s |
| MCP/glasses manifest + capability coverage evidence (evidence:mcp-glasses) | ✅ passed | 222.8s |
| All-tools HTTP/browser-libp2p peer interoperability evidence (SVD-100) | ✅ passed | 48.5s |
| All-app executable live tool binding catalog (SVD-104) | ✅ passed | 0.8s |
| All backend tools disposition catalog (SVD-105) | ✅ passed | 0.9s |
| All-app live binding gap ledger (SVD-102) | ✅ passed | 0.9s |
| Current real application behavior proof (SVD-106) | ✅ passed | 56.4s |
| Application-originated browser gateway calls (SVD-126) | ✅ passed | 108.6s |
| Profiles A-H HTTP/browser-libp2p transport matrix (SVD-127) | ✅ passed | 5.0s |
| Hardware-free Meta glasses device simulator replay (SVD-099/SVD-111) | ✅ passed | 310.3s |
| Supervisor dispatch artifact CID/event-DAG persistence (SVD-113) | ✅ passed | 2.2s |
| All-app UI/UX accessibility and recovery evidence (SVD-112) | ✅ passed | 42.2s |
| Submodule/workspace merge reconciliation (SVD-116) | ✅ passed | 1.5s |
| Validated refactor-lane main reconciliation receipt (SWR-162) | ✅ passed | 4.3s |
| Virtual desktop release evidence aggregation (hierarchical MCP + all-tools) | ✅ passed | 0.5s |
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
Decision: `GO`
Blockers: 0
Parent gitlink: `9252e108bf10b80593adc3e36b441b75affe51b3`
Parent gitlink matches HEAD: yes
Pre-run local status entries: 0
Lockfile SHA-256: `584a3304603b208797b50faee86f00f5a6fe987d2289f382ae4f7b93a62dbc21`
Source fingerprint: `f26330d7c95584d62cdef61728b76d2f95ae540efb80da578d3ff938aae98239`
Clean checkout reproduction: `passed`
Clean checkout child decision: `GO`
Clean checkout failure: none

## Phase 21 Handoff (SWR-142)

Decision: `NO_GO`
Board: `implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md` (present; SWR-142 status `completed`)
Checkout: `9252e108bf10b80593adc3e36b441b75affe51b3` on `automation/swissknife-refactor-integration`; pre-run status entries 0
Parent gitlink: `9252e108bf10b80593adc3e36b441b75affe51b3`; matches HEAD: yes
Lease owner: `none`; active supervisors: 0; active SWR writer covered by lease: no
Duplicate basenames: 0 service / 0 inventory; unapproved basenames: 0
Duplicate content hashes: 1; unapproved content hashes: 0
Conflict counts: unmerged index 0, unresolved markers 0, ownership conflicts 0, browser-unsafe imports 0
libp2p evidence: `fresh` at `docs/browser-libp2p-evidence.fingerprint.json`; engines chromium:fingerprint-only, firefox:fingerprint-only, webkit:fingerprint-only
Proof evidence: `passed`, 81 assertions, engines chromium:passed/27, firefox:passed/27, webkit:passed/27, theorem `typescript-truth-table`, ZKP `browser-schnorr-wasm`, WASM `59fb1c30446716179bab2e5691bbf344aa2a60d123f7101fc0ee731e96976e0c`
Hermetic release: release `GO`, attestation `GO`, clean checkout `passed`, blockers 0

Phase 21 handoff blockers:
- board:SWR-142 is already marked completed before the handoff checks agree
- lease:lease status is unavailable
