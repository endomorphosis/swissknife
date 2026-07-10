# IPFS Datasets Hierarchical Tool Gap

Generated: 2026-07-10T05:28:10.519Z

## Decision

- Evidence decision: `go`
- Live fleet required for command exit: `false`
- Responding configured services: 0/3
- Unavailable configured services: `ipfs_kit_py`, `ipfs_datasets_py`, `ipfs_accelerate_py`
- Flat non-meta descriptors: 0
- Listed through `tools_list_categories` plus `tools_list_tools`: 0
- Raw flat/direct descriptors not listed hierarchically: 0
- Removed from SwissKnife app-visible ledger: 0
- Explicit direct-only descriptors: 0
- Unexplained flat/direct descriptor gaps: 0
- Hierarchical alias dispatch probes: 0/0
- Direct-only receipt probes: 0/0

## Closure Policy

A live `ipfs_datasets_py` non-meta flat descriptor is considered accounted for when one of these conditions is true:

1. The descriptor name, `category.tool`, or `category_tool` form is returned through `tools_list_categories` and `tools_list_tools`.
2. The descriptor is explicitly classified below as direct-only with a policy class, dispatch surface, and reason.
3. The descriptor is absent from the SwissKnife app-visible ledger generated from the live tool surface.

SWR-081 closes only the unexplained gap. Direct-only descriptors remain callable through `tools/call` and must continue to use the policy, confirmation, receipt, and app binding gates from the all-tools ledger.

The direct-only classifier is explicit and finite: unknown root descriptors or category namespaces remain unexplained and make the evidence `no_go` until they are listed hierarchically, removed from the app-visible ledger, or reviewed into this policy.

## App-Visible Ledger Accounting

- Ledger available: `true`
- Ledger source: `all-tools-app-bindings`
- Ledger schema: `swissknife.all-tools-app-binding-matrix.v1`
- Live non-meta descriptors still present in ledger: 0
- Raw hierarchy gaps accounted as removed from ledger: 0

## Direct-Only Classifier Policy

