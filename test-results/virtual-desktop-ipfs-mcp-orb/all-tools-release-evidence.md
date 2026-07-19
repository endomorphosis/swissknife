# Freshness-Aware Virtual Desktop Release Evidence

Task: SVD-114
Generated: 2026-07-19T11:06:20.874Z
Decision: **GO**

## Freshness policy

- Maximum receipt age: 86400000 ms.
- Evidence is rejected when absent, malformed, stale, future-dated, descriptor-only, static-only, fixture-only, or unclassified.

## Blocking findings

| Application | Tool | Owner | Transport | Modality | Task | Finding | Remediation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | None | — |

## Input receipts

| Input | Task | Freshness | Captured |
| --- | --- | --- | --- |
| binding_gap_ledger | SVD-102 | fresh | 2026-07-18T19:09:17.663Z |
| live_bindings | SVD-104 | fresh | 2026-07-18T19:20:34.924Z |
| tool_disposition_catalog | SVD-105 | fresh | 2026-07-18T19:20:35.604Z |
| live_behavior | SVD-106 | fresh | 2026-07-19T11:00:12.606Z |
| gateway_executions | SVD-126 | fresh | 2026-07-19T11:01:18.701Z |
| profile_interoperability | SVD-127 | fresh | 2026-07-19T11:01:22.128Z |
| action_handoff | SVD-110 | fresh | 2026-07-19T11:01:27.460Z |
| meta_simulator | SVD-111 | fresh | 2026-07-19T11:01:32.585Z |
| ui_accessibility | SVD-112 | fresh | 2026-07-18T19:16:35.922Z |
| dispatch_artifact_store | SVD-113 | fresh | 2026-07-19T11:06:18.668Z |
| merge_reconciliation | SVD-116 | fresh | 2026-07-19T11:06:20.785Z |
| app_backend_contract | SWR-113 | fresh | 2026-07-19T10:56:02.004Z |
| peer_interoperability | SVD-100 | fresh | 2026-07-19T07:44:05.470Z |
