# MCP++ Implementation Plan Todo Queue

**Status:** Active pending backlog  
**Created:** 2026-05-21  
**Goal:** A new virtual desktop app can be shipped by publishing an MCP++ compatible interface descriptor plus template mapping, with zero bespoke app shell code.

This queue turns the comprehensive MCP++ UI/UX implementation plan into daemon-consumable work items. It intentionally remains separate from `TEMPLATE_DRIVEN_UI_UX_TODO.md`, which records the completed first implementation pass.

Use it with:

```bash
python3 scripts/mcp-plus-plus/todo_daemon.py --todo-file docs/mcp-plus-plus/IMPLEMENTATION_PLAN_TODO_QUEUE.md status
python3 scripts/mcp-plus-plus/todo_daemon.py --todo-file docs/mcp-plus-plus/IMPLEMENTATION_PLAN_TODO_QUEUE.md next
python3 scripts/mcp-plus-plus/todo_daemon.py --todo-file docs/mcp-plus-plus/IMPLEMENTATION_PLAN_TODO_QUEUE.md backend-sync
```

<!-- codex-todo-queue:start -->
```json
[
  {
    "id": "MCPPLAN-000",
    "title": "Enable ipfs_datasets_py todo backend handoff",
    "phase": "Queue Operations",
    "priority": "P0",
    "status": "done",
    "dependencies": [],
    "target_files": [
      "scripts/mcp-plus-plus/todo_daemon.py",
      "docs/mcp-plus-plus/IMPLEMENTATION_PLAN_TODO_QUEUE.md",
      ".codex/todo-daemon/ipfs_datasets_backend.json"
    ],
    "validation": [
      "python3 scripts/mcp-plus-plus/todo_daemon.py --todo-file docs/mcp-plus-plus/IMPLEMENTATION_PLAN_TODO_QUEUE.md backend-status",
      "python3 scripts/mcp-plus-plus/todo_daemon.py --todo-file docs/mcp-plus-plus/IMPLEMENTATION_PLAN_TODO_QUEUE.md backend-sync",
      "python3 scripts/mcp-plus-plus/todo_daemon.py --todo-file docs/mcp-plus-plus/IMPLEMENTATION_PLAN_TODO_QUEUE.md next"
    ],
    "done_criteria": [
      "backend-status reports available=true, or the adapter emits an actionable unavailable reason while keeping the local mirror updated.",
      "The queue can be queried, claimed, completed, failed, and mirrored with --todo-file docs/mcp-plus-plus/IMPLEMENTATION_PLAN_TODO_QUEUE.md.",
      "The backend mirror contains every queue task with stable backend_task_id values and source dependency metadata."
    ],
    "prompt": "Harden the ipfs_datasets_py todo backend handoff for this queue. Diagnose provider availability, improve unavailable diagnostics if needed, verify mirror sync, and keep the local daemon path usable when the optional provider cannot run.",
    "updated": "2026-05-22T06:01:10Z"
  },
  {
    "id": "MCPPLAN-001",
    "title": "Freeze the SwissKnife MCP++ UI Profile contract",
    "phase": "Phase 1 - Foundation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-000"
    ],
    "target_files": [
      "docs/mcp-plus-plus/CONFORMANCE_MATRIX.md",
      "src/services/mcp-ui-profile.ts",
      "src/services/mcp-idl.ts",
      "test/mcp-plus-plus/mcp-ui-profile.test.ts"
    ],
    "validation": [
      "python3 scripts/mcp-plus-plus/todo_daemon.py --todo-file docs/mcp-plus-plus/IMPLEMENTATION_PLAN_TODO_QUEUE.md status",
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "The descriptor contract explicitly covers meta, services, ui, data_contracts, permissions, and state_model.",
      "The code documents which MCP++ fields are source-of-truth aliases instead of SwissKnife-only inventions.",
      "Profile conformance failures include stable machine-readable codes for publish and tooling gates."
    ],
    "prompt": "Audit and harden the SwissKnife MCP++ UI Profile descriptor contract. Treat mcp_plus_plus IDL naming, compatibility rules, and stream/event semantics as the source of truth, then update tests and conformance documentation.",
    "updated": "2026-05-22T06:04:40Z"
  },
  {
    "id": "MCPPLAN-002",
    "title": "Enforce descriptor publish conformance gates",
    "phase": "Phase 1 - Foundation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-001"
    ],
    "target_files": [
      "src/services/mcp-interface-registry.ts",
      "src/services/mcp-registry.ts",
      "scripts/mcp-plus-plus/descriptor_cli.mjs",
      "test/mcp-plus-plus/mcp-ui-profile.test.ts",
      "test/mcp-plus-plus/integration-pipeline.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-interface-registry.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts src/services/mcp-descriptor-trust.ts",
      "node scripts/mcp-plus-plus/descriptor_cli.mjs lint docs/mcp-plus-plus"
    ],
    "done_criteria": [
      "Descriptor publish fails before registration when conformance checks fail.",
      "CLI lint and registry publish paths use the same validator and error codes.",
      "Tests cover missing contracts, incompatible operations, invalid streams, and successful publish."
    ],
    "prompt": "Wire the MCP++ UI Profile conformance validator into every descriptor publish path, including local registry helpers and descriptor CLI linting.",
    "updated": "2026-05-22T06:07:08Z"
  },
  {
    "id": "MCPPLAN-003",
    "title": "Back descriptor registry discovery with MCP++ interfaces",
    "phase": "Phase 1 - Foundation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-001",
      "MCPPLAN-002"
    ],
    "target_files": [
      "src/services/mcp-interface-registry.ts",
      "src/services/mcp-discovery.ts",
      "src/services/mcp-idl.ts",
      "test/mcp-plus-plus/integration-pipeline.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-interface-registry.ts src/services/mcp-idl.ts src/services/mcp-ui-profile.ts src/services/mcp-descriptor-trust.ts"
    ],
    "done_criteria": [
      "The registry exposes interfaces/list, interfaces/get, and interfaces/compat compatible entry points.",
      "Discovery results include enough descriptor identity, version, template, and service metadata for app launch.",
      "Compatibility results explain exact, compatible, fallback, and rejected matches."
    ],
    "prompt": "Harden the descriptor registry and discovery pipeline around MCP++ interface repository methods instead of static descriptor arrays.",
    "updated": "2026-05-22T06:08:41Z"
  },
  {
    "id": "MCPPLAN-004",
    "title": "Resolve app launch from live interface discovery",
    "phase": "Phase 1 - Foundation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-003"
    ],
    "target_files": [
      "web/js/main.js",
      "web/js/generated-app-launcher.js",
      "src/services/mcp-interface-registry.ts",
      "test/unit/web/descriptor-runtime.test.ts",
      "test/mcp-plus-plus/integration-pipeline.test.ts"
    ],
    "validation": [
      "node --input-type=module --check < web/js/main.js",
      "node --input-type=module --check < web/js/generated-app-launcher.js"
    ],
    "done_criteria": [
      "Generated app launch can resolve descriptors from live discovery instead of static descriptor arrays.",
      "Startup supports preferred version, required methods, and compatibility fallback.",
      "Descriptor runtime and generated MCP app launcher paths do not regress each other."
    ],
    "prompt": "Update virtual desktop app startup so generated apps resolve launch descriptors through live MCP++ interface discovery with version negotiation and compatibility fallback.",
    "updated": "2026-05-22T06:09:24Z"
  },
  {
    "id": "MCPPLAN-005",
    "title": "Promote ORB transport adapters into a pluggable broker",
    "phase": "Phase 1 - Foundation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-003"
    ],
    "target_files": [
      "src/services/mcp-orb-capability-router.ts",
      "src/services/mcp-transport.ts",
      "src/services/mcp-p2p-session.ts",
      "test/mcp-plus-plus/mcp-orb-capability-router.test.ts",
      "test/mcp-plus-plus/transport-and-revocation.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-orb-capability-router.ts src/services/mcp-transport.ts src/services/mcp-p2p-session.ts src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "ORB transport adapters cover local, websocket, HTTP, and MCP server bridge bindings behind one broker API.",
      "Adapters expose consistent bind, invoke, stream, recover, and close semantics.",
      "Adapter capability metadata is discoverable before binding."
    ],
    "prompt": "Evolve the ORB capability router into a pluggable broker with transport adapters for local, websocket, HTTP, and MCP server bridge workflows.",
    "updated": "2026-05-22T06:10:56Z"
  },
  {
    "id": "MCPPLAN-006",
    "title": "Enforce ORB lifecycle and recovery semantics",
    "phase": "Phase 1 - Foundation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-005"
    ],
    "target_files": [
      "src/services/mcp-orb-capability-router.ts",
      "src/services/mcp-generated-app-state.ts",
      "test/mcp-plus-plus/mcp-orb-capability-router.test.ts",
      "test/mcp-plus-plus/mcp-generated-app-state.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-orb-capability-router.ts src/services/mcp-generated-app-state.ts src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "The broker enforces discover, bind, authorize, invoke, stream, and recover in order.",
      "Lifecycle receipts include correlation_id, descriptor identity, operation name, policy decision, and stream handle lineage.",
      "Recovery rejects stale handles and creates replacement handles with clear provenance."
    ],
    "prompt": "Add strict ORB lifecycle enforcement, receipts, stream recovery, and stale-handle prevention tests.",
    "updated": "2026-05-22T06:11:39Z"
  },
  {
    "id": "MCPPLAN-007",
    "title": "Add per-operation ORB policy hooks",
    "phase": "Phase 1 - Foundation",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPPLAN-005"
    ],
    "target_files": [
      "src/services/mcp-orb-capability-router.ts",
      "src/services/mcp-policy.ts",
      "src/services/mcp-scheduler.ts",
      "test/mcp-plus-plus/policy-and-scheduler.test.ts",
      "test/mcp-plus-plus/mcp-orb-capability-router.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-orb-capability-router.ts src/services/mcp-policy.ts src/services/mcp-scheduler.ts src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Authz, rate limit, retry, circuit breaker, and idempotency hooks can be configured per descriptor operation.",
      "Policy decisions include explicit deny reasons and retry/circuit metadata usable by generated UI.",
      "Tests cover allowed, denied, rate-limited, retried, open-circuit, and idempotent replay paths."
    ],
    "prompt": "Implement per-operation policy hooks for ORB invocation and make denial/retry/circuit decisions available to generated UI rendering.",
    "updated": "2026-05-22T06:12:53Z"
  },
  {
    "id": "MCPPLAN-008",
    "title": "Define template contracts for generated desktop apps",
    "phase": "Phase 2 - Generation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-001",
      "MCPPLAN-004"
    ],
    "target_files": [
      "src/services/mcp-ui-profile.ts",
      "src/services/mcp-schema-ui-generator.ts",
      "src/services/mcp-ipfs-ui-descriptors.ts",
      "test/mcp-plus-plus/mcp-ui-profile.test.ts",
      "test/mcp-plus-plus/mcp-schema-ui-generator.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-schema-ui-generator.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Template contracts exist for dashboard, explorer, form-wizard, job-console, and graph-viewer.",
      "Each template declares required operation, stream, table, form, and status capabilities.",
      "Descriptor validation rejects template mappings that lack required capabilities."
    ],
    "prompt": "Define formal template contracts and capability checks for generated desktop app archetypes.",
    "updated": "2026-05-22T06:13:37Z"
  },
  {
    "id": "MCPPLAN-009",
    "title": "Implement template selection policy",
    "phase": "Phase 2 - Generation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-008"
    ],
    "target_files": [
      "src/services/mcp-ui-profile.ts",
      "src/services/mcp-schema-ui-generator.ts",
      "test/mcp-plus-plus/mcp-ui-profile.test.ts",
      "test/mcp-plus-plus/mcp-schema-ui-generator.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-schema-ui-generator.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Selection considers interface type, operation shapes, stream profile, workflow graph, and explicit descriptor hints.",
      "The selector returns deterministic reasons for selected and rejected templates.",
      "Tests cover ambiguous descriptors, explicit overrides, and fallback template choice."
    ],
    "prompt": "Add a deterministic template selection policy from descriptor semantics to generated desktop app templates.",
    "updated": "2026-05-22T06:15:07Z"
  },
  {
    "id": "MCPPLAN-010",
    "title": "Generate commands, regions, forms, tables, and status widgets from schemas",
    "phase": "Phase 2 - Generation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-008",
      "MCPPLAN-009"
    ],
    "target_files": [
      "src/services/mcp-schema-ui-generator.ts",
      "web/js/generated-app-launcher.js",
      "test/mcp-plus-plus/mcp-schema-ui-generator.test.ts",
      "test/e2e/generated-app-quality-gate.e2e.test.ts"
    ],
    "validation": [
      "node --input-type=module --check < web/js/generated-app-launcher.js",
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-schema-ui-generator.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Operation input schemas generate form controls and command actions without bespoke app shell code.",
      "Operation output schemas generate table, detail, graph, artifact, and status renderers.",
      "Generated controls are stable under optional fields, unions, arrays, enums, and nested objects."
    ],
    "prompt": "Expand schema-to-UI generation so descriptor operation schemas directly produce commands, regions, forms, tables, and status widgets.",
    "updated": "2026-05-22T06:17:06Z"
  },
  {
    "id": "MCPPLAN-011",
    "title": "Add field-level widgets, validation, and sanitization",
    "phase": "Phase 2 - Generation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-010"
    ],
    "target_files": [
      "src/services/mcp-schema-ui-generator.ts",
      "web/js/generated-app-launcher.js",
      "test/mcp-plus-plus/mcp-schema-ui-generator.test.ts",
      "test/e2e/generated-app-quality-gate.e2e.test.ts"
    ],
    "validation": [
      "node --input-type=module --check < web/js/generated-app-launcher.js",
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-schema-ui-generator.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Generated widgets include CID picker, DID input, status badges, progress timeline, and provenance panels.",
      "All generated text, HTML, and attributes are escaped or sanitized at render boundaries.",
      "Typed validation rejects invalid inputs before invoke and displays field-specific denial or validation messages."
    ],
    "prompt": "Implement field-level generated widgets and strict sanitization/typed validation for descriptor-driven UI controls.",
    "updated": "2026-05-22T06:17:58Z"
  },
  {
    "id": "MCPPLAN-012",
    "title": "Complete ipfs_datasets_py dataset descriptor pack",
    "phase": "Phase 3 - IPFS Packs",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-002",
      "MCPPLAN-010"
    ],
    "target_files": [
      "src/services/mcp-ipfs-datasets-descriptor-pack.ts",
      "src/services/mcp-ipfs-ui-descriptors.ts",
      "test/mcp-plus-plus/ipfs-datasets-descriptor-pack.test.ts",
      "test/mcp-plus-plus/ipfs-ui-descriptors.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ipfs-datasets-descriptor-pack.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-schema-ui-generator.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "The pack maps browse, get, index, pin, publish, and sync operations to MCP++ UI Profile descriptors.",
      "Progress and sync streams use normalized event contracts with correlation_id and provenance fields.",
      "Descriptor fixtures validate without live services and include runtime binding metadata for live services."
    ],
    "prompt": "Complete the ipfs_datasets_py dataset descriptor pack for browse/get/index/pin/publish plus sync/progress streams.",
    "updated": "2026-05-22T06:23:46Z"
  },
  {
    "id": "MCPPLAN-013",
    "title": "Complete ipfs_accelerate_py compute descriptor pack",
    "phase": "Phase 3 - IPFS Packs",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-002",
      "MCPPLAN-010"
    ],
    "target_files": [
      "src/services/mcp-ipfs-accelerate-descriptor-pack.ts",
      "src/services/mcp-ipfs-ui-descriptors.ts",
      "test/mcp-plus-plus/ipfs-accelerate-descriptor-pack.test.ts",
      "test/mcp-plus-plus/ipfs-ui-descriptors.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ipfs-accelerate-descriptor-pack.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-schema-ui-generator.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "The pack maps hardware_profile, run_inference_job, job_status, artifact publish, and telemetry operations.",
      "Telemetry streams use normalized event contracts with correlation_id, progress, and provenance fields.",
      "Descriptors include template mappings for job-console and dashboard generation."
    ],
    "prompt": "Complete the ipfs_accelerate_py compute/inference descriptor pack for hardware discovery, inference jobs, job status, artifacts, and telemetry streams.",
    "updated": "2026-05-22T06:24:25Z"
  },
  {
    "id": "MCPPLAN-014",
    "title": "Normalize cross-backend payload and event contracts",
    "phase": "Phase 3 - IPFS Packs",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-012",
      "MCPPLAN-013"
    ],
    "target_files": [
      "src/services/mcp-ipfs-datasets-descriptor-pack.ts",
      "src/services/mcp-ipfs-accelerate-descriptor-pack.ts",
      "src/services/mcp-ipfs-ui-descriptors.ts",
      "test/mcp-plus-plus/ipfs-datasets-descriptor-pack.test.ts",
      "test/mcp-plus-plus/ipfs-accelerate-descriptor-pack.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ipfs-datasets-descriptor-pack.ts src/services/mcp-ipfs-accelerate-descriptor-pack.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Dataset and compute descriptors share normalized payload primitives for CID, DID, artifact, job, status, progress, and provenance.",
      "Stream events from both backends can be rendered by the same generated status/provenance widgets.",
      "Tests verify that composed workflows do not require backend-specific UI code."
    ],
    "prompt": "Normalize payload and event contracts across ipfs_datasets_py and ipfs_accelerate_py so generated workflows can compose both backends.",
    "updated": "2026-05-22T06:25:10Z"
  },
  {
    "id": "MCPPLAN-015",
    "title": "Add declarative workflow graph descriptors",
    "phase": "Phase 3 - IPFS Packs",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-014"
    ],
    "target_files": [
      "src/services/mcp-ui-profile.ts",
      "src/services/mcp-generated-app-state.ts",
      "src/services/mcp-schema-ui-generator.ts",
      "test/mcp-plus-plus/mcp-ui-profile.test.ts",
      "test/mcp-plus-plus/mcp-generated-app-state.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-generated-app-state.ts src/services/mcp-schema-ui-generator.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Descriptors can declare workflow step dependencies, shared state keys, rollback actions, and compensation actions.",
      "Workflow validation detects cycles, missing operations, invalid shared state references, and missing rollback contracts.",
      "Generated UI can render workflow progress and step-level failure state."
    ],
    "prompt": "Introduce declarative workflow graph support in descriptors, including dependencies, shared state, rollback, and compensation semantics.",
    "updated": "2026-05-22T06:27:29Z"
  },
  {
    "id": "MCPPLAN-016",
    "title": "Generate composed dataset-to-inference desktop workflow",
    "phase": "Phase 3 - IPFS Packs",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-015",
      "MCPPLAN-006",
      "MCPPLAN-011"
    ],
    "target_files": [
      "src/services/mcp-ipfs-ui-descriptors.ts",
      "src/services/mcp-generated-app-quality-gates.ts",
      "web/js/generated-app-launcher.js",
      "test/e2e/generated-app-quality-gate.e2e.test.ts",
      "test/mcp-plus-plus/integration-pipeline.test.ts"
    ],
    "validation": [
      "node --input-type=module --check < web/js/generated-app-launcher.js",
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-generated-app-quality-gates.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-generated-app-state.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "A descriptor-only workflow chains dataset selection, pin or publish, inference, and artifact publish.",
      "The generated app invokes ORB operations and streams updates without bespoke shell code.",
      "Recovery paths cover failed pin, failed inference, stream reconnect, and artifact publish retry."
    ],
    "prompt": "Use the descriptor packs and workflow graph to generate the canonical dataset selection to inference to artifact publish desktop workflow.",
    "updated": "2026-05-22T06:34:29Z"
  },
  {
    "id": "MCPPLAN-017",
    "title": "Surface correlation lineage and provenance audit region",
    "phase": "Phase 3 - IPFS Packs",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPPLAN-014",
      "MCPPLAN-016"
    ],
    "target_files": [
      "src/services/event-dag.ts",
      "src/services/mcp-generated-app-state.ts",
      "src/services/mcp-schema-ui-generator.ts",
      "web/js/generated-app-launcher.js",
      "test/mcp-plus-plus/event-dag.test.ts",
      "test/mcp-plus-plus/mcp-generated-app-state.test.ts"
    ],
    "validation": [
      "node --input-type=module --check < web/js/generated-app-launcher.js",
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/event-dag.ts src/services/mcp-generated-app-state.ts src/services/mcp-schema-ui-generator.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Generated apps include a built-in audit region for correlation_id lineage and provenance.",
      "Audit projections connect commands, ORB receipts, stream events, workflow steps, and artifact CIDs.",
      "Tests verify lineage survives replay and reconnect."
    ],
    "prompt": "Add built-in audit/provenance rendering for correlation_id lineage across commands, streams, workflow steps, and published artifacts.",
    "updated": "2026-05-22T06:39:48Z"
  },
  {
    "id": "MCPPLAN-018",
    "title": "Move generated app state to deterministic event sourcing",
    "phase": "Phase 4 - Productionization",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-006",
      "MCPPLAN-015"
    ],
    "target_files": [
      "src/services/mcp-generated-app-state.ts",
      "src/services/event-dag.ts",
      "test/mcp-plus-plus/mcp-generated-app-state.test.ts",
      "test/mcp-plus-plus/event-dag.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-generated-app-state.ts src/services/event-dag.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Generated app state is modeled as deterministic commands, events, and projections.",
      "Projection output is stable for equivalent event logs and rejects out-of-order generation numbers.",
      "State model supports descriptor-declared shared state keys and workflow projections."
    ],
    "prompt": "Replace mutable generated-app state assumptions with deterministic event-sourced commands, events, and projections.",
    "updated": "2026-05-22T06:41:43Z"
  },
  {
    "id": "MCPPLAN-019",
    "title": "Persist replay logs and restoration tooling",
    "phase": "Phase 4 - Productionization",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPPLAN-018",
      "MCPPLAN-017"
    ],
    "target_files": [
      "src/services/mcp-generated-app-state.ts",
      "src/services/mcp-descriptor-inspector.ts",
      "web/js/descriptor-inspector.js",
      "test/mcp-plus-plus/mcp-generated-app-state.test.ts",
      "test/mcp-plus-plus/mcp-descriptor-inspector.test.ts"
    ],
    "validation": [
      "node --input-type=module --check < web/js/descriptor-inspector.js",
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-generated-app-state.ts src/services/mcp-descriptor-inspector.ts src/services/event-dag.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Replay logs persist per generated app instance with descriptor identity and version metadata.",
      "Restoration can rebuild projections, audit lineage, and workflow status from persisted logs.",
      "Inspector tooling can load and summarize replay logs for debugging."
    ],
    "prompt": "Add replay log persistence and restoration tooling for generated app debugging and recovery.",
    "updated": "2026-05-22T06:51:12Z"
  },
  {
    "id": "MCPPLAN-020",
    "title": "Harden stream generations and stale-handle prevention",
    "phase": "Phase 4 - Productionization",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-006",
      "MCPPLAN-018"
    ],
    "target_files": [
      "src/services/mcp-orb-capability-router.ts",
      "src/services/mcp-generated-app-state.ts",
      "test/mcp-plus-plus/mcp-orb-capability-router.test.ts",
      "test/mcp-plus-plus/mcp-generated-app-state.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-orb-capability-router.ts src/services/mcp-generated-app-state.ts src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Each stream event carries a generation, binding identity, correlation_id, and recovery lineage.",
      "Reconnect creates a new generation and prevents older events from mutating current projections.",
      "Tests cover stale handle invocation, stale stream events, reconnect replay, and duplicate event suppression."
    ],
    "prompt": "Add stream generation guards and stale-handle prevention across ORB reconnect and generated state replay paths.",
    "updated": "2026-05-22T06:44:29Z"
  },
  {
    "id": "MCPPLAN-021",
    "title": "Enforce descriptor trust, signing, allowlists, and least privilege",
    "phase": "Phase 4 - Productionization",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-002",
      "MCPPLAN-007"
    ],
    "target_files": [
      "src/services/mcp-descriptor-trust.ts",
      "src/services/mcp-interface-registry.ts",
      "src/services/mcp-policy.ts",
      "test/mcp-plus-plus/mcp-descriptor-trust.test.ts",
      "test/mcp-plus-plus/policy-and-scheduler.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-descriptor-trust.ts src/services/mcp-interface-registry.ts src/services/mcp-policy.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Descriptor signing and verification are enforced before registry publish when trust policy requires it.",
      "Publisher allowlists can accept or reject descriptors before app launch.",
      "Operation/action permissions follow least privilege and deny by default when required permissions are absent."
    ],
    "prompt": "Productionize descriptor trust boundaries with signing, verification, allowlists, and least-privilege operation permissions.",
    "updated": "2026-05-22T06:45:39Z"
  },
  {
    "id": "MCPPLAN-022",
    "title": "Render policy-aware generated UI states",
    "phase": "Phase 4 - Productionization",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPPLAN-011",
      "MCPPLAN-021"
    ],
    "target_files": [
      "src/services/mcp-schema-ui-generator.ts",
      "web/js/generated-app-launcher.js",
      "test/mcp-plus-plus/mcp-schema-ui-generator.test.ts",
      "test/e2e/generated-app-quality-gate.e2e.test.ts"
    ],
    "validation": [
      "node --input-type=module --check < web/js/generated-app-launcher.js",
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-schema-ui-generator.ts src/services/mcp-descriptor-trust.ts src/services/mcp-policy.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Generated UI hides or disables prohibited actions based on policy decisions.",
      "Disabled and denied controls expose explicit, sanitized denial reasons.",
      "Tests verify policy-aware rendering for permitted, denied, and conditionally unavailable operations."
    ],
    "prompt": "Make generated desktop UI policy-aware so prohibited operations are hidden or disabled with explicit denial reasons.",
    "updated": "2026-05-22T06:48:10Z"
  },
  {
    "id": "MCPPLAN-023",
    "title": "Complete descriptor authoring CLI and starter packs",
    "phase": "Phase 4 - Productionization",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPPLAN-008",
      "MCPPLAN-021"
    ],
    "target_files": [
      "scripts/mcp-plus-plus/descriptor_cli.mjs",
      "docs/mcp-plus-plus/DESCRIPTOR_AUTHORING_CLI.md",
      "test/mcp-plus-plus/descriptor_cli_test.py",
      "docs/mcp-plus-plus"
    ],
    "validation": [
      "python3 -m unittest discover -s test/mcp-plus-plus -p 'descriptor_cli_test.py'",
      "node scripts/mcp-plus-plus/descriptor_cli.mjs --help"
    ],
    "done_criteria": [
      "CLI supports lint, schema validate, compatibility check, signing verification, and template scaffold commands.",
      "Starter packs exist for CRUD, stream dashboard, long-running job console, explorer, and composed workflow apps.",
      "Generated starter descriptors pass conformance and can be inspected by local tooling."
    ],
    "prompt": "Finish the descriptor authoring CLI and starter packs so descriptor authors can scaffold and validate generated app contracts.",
    "updated": "2026-05-22T06:54:50Z"
  },
  {
    "id": "MCPPLAN-024",
    "title": "Ship visual descriptor inspector for UI mapping debug",
    "phase": "Phase 4 - Productionization",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPPLAN-010",
      "MCPPLAN-019",
      "MCPPLAN-023"
    ],
    "target_files": [
      "src/services/mcp-descriptor-inspector.ts",
      "web/js/descriptor-inspector.js",
      "test/mcp-plus-plus/mcp-descriptor-inspector.test.ts"
    ],
    "validation": [
      "node --input-type=module --check < web/js/descriptor-inspector.js",
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-descriptor-inspector.ts src/services/mcp-schema-ui-generator.ts src/services/mcp-ui-profile.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Inspector shows descriptor metadata, operations, schemas, template selection reasons, policy decisions, and workflow graph.",
      "Inspector highlights missing capabilities and generated UI mapping failures with actionable messages.",
      "Inspector can load replay logs and show projection/audit state for an app instance."
    ],
    "prompt": "Complete the visual descriptor inspector for debugging generated UI mappings, policy decisions, workflow graphs, and replay logs.",
    "updated": "2026-05-22T06:57:08Z"
  },
  {
    "id": "MCPPLAN-025",
    "title": "Create contract, integration, and end-to-end quality gates",
    "phase": "Phase 4 - Productionization",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPPLAN-016",
      "MCPPLAN-020",
      "MCPPLAN-022",
      "MCPPLAN-024"
    ],
    "target_files": [
      "src/services/mcp-generated-app-quality-gates.ts",
      "test/mcp-plus-plus/mcp-generated-app-quality-gates.test.ts",
      "test/mcp-plus-plus/integration-pipeline.test.ts",
      "test/e2e/generated-app-quality-gate.e2e.test.ts",
      "config/jest/jest.config.cjs"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus/mcp-generated-app-quality-gates.test.ts --config=config/jest/jest.config.cjs --runInBand",
      "npx jest test/mcp-plus-plus/integration-pipeline.test.ts --config=config/jest/jest.config.cjs --runInBand",
      "npx jest test/e2e/generated-app-quality-gate.e2e.test.ts --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Contract tests cover descriptor schema, compatibility, template capability checks, trust, and policy-aware rendering.",
      "Integration tests cover ORB lifecycle against mocked MCP++ interfaces and mocked IPFS dataset/compute backends.",
      "End-to-end tests cover generated app launch, action invocation, stream updates, recovery, replay, and provenance audit."
    ],
    "prompt": "Create production quality gates for descriptor-driven app generation, including contract, integration, and end-to-end recovery coverage.",
    "updated": "2026-05-22T06:58:21Z"
  },
  {
    "id": "MCPPLAN-026",
    "title": "Document rollout, observability, and migration from hand-coded apps",
    "phase": "Phase 4 - Productionization",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPPLAN-025"
    ],
    "target_files": [
      "docs/mcp-plus-plus/CONFORMANCE_MATRIX.md",
      "docs/mcp-plus-plus/DESCRIPTOR_AUTHORING_CLI.md",
      "docs/mcp-plus-plus/IMPLEMENTATION_PLAN_TODO_QUEUE.md",
      "docs/MCP_PLUS_PLUS_IMPROVEMENT_PLAN.md"
    ],
    "validation": [
      "python3 scripts/mcp-plus-plus/todo_daemon.py --todo-file docs/mcp-plus-plus/IMPLEMENTATION_PLAN_TODO_QUEUE.md status",
      "git diff --check"
    ],
    "done_criteria": [
      "Roadmap phases are mapped to release gates, observability requirements, and rollback criteria.",
      "Migration guidance explains how existing hand-coded virtual desktop apps move to descriptor plus template mappings.",
      "Definition of done is verified by at least one descriptor-only virtual desktop app path with no bespoke shell code."
    ],
    "prompt": "Document the production rollout, observability, and migration path from hand-coded apps to descriptor-only generated desktop apps.",
    "updated": "2026-05-22T07:00:06Z"
  }
]
```
<!-- codex-todo-queue:end -->

## Phase Mapping

- Queue operations: `MCPPLAN-000`
- Phase 1, Foundation: `MCPPLAN-001` through `MCPPLAN-007`
- Phase 2, Generation: `MCPPLAN-008` through `MCPPLAN-011`
- Phase 3, IPFS packs and composition: `MCPPLAN-012` through `MCPPLAN-017`
- Phase 4, Productionization: `MCPPLAN-018` through `MCPPLAN-026`

## Supervisor Notes

- The first dependency-ready task is `MCPPLAN-000`.
- Use `backend-sync` after queue edits so `.codex/todo-daemon/ipfs_datasets_backend.json` mirrors the current queue.
- If a worker discovers missing prerequisite work, add a new task with a stable ID and wire it into the dependency list instead of hiding that work inside an unrelated item.
