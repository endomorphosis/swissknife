# Release Readiness Report

Generated: 2026-07-18T19:00:47.962Z
Commit: a90d7e5dead21174e513d5e7f13507dc67b97202
Overall status: ❌ FAILED
Release decision: `NO_GO`
Duration: 98.8s

| Gate | Status | Duration |
| --- | --- | --- |
| Browser/service duplicate regression sentinel (SWR-095) | ✅ passed | 0.1s |
| Service-boundary audit (services:audit) | ✅ passed | 6.1s |
| Repository module-boundary audit (audit:module-boundary) | ✅ passed | 5.6s |
| TypeScript project typecheck (typecheck) | ✅ passed | 8.5s |
| Fast unit test lane (test:fast) | ✅ passed | 37.6s |
| Browser compatibility lane (test:browser-compat) | ✅ passed | 17.2s |
| Web bundle build + host-leakage/budget audit (build:web) | ✅ passed | 13.4s |
| Web bundle host-leakage re-audit (audit:bundle-host-leakage) | ✅ passed | 7.2s |
| MCP/glasses manifest + capability coverage evidence (evidence:mcp-glasses) | ✅ passed | 2.8s |
| Virtual desktop release evidence aggregation (hierarchical MCP + all-tools) | ❌ failed | 0.2s |

## Virtual Desktop Release Evidence

Path: `test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json`
Decision: `no_go`
Representative decision: `null`
All-tools decision: `null`
Blockers: 1102
Warnings: 0

### SWR-110 Complete Evidence Gate

Decision: `NO_GO`
Required MCP servers: ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py
Required ORB/IDL modalities: display, camera, microphone, speaker, input
Required simulator capabilities: display, camera, microphone, speaker, input
Required supervisor paths: supervisor.goals.read, supervisor.health.read, supervisor.logs.read, supervisor.prompt-steering.request, supervisor.queue.read, supervisor.receipts.read, supervisor.run-history.search, supervisor.subgoals.read, supervisor.task-control.request, supervisor.taskboard.links.read
Missing/failing evidence paths: test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-binding-gap-ledger.json, test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-tool-bindings.json, test-results/virtual-desktop-ipfs-mcp-orb/all-tools-disposition-catalog.json, test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-behavior-proof.json, test-results/virtual-desktop-ipfs-mcp-orb/all-app-mcpplusplus-profile-interoperability.json, test-results/virtual-desktop-ipfs-mcp-orb/all-app-orb-idl-action-handoff.json, test-results/virtual-desktop-ipfs-mcp-orb/all-app-meta-device-simulator-proof.json, test-results/virtual-desktop-ipfs-mcp-orb/all-app-ui-ux-accessibility.json, test-results/virtual-desktop-ipfs-mcp-orb/supervisor-dispatch-artifact-store.json, ../tmp/swissknife_all_tools_supervisor/state/submodule-merge-diagnostics.json, test-results/virtual-desktop-ipfs-mcp-orb/swissknife-all-tools-peer-evidence.json

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

Release gate decision: `no_go`
Apps checked: 45
Blockers: 1102
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

Release evidence blockers:
- SVD-102: missing_evidence_input
- SVD-104: Capture timestamp 2026-07-15T06:00:00.000Z is stale (age 306047763ms).
- SVD-105: invalid_evidence_timestamp
- SVD-106: missing_evidence_input
- SVD-109: missing_evidence_input
- SVD-110: Capture timestamp 2026-07-15T00:00:00.000Z is stale (age 327647763ms).
- SVD-111: missing_evidence_input
- SVD-112: missing_evidence_input
- SVD-113: missing_evidence_input
- SVD-116: invalid_evidence_timestamp
- SVD-100: Capture timestamp 2026-07-15T20:23:49.216Z is stale (age 254218547ms).
- SVD-104: declared_no_tool_binding
- ... 1090 more

## Failure detail

### Virtual desktop release evidence aggregation (hierarchical MCP + all-tools)