| Scope | Reason class | Reason |
|---|---|---|
| `policy_*` | `root_governance_control_plane` | Root policy descriptors are intentionally kept as direct tools/call entries so policy bootstrap calls do not depend on category facade enumeration. |
| `interface_*` | `root_governance_control_plane` | Root interface descriptors are intentionally kept as direct tools/call entries so interface registration and discovery bootstrap calls do not depend on category facade enumeration. |
| `compliance_*` | `root_governance_control_plane` | Root compliance descriptors are intentionally kept as direct tools/call entries so compliance-rule bootstrap calls do not depend on category facade enumeration. |
| `admin_tools.*` | `governance_control_plane_namespace` | Administrative control-plane modules are retained as direct tools/call descriptors because they gate server state and operator actions outside the browsable hierarchy. |
| `alert_tools.*` | `external_notification_namespace` | Notification connectors are retained as direct tools/call descriptors because dispatch requires external-service policy gates and receipts. |
| `analysis_tools.*` | `legacy_aggregate_module_namespace` | Aggregate analysis module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility. |
| `audit_tools.*` | `governance_audit_namespace` | Audit-log tools are retained as direct tools/call descriptors so receipts and governance evidence can be emitted even when hierarchy browsing is unavailable. |
| `auth_tools.*` | `credential_control_plane_namespace` | Authentication and authorization tools are retained as direct tools/call descriptors and require credential policy gates outside hierarchy browsing. |
| `background_task_tools.*` | `background_engine_namespace` | Background task engines expose queue and worker controls that remain direct-only for job-control compatibility with existing tools/call clients. |
| `bespoke_tools.*` | `service_runtime_namespace` | Bespoke service-runtime helpers are retained as direct-only descriptors when absent from hierarchy listings because they expose operational status and local vector-store controls. |
| `cache_tools.*` | `legacy_aggregate_module_namespace` | Cache aggregate module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility. |
| `cli.*` | `host_execution_namespace` | CLI tools can execute local or remote host commands and are retained as direct-only descriptors behind host-execution policy gates. |
| `dashboard_tools.*` | `observability_runtime_namespace` | Dashboard runtime and telemetry helpers are retained as direct tools/call descriptors because they report service state rather than browsable dataset actions. |
| `data_processing_tools.*` | `legacy_aggregate_module_namespace` | Data-processing aggregate module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility. |
| `dataset_tools.*` | `dataset_compatibility_namespace` | Dataset module descriptors are retained as direct-only tools/call compatibility entries when the hierarchy facade exposes equivalent dataset leaves or omits legacy aggregate modules. |
| `development_tools.*` | `host_development_namespace` | Development and repository automation tools are retained as direct-only descriptors because they can touch local checkout, CI, or external developer services. |
| `discord_tools.*` | `external_connector_namespace` | Discord connectors are retained as direct-only descriptors and require external-network policy gates and receipts. |
| `email_tools.*` | `external_connector_namespace` | Email connectors are retained as direct-only descriptors and require external-network and credential policy gates. |
| `embedding_tools.*` | `heavy_compute_engine_namespace` | Embedding engines and shard operations are retained as direct-only descriptors because they represent compute-heavy backend jobs rather than hierarchy catalog leaves. |
| `file_converter_tools.*` | `host_file_processing_namespace` | File conversion and archive helpers are retained as direct-only descriptors because they may perform host file, download, or batch-processing work. |
| `file_detection_tools.*` | `host_file_processing_namespace` | File detection helpers are retained as direct-only descriptors for direct tools/call compatibility with host-side file inspection flows. |
| `finance_data_tools.*` | `external_data_ingest_namespace` | Finance data scrapers and theorem helpers are retained as direct-only descriptors because they depend on external data sources and compute-heavy analysis. |
| `functions.*` | `host_execution_namespace` | Function execution descriptors are retained as direct-only tools/call entries because they can execute host-side snippets and require strict policy gates. |
| `geospatial_tools.*` | `legacy_aggregate_module_namespace` | Geospatial aggregate module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility. |
| `graph_tools.*` | `graph_engine_namespace` | Graph and ontology engines are retained as direct-only descriptors because they manage mutable graph state and long-running backend jobs. |
| `index_management_tools.*` | `legacy_aggregate_module_namespace` | Index-management aggregate module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility. |
| `investigation_tools.*` | `investigation_engine_namespace` | Investigation engines are retained as direct-only descriptors because they coordinate multi-step ingestion, geospatial, and reasoning workflows. |
| `ipfs_cluster_tools.*` | `cluster_control_plane_namespace` | IPFS cluster control-plane descriptors are retained as direct-only tools/call entries behind network and cluster policy gates. |
| `ipfs_tools.*` | `ipfs_backend_compatibility_namespace` | IPFS backend module descriptors are retained as direct-only tools/call compatibility entries when the hierarchy facade exposes equivalent IPFS leaves or omits legacy aggregate modules. |
| `legacy_mcp_tools.*` | `legacy_mcp_alias_namespace` | Legacy MCP aliases are retained as direct-only descriptors to preserve older tools/call clients while canonical hierarchy leaves are exposed separately where available. |
| `legal_dataset_tools.*` | `external_data_ingest_namespace` | Legal dataset scrapers and validation helpers are retained as direct-only descriptors because they depend on external data sources, scheduled jobs, or large batch processing. |
| `logic_tools.*` | `logic_engine_namespace` | Logic, prover, and compliance engines are retained as direct-only descriptors because they expose policy-sensitive reasoning backends with their own receipt requirements. |
| `mcplusplus.*` | `protocol_engine_namespace` | MCP++ peer, taskqueue, and workflow engines are retained as direct-only descriptors because they manage protocol runtime state. |
| `media_tools.*` | `media_processing_namespace` | Media conversion and download tools are retained as direct-only descriptors because they may perform host media processing or external downloads. |
| `medical_research_scrapers.*` | `external_data_ingest_namespace` | Medical research scrapers are retained as direct-only descriptors because they depend on external data sources and policy-gated research workflows. |
| `monitoring_tools.*` | `observability_runtime_namespace` | Monitoring engines are retained as direct-only descriptors because they report service runtime state and emit operational receipts. |
| `p2p_tools.*` | `protocol_engine_namespace` | P2P workflow schedulers are retained as direct-only descriptors because they manage networked runtime state outside category browsing. |
| `p2p_workflow_tools.*` | `protocol_engine_namespace` | P2P workflow engines are retained as direct-only descriptors because they manage networked runtime state outside category browsing. |
| `pdf_tools.*` | `host_file_processing_namespace` | PDF analysis and certificate helpers are retained as direct-only descriptors because they process host documents and may run batch GraphRAG or ZKP jobs. |
| `provenance_tools.*` | `provenance_receipt_namespace` | Provenance descriptors are retained as direct-only tools/call entries so lineage receipts can be recorded independently of hierarchy browsing. |
| `rate_limiting_tools.*` | `governance_control_plane_namespace` | Rate-limiting controls are retained as direct-only descriptors because they gate server behavior and require governance policy receipts. |
| `search_tools.*` | `legacy_aggregate_module_namespace` | Search aggregate module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility. |
| `security_tools.*` | `credential_control_plane_namespace` | Security and access-permission tools are retained as direct-only descriptors behind credential and authorization policy gates. |
| `session_tools.*` | `credential_control_plane_namespace` | Session-management tools are retained as direct-only descriptors because they manage authenticated runtime state. |
| `software_engineering_tools.*` | `host_development_namespace` | Software engineering automation tools are retained as direct-only descriptors because they can touch repositories, CI logs, or external developer services. |
| `sparse_embedding_tools.*` | `heavy_compute_engine_namespace` | Sparse embedding aggregate descriptors are retained as direct-only entries for compute-heavy backend compatibility. |
| `storage_tools.*` | `storage_engine_namespace` | Storage engines are retained as direct-only descriptors because they can mutate backend storage state and require receipts. |
| `vector_store_tools.*` | `heavy_compute_engine_namespace` | Vector-store engines are retained as direct-only descriptors because they manage mutable indexes and compute-heavy backend state. |
| `vector_tools.*` | `heavy_compute_engine_namespace` | Vector index and search helpers are retained as direct-only descriptors when not listed by the hierarchy facade because they manage backend vector state. |
| `wallet_tools.*` | `credential_control_plane_namespace` | Wallet and grant tools are retained as direct-only descriptors because they handle private records, grants, and cryptographic authorization receipts. |
| `web_archive_tools.*` | `external_data_ingest_namespace` | Web archive and search connectors are retained as direct-only descriptors because they depend on external data sources and network policy gates. |
| `web_scraping_tools.*` | `external_data_ingest_namespace` | Web scraping aggregate descriptors are retained as direct-only entries behind external-network policy gates. |
| `workflow_tools.*` | `background_engine_namespace` | Workflow engines are retained as direct-only descriptors because they coordinate multi-step backend jobs and require job receipts. |

## Direct-Only Reason Classes

| Reason class | Count | Policy |
|---|---:|---|
| none | 0 | No direct-only descriptors were observed. |

## Direct-Only Policy Counts

| Policy class | Count |
|---|---:|
| none | 0 |

## Direct-Only Descriptor Ledger

| Descriptor | Policy class | Reason class | Dispatch surface | Reason |
|---|---|---|---|---|
| none | none | none | none | No direct-only descriptors were observed. |

## Dispatch Receipt Evidence

| Probe | Outcome | Receipt type | Route |
|---|---|---|---|
| none | none | none | none |

## Unexplained Gap

No unexplained `ipfs_datasets_py` flat/direct descriptor gap remains.

