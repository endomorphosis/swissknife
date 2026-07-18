# Refactor Final Signoff

Generated: 2026-07-18T19:00:47.962Z
Commit: a90d7e5dead21174e513d5e7f13507dc67b97202
Release readiness: FAILED

## SWR-095 Browser/Service Sentinel

Status: passed

The release readiness gate now fails on:

- duplicate service basenames
- sprint-named service files
- top-level duplicate service wrappers
- browser package entrypoints that statically reference host-only Node APIs
- default browser package entrypoints that expose Pyodide APIs
- stale browser/libp2p release evidence through `evidence:freshness:check --fail-on-stale`
- browser ZKP source drift toward simulated/test-only proof backends
- skipped browser-safety gates

## Gate Summary

| Gate | Status | Reason |
| --- | --- | --- |
| browser-service-regression-sentinel | passed |  |
| services-audit | passed |  |
| module-boundary-audit | passed |  |
| typecheck | passed |  |
| test-fast | passed |  |
| test-browser-compat | passed |  |
| build-web | passed |  |
| bundle-host-leakage | passed |  |
| evidence-mcp-glasses | passed |  |
| virtual-desktop-release-evidence | failed |  |

## Blocking Failures

### virtual-desktop-release-evidence

- {
-   "schema": "swissknife.virtual-desktop-release-evidence.v2",
-   "task_id": "SVD-114",
-   "decision": "NO_GO",
-   "blocker_count": 1102,
-   "blocker_task_ids": [
-     "SVD-100",
-     "SVD-102",
-     "SVD-104",
-     "SVD-105",
-     "SVD-106",
-     "SVD-109",
-     "SVD-110",
-     "SVD-111",
-     "SVD-112",
-     "SVD-113",
-     "SVD-116"
-   ],
-   "outputs": [
-     "test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json",
-     "test-results/virtual-desktop-ipfs-mcp-orb/all-tools-release-evidence.md",
-     "docs/refactor-final-signoff.md",
-     "../data/swissknife_virtual_desktop/discovery/all-tools-no-new-unknowns.md",
-     "data/swissknife_virtual_desktop/discovery/all-tools-no-new-unknowns.md"
-   ]
- }
- virtual-desktop-release-evidence-no-go: virtual desktop release evidence decision is no_go (SVD-102: missing_evidence_input | SVD-104: Capture timestamp 2026-07-15T06:00:00.000Z is stale (age 306047763ms). | SVD-105: invalid_evidence_timestamp | SVD-106: missing_evidence_input | SVD-109: missing_evidence_input | SVD-110: Capture timestamp 2026-07-15T00:00:00.000Z is stale (age 327647763ms). | SVD-111: missing_evidence_input | SVD-112: missing_evidence_input | SVD-113: missing_evidence_input | SVD-116: invalid_evidence_timestamp | SVD-100: Capture timestamp 2026-07-15T20:23:49.216Z is stale (age 254218547ms). | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding | SVD-104: declared_no_tool_binding)
- virtual-desktop-app-matrix-gate-no-go: virtual desktop app matrix gate decision is no_go
- swr110-complete-release-gate-no-go: SWR-110 complete release evidence gate is NO_GO (missing_or_failing_evidence_paths=test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-binding-gap-ledger.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-tool-bindings.json,test-results/virtual-desktop-ipfs-mcp-orb/all-tools-disposition-catalog.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-behavior-proof.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-mcpplusplus-profile-interoperability.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-orb-idl-action-handoff.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-meta-device-simulator-proof.json,test-results/virtual-desktop-ipfs-mcp-orb/all-app-ui-ux-accessibility.json,test-results/virtual-desktop-ipfs-mcp-orb/supervisor-dispatch-artifact-store.json,../tmp/swissknife_all_tools_supervisor/state/submodule-merge-diagnostics.json,test-results/virtual-desktop-ipfs-mcp-orb/swissknife-all-tools-peer-evidence.json | representative_blockers=SVD-102: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-104: app=- tool=- owner=- transport=- modality=- — Capture timestamp 2026-07-15T06:00:00.000Z is stale (age 306047763ms). | SVD-105: app=- tool=- owner=- transport=- modality=- — invalid_evidence_timestamp | SVD-106: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-109: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-110: app=- tool=- owner=- transport=- modality=- — Capture timestamp 2026-07-15T00:00:00.000Z is stale (age 327647763ms). | SVD-111: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-112: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-113: app=- tool=- owner=- transport=- modality=- — missing_evidence_input | SVD-116: app=- tool=- owner=- transport=- modality=- — invalid_evidence_timestamp | SVD-100: app=- tool=- owner=- transport=- modality=- — Capture timestamp 2026-07-15T20:23:49.216Z is stale (age 254218547ms). | SVD-104: app=ai-chat tool=ipfs_accelerate_py:configured_compat:execute_with_payload owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | all_tools_blockers=SVD-104: app=ai-chat tool=ipfs_accelerate_py:configured_compat:execute_with_payload owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:real_local:execute_with_payload owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:configured_compat:ProvenanceLogger.log_inference owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:static_descriptor:ProvenanceLogger.log_inference owner=ipfs_accelerate_py transport=eligible modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:configured_compat:run_distributed_inference owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:real_local:run_distributed_inference owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:configured_compat:run_inference owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=ai-chat tool=ipfs_accelerate_py:real_local:run_inference owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=device-manager tool=ipfs_accelerate_py:configured_compat:detect_hardware owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=device-manager tool=ipfs_accelerate_py:real_local:detect_hardware owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding | SVD-104: app=device-manager tool=ipfs_accelerate_py:static_descriptor:detect_hardware owner=ipfs_accelerate_py transport=eligible modality=- — declared_no_tool_binding | SVD-104: app=device-manager tool=ipfs_accelerate_py:configured_compat:get_hardware_info owner=ipfs_accelerate_py transport=required modality=- — declared_no_tool_binding)

