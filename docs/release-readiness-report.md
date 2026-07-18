# Release Readiness Report

Generated: 2026-07-18T18:30:51.007Z
Commit: 6a9d599e7134bc881983da0406f3cb7c3a14e44f
Overall status: ✅ PASSED
Release decision: `GO`
Duration: 88.0s

| Gate | Status | Duration |
| --- | --- | --- |
| Browser/service duplicate regression sentinel (SWR-095) | ✅ passed | 0.1s |
| Service-boundary audit (services:audit) | ✅ passed | 5.2s |
| Repository module-boundary audit (audit:module-boundary) | ✅ passed | 4.9s |
| TypeScript project typecheck (typecheck) | ✅ passed | 7.6s |
| Fast unit test lane (test:fast) | ✅ passed | 33.5s |
| Browser compatibility lane (test:browser-compat) | ✅ passed | 13.8s |
| Web bundle build + host-leakage/budget audit (build:web) | ✅ passed | 11.9s |
| Web bundle host-leakage re-audit (audit:bundle-host-leakage) | ✅ passed | 6.5s |
| MCP/glasses manifest + capability coverage evidence (evidence:mcp-glasses) | ✅ passed | 2.5s |
| Virtual desktop release evidence aggregation (hierarchical MCP + all-tools) | ✅ passed | 1.7s |
| Browser/libp2p release evidence freshness (evidence:freshness:check) | ✅ passed | 0.3s |
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
Required MCP servers: ipfs_accelerate_py, ipfs_datasets_py, ipfs_kit_py
Required ORB/IDL modalities: display.output, camera.photo_capture, camera.video_capture, microphone.input, microphone.transcription, speaker.output, headphone.output
Required simulator capabilities: display.output, camera.photo_capture, camera.video_capture, microphone.input, microphone.transcription, speaker.output, headphone.output
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
