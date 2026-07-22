# Release Readiness Report

Generated: 2026-07-22T00:40:11.480Z
Commit: e7d2d6f0de1e3eea296707d1a7503deae77014a1
Overall status: ✅ PASSED
Release decision: `GO`
Remaining gap task IDs: none
Duration: 1081.6s

| Gate | Status | Duration |
| --- | --- | --- |
| Browser/service duplicate regression sentinel (SWR-095) | ✅ passed | 0.1s |
| Service-boundary audit (services:audit) | ✅ passed | 5.6s |
| Repository module-boundary audit (audit:module-boundary) | ✅ passed | 5.8s |
| TypeScript project typecheck (typecheck) | ✅ passed | 8.8s |
| Fast unit test lane (test:fast) | ✅ passed | 36.6s |
| Browser compatibility lane (test:browser-compat) | ✅ passed | 18.2s |
| Web bundle build + host-leakage/budget audit (build:web) | ✅ passed | 15.1s |
| Web bundle host-leakage re-audit (audit:bundle-host-leakage) | ✅ passed | 8.8s |
| MCP/glasses manifest + capability coverage evidence (evidence:mcp-glasses) | ✅ passed | 216.6s |
| Current peer, executable binding, disposition, and gap catalogues (SVD-100/SVD-102/SVD-104/SVD-105) | ✅ passed | 9.4s |
| Current real application behavior proof (SVD-106) | ✅ passed | 51.0s |
| Application-originated browser gateway calls (SVD-126) | ✅ passed | 53.5s |
| Profiles A-H HTTP/browser-libp2p transport matrix (SVD-127) | ✅ passed | 5.0s |
| Hardware-free Meta glasses device simulator replay (SVD-099/SVD-111) | ✅ passed | 270.1s |
| All-app primary workflow, UI/UX, K/D/A, and live MCP++ evidence (SVD-133/SVD-180/SVD-181) | ✅ passed | 371.5s |
| Supervisor dispatch artifact CID/event-DAG persistence (SVD-113) | ✅ passed | 1.9s |
| Submodule/workspace merge reconciliation (SVD-116) | ✅ passed | 1.9s |
| Virtual desktop release evidence aggregation (hierarchical MCP + all-tools) | ✅ passed | 0.6s |
| Independent all-app release closeout replay (SVD-115) | ✅ passed | 0.1s |
| Browser/libp2p release evidence freshness (evidence:freshness:check) | ✅ passed | 0.4s |
| MCP dashboard catalog/launch-gate receipt consistency (evidence:dashboard-consumer) | ✅ passed | 0.5s |
| Skipped gate policy (explicit reason + browser-safety enforcement) | ✅ passed | 0.0s |

## Virtual Desktop Release Evidence

Path: `test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json`
Decision: `go`
Representative decision: `null`
All-tools decision: `null`
Blockers: 0
Warnings: 0

### SVD-182 All-App Release Trace

Decision: `GO`
Passing apps: 45 / 45
Trace records: 45
Failing apps: none
Remaining gap task IDs: none

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

## Explicit Remaining Gaps

- None.