```
{
  "schema": "swissknife.virtual-desktop-release-evidence.v2",
  "task_id": "SVD-114",
  "decision": "NO_GO",
  "blocker_count": 1102,
  "blocker_task_ids": [
    "SVD-100",
    "SVD-102",
    "SVD-104",
    "SVD-105",
    "SVD-106",
    "SVD-109",
    "SVD-110",
    "SVD-111",
    "SVD-112",
    "SVD-113",
    "SVD-116"
  ],
  "outputs": [
    "test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json",
    "test-results/virtual-desktop-ipfs-mcp-orb/all-tools-release-evidence.md",
    "docs/refactor-final-signoff.md",
    "../data/swissknife_virtual_desktop/discovery/all-tools-no-new-unknowns.md",
    "data/swissknife_virtual_desktop/discovery/all-tools-no-new-unknowns.md"
  ]
}
virtual-desktop-release-evidence-no-go: virtual desktop release evidence decision is no_go (SVD-102: missing_evidence_input | SVD-104: Capture timestamp 2026-07-15T06:00:00.000Z is stale (age 306047763ms). | SVD-105: invalid_evidence_timestamp | SVD-106: missing_evidence_input | SVD-109: missing_evidence_input | SVD-110: Capture timestamp 2026-07-15T00:00:00.000Z is stale (age 327647763ms). | SVD-111: missing_evidence_input | SVD-112: missing_evidence_input | SVD-113: missing_evidence_input | SVD-116: invalid_evidence_timestamp | SVD-100: Capture timestamp 2026-07-15T20:23:49.216Z is stale (age 254218547ms). | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding)
virtual-desktop-app-matrix-gate-no-go: virtual desktop app matrix gate decision is no_go
swr110-complete-release-gate-no-go: SWR-110 complete release evidence gate is NO_GO (missing_or_failing_evidence_paths=test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-binding-gap-ledger.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-tool-bindings.json,test-results/virtual-desktop-ipfs-mcp-orb/all-tools-disposition-catalog.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-behavior-proof.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-mcpplusplus-profile-interoperability.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-orb-idl-action-handoff.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-meta-device-simulator-proof.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-ui-ux-accessibility.json,test-results/virtual-desktop-ipfs-mcp-orb/supervisor-dispatch-artifact-store.json,../tmp/swissknife_all_tools_supervisor/state/submodule-merge-diagnostics.json,test-results/virtual-desktop-ipfs-mcp-orb/swissknife-all-tools-peer-evidence.json | representative_blockers=SVD-102: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-104: app=- tool=- owner=- transport=- modality=- — Capture timestamp 2026-07-15T06:00:00.000Z is stale (age 306047763ms). | SVD-105: app=- tool=- owner=- transport=- modality=- — invalid_evidence_timestamp | SVD-106: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-109: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-110: app=- tool=- owner=- transport=- modality=- — Capture timestamp 2026-07-15T00:00:00.000Z is stale (age 327647763ms). | SVD-111: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-112: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-113: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-116: app=- tool=- owner=- transport=- modality=- — invalid_evidence_timestamp | SVD-100: app=- tool=- owner=- transport=- modality=- — Capture timestamp 2026-07-15T20:23:49.216Z is stale (age 254218547ms). | SVD-104: app=ai-chat tool=ipfs_accelerate_py:configured_compat:execute_with_payload owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | all_tools_blockers=SVD-104: app=ai-chat tool=ipfs_accelerate_py:configured_compat:execute_with_payload owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:real_local:execute_with_payload owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:configured_compat:ProvenanceLogger.log_inference owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:static_descriptor:ProvenanceLogger.log_inference owner=ipfs_accelerate_py transport=eligible modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:configured_compat:run_distributed_inference owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:real_local:run_distributed_inference owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:configured_compat:run_inference owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:real_local:run_inference owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=device-manager tool=ipfs_accelerate_py:configured_compat:detect_hardware owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=device-manager tool=ipfs_accelerate_py:real_local:detect_hardware owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=device-manager tool=ipfs_accelerate_py:static_descriptor:detect_hardware owner=ipfs_accelerate_py transport=eligible modality=- — declared_no_tool_binding | SVD-104: app=device-manager tool=ipfs_accelerate_py:configured_compat:get_hardware_info owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding)
```
