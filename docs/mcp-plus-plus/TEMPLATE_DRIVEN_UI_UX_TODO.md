# MCP++ Template-Driven UI/UX Todo

**Status:** Active implementation backlog  
**Last updated:** 2026-05-21  
**Goal:** A new virtual desktop app can be shipped by publishing an MCP++ compatible interface descriptor plus template mapping, with zero bespoke app shell code.

## Source Inputs

- MCP++ normative intent: `endomorphosis/Mcp-Plus-Plus`, especially Profile A MCP-IDL, repository methods `interfaces/list`, `interfaces/get`, and `interfaces/compat`, plus stream/event semantics.
- Dataset backend target: `endomorphosis/ipfs_datasets_py`, especially MCP server tools for dataset, IPFS, provenance, workflow, background task, and stream/progress surfaces.
- Compute backend target: `endomorphosis/ipfs_accelerate_py`, especially MCP server tools for hardware discovery, inference, job status, telemetry, IPFS files, and MCP++ descriptor registry patterns.
- SwissKnife current implementation: `src/services/mcp-idl.ts`, MCP++ tests in `test/mcp-plus-plus`, and virtual desktop launch code in `web/js/main.js`.

## Automation Queue

The queue below is the tracked backlog consumed by `scripts/mcp-plus-plus/todo_daemon.py`. It follows the same claim/complete/worker-assignment pattern as the `ipfs_datasets_py` todo tooling, but uses this repository's markdown plan as the source of truth and keeps local runtime state under `.codex/todo-daemon/`.

<!-- codex-todo-queue:start -->
```json
[
  {
    "id": "MCPUI-001",
    "title": "Define SwissKnife MCP++ UI Profile descriptor model",
    "phase": "Foundation",
    "priority": "P0",
    "status": "done",
    "dependencies": [],
    "target_files": [
      "src/services/mcp-ui-profile.ts",
      "src/services/mcp-idl.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "Descriptor sections meta, services, ui, data_contracts, permissions, and state_model are typed.",
      "Validator rejects missing operation schemas, invalid stream declarations, and unbound UI operations.",
      "MCP++ MCP-IDL aliases remain accepted as source-of-truth fields."
    ],
    "prompt": "Harden and extend the MCP++ UI Profile descriptor model and conformance checks."
  },
  {
    "id": "MCPUI-002",
    "title": "Add MCP++ interface registry and discovery abstraction",
    "phase": "Foundation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPUI-001"
    ],
    "target_files": [
      "src/services/mcp-interface-registry.ts",
      "src/services/mcp-idl.ts"
    ],
    "validation": [
      "npx -y tsx -e \"import { MCPInterfaceDiscoveryRegistry } from './src/services/mcp-interface-registry.ts'; console.log(typeof MCPInterfaceDiscoveryRegistry);\""
    ],
    "done_criteria": [
      "Registry exposes interfaces/list, interfaces/get, interfaces/compat, and interfaces/select compatible entry points.",
      "Publishing validates the SwissKnife MCP++ UI Profile before registration.",
      "Discovery returns descriptors with selected template metadata."
    ],
    "prompt": "Implement a local MCP++ registry/discovery abstraction over InterfaceRepository."
  },
  {
    "id": "MCPUI-003",
    "title": "Add compatibility fallback and startup resolution primitives",
    "phase": "Foundation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPUI-001",
      "MCPUI-002"
    ],
    "target_files": [
      "src/services/mcp-interface-registry.ts",
      "test/mcp-plus-plus/mcp-ui-profile.test.ts"
    ],
    "validation": [
      "npx -y tsx -e \"import { compareVersions } from './src/services/mcp-interface-registry.ts'; if (compareVersions('1.2.0', '1.1.0') <= 0) throw new Error('bad compare');\""
    ],
    "done_criteria": [
      "Launch resolution can prefer an app_id, interface_type, preferred_version, and required_methods.",
      "Resolution falls back to latest compatible descriptors when an exact version is unavailable.",
      "Compatibility alternatives declared by MCP++ descriptors are considered."
    ],
    "prompt": "Add version negotiation and compatibility fallback for generated app launch."
  },
  {
    "id": "MCPUI-004",
    "title": "Add focused MCP++ UI profile contract tests",
    "phase": "Foundation",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPUI-001",
      "MCPUI-002",
      "MCPUI-003"
    ],
    "target_files": [
      "test/mcp-plus-plus/mcp-ui-profile.test.ts"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus/mcp-ui-profile.test.ts --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Tests cover conformance success and failure.",
      "Tests cover template selection and registry discovery.",
      "Tests cover compatibility fallback."
    ],
    "prompt": "Add unit coverage for the first MCP++ UI Profile implementation slice."
  },
  {
    "id": "MCPUI-005",
    "title": "Add Codex todo queue adapter and daemon",
    "phase": "Developer Experience",
    "priority": "P0",
    "status": "done",
    "dependencies": [],
    "target_files": [
      "docs/mcp-plus-plus/TEMPLATE_DRIVEN_UI_UX_TODO.md",
      "scripts/mcp-plus-plus/todo_daemon.py",
      "test/mcp-plus-plus/todo_daemon_test.py",
      ".gitignore"
    ],
    "validation": [
      "python3 -m unittest discover -s test/mcp-plus-plus -p 'todo_daemon_test.py'",
      "python3 scripts/mcp-plus-plus/todo_daemon.py status",
      "python3 scripts/mcp-plus-plus/todo_daemon.py next"
    ],
    "done_criteria": [
      "Todo queue has stable IDs, priorities, dependencies, target files, validation, and done criteria.",
      "Daemon can report status, choose the next dependency-ready item, claim items, complete items, and render Codex prompts.",
      "run-once defaults to dry-run and requires --execute before invoking codex exec."
    ],
    "prompt": "Create a SwissKnife todo daemon inspired by ipfs_datasets_py todo manager patterns."
  },
  {
    "id": "MCPUI-006",
    "title": "Seed static descriptor examples for IPFS dataset and inference backends",
    "phase": "Foundation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPUI-001",
      "MCPUI-002",
      "MCPUI-003"
    ],
    "target_files": [
      "src/services/mcp-ipfs-ui-descriptors.ts",
      "test/mcp-plus-plus/ipfs-ui-descriptors.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts src/services/mcp-ipfs-ui-descriptors.ts",
      "npx -y tsx -e \"import { IPFS_MCP_UI_PROFILE_DESCRIPTORS } from './src/services/mcp-ipfs-ui-descriptors.ts'; import { validateMCPUIProfileDescriptor } from './src/services/mcp-ui-profile.ts'; for (const descriptor of IPFS_MCP_UI_PROFILE_DESCRIPTORS) { const result = validateMCPUIProfileDescriptor(descriptor); if (!result.conformant) throw new Error(JSON.stringify(result.errors)); } console.log('descriptor fixtures ok');\"",
      "python3 scripts/mcp-plus-plus/todo_daemon.py status"
    ],
    "done_criteria": [
      "Static descriptors model ipfs_datasets_py browse/get/index/pin/publish operations and progress streams.",
      "Static descriptors model ipfs_accelerate_py hardware_profile/run_inference_job/job_status operations and telemetry streams.",
      "Fixtures validate through the MCP++ UI Profile validator without live services."
    ],
    "prompt": "Add static MCP++ UI Profile descriptor fixtures for ipfs_datasets_py and ipfs_accelerate_py so later ORB and UI generation work has concrete contracts.",
    "updated": "2026-05-21T08:49:04Z"
  },
  {
    "id": "MCPUI-007",
    "title": "Define ORB transport adapter and lifecycle contracts",
    "phase": "ORB Capability Router",
    "priority": "P0",
    "status": "in_progress",
    "dependencies": [
      "MCPUI-002",
      "MCPUI-006"
    ],
    "target_files": [
      "src/services",
      "test/mcp-plus-plus"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts"
    ],
    "done_criteria": [
      "ORB adapter interface supports local, websocket, HTTP, and MCP server bridge transports.",
      "Broker lifecycle is modeled as discover, bind, authorize, invoke, stream, and recover.",
      "Invocation receipts include correlation_id, descriptor identity, operation, policy decision, and provenance references."
    ],
    "prompt": "Introduce a pluggable ORB capability router contract for MCP++ descriptor operations.",
    "updated": "2026-05-21T18:21:21Z"
  },
  {
    "id": "MCPUI-008",
    "title": "Implement local ORB adapter and lifecycle tests",
    "phase": "ORB Capability Router",
    "priority": "P0",
    "status": "pending",
    "dependencies": [
      "MCPUI-007"
    ],
    "target_files": [
      "src/services",
      "test/mcp-plus-plus"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Local adapter can bind descriptor operations to mocked handlers.",
      "Lifecycle tests cover successful invocation, stream subscription, recovery, and stale-handle rejection.",
      "Policy and receipt data are emitted for every operation."
    ],
    "prompt": "Build the first local ORB adapter and test the full descriptor operation lifecycle."
  },
  {
    "id": "MCPUI-009",
    "title": "Add per-operation policy hooks",
    "phase": "ORB Capability Router",
    "priority": "P1",
    "status": "pending",
    "dependencies": [
      "MCPUI-007"
    ],
    "target_files": [
      "src/services",
      "test/mcp-plus-plus"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Authorization, rate limit, retry, circuit breaker, and idempotency hooks can be configured per operation.",
      "Denied operations return explicit reasons usable by UI rendering.",
      "Policy hooks are covered by unit tests."
    ],
    "prompt": "Add operation-level policy hooks to the ORB lifecycle."
  },
  {
    "id": "MCPUI-010",
    "title": "Define template contracts and capability validator",
    "phase": "Template-Driven UI Generation",
    "priority": "P0",
    "status": "pending",
    "dependencies": [
      "MCPUI-006",
      "MCPUI-007"
    ],
    "target_files": [
      "src/services",
      "test/mcp-plus-plus"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts"
    ],
    "done_criteria": [
      "Dashboard, explorer, form-wizard, job-console, and graph-viewer templates declare required descriptor capabilities.",
      "Template selection uses interface type, operation shape, stream profile, and state model.",
      "Invalid template mappings fail conformance checks before publish."
    ],
    "prompt": "Make template contracts explicit and validate that descriptors provide the required capabilities."
  },
  {
    "id": "MCPUI-011",
    "title": "Generate schema-driven controls and result renderers",
    "phase": "Schema-to-Component Binding",
    "priority": "P0",
    "status": "pending",
    "dependencies": [
      "MCPUI-010"
    ],
    "target_files": [
      "src",
      "web/js",
      "test"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Operation input schemas generate typed forms.",
      "Operation output schemas generate tables, cards, logs, and result renderers.",
      "CID picker, DID input, status badge, progress timeline, provenance panel, and policy denial panel widgets are available."
    ],
    "prompt": "Generate commands, forms, regions, result renderers, and field widgets from MCP++ operation schemas."
  },
  {
    "id": "MCPUI-012",
    "title": "Resolve virtual desktop app launch from live discovery",
    "phase": "Template-Driven UI Generation",
    "priority": "P0",
    "status": "pending",
    "dependencies": [
      "MCPUI-002",
      "MCPUI-010",
      "MCPUI-011"
    ],
    "target_files": [
      "web/js/main.js",
      "src/services",
      "test"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Desktop startup can resolve generated apps from registry discovery instead of static descriptor arrays.",
      "Version negotiation and compatibility fallback are exercised during launch.",
      "Policy-aware rendering hides or disables prohibited actions with explicit denial reasons."
    ],
    "prompt": "Wire generated virtual desktop app launch to MCP++ live interface discovery."
  },
  {
    "id": "MCPUI-013",
    "title": "Build ipfs_datasets_py descriptor pack",
    "phase": "IPFS Integration Profile",
    "priority": "P1",
    "status": "pending",
    "dependencies": [
      "MCPUI-006",
      "MCPUI-010",
      "MCPUI-011"
    ],
    "target_files": [
      "src",
      "docs/mcp-plus-plus",
      "test/mcp-plus-plus"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Descriptor pack maps browse, get, index, pin, publish, sync, and progress stream surfaces.",
      "Payload and event contracts are normalized for composition with compute backends.",
      "Pack can be validated without starting a live ipfs_datasets_py service."
    ],
    "prompt": "Create the full MCP++ descriptor pack for ipfs_datasets_py dataset workflows."
  },
  {
    "id": "MCPUI-014",
    "title": "Build ipfs_accelerate_py descriptor pack",
    "phase": "IPFS Integration Profile",
    "priority": "P1",
    "status": "pending",
    "dependencies": [
      "MCPUI-006",
      "MCPUI-010",
      "MCPUI-011"
    ],
    "target_files": [
      "src",
      "docs/mcp-plus-plus",
      "test/mcp-plus-plus"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Descriptor pack maps hardware_profile, run_inference_job, job_status, and telemetry streams.",
      "Payload and event contracts are normalized for composition with dataset backends.",
      "Pack can be validated without starting a live ipfs_accelerate_py service."
    ],
    "prompt": "Create the full MCP++ descriptor pack for ipfs_accelerate_py compute and inference workflows."
  },
  {
    "id": "MCPUI-015",
    "title": "Add declarative workflow graph and composition validation",
    "phase": "Cross-Service Composition",
    "priority": "P1",
    "status": "pending",
    "dependencies": [
      "MCPUI-013",
      "MCPUI-014"
    ],
    "target_files": [
      "src/services",
      "test/mcp-plus-plus"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Descriptors can declare step dependencies, shared state keys, rollback actions, and compensation actions.",
      "Validation rejects missing operation references and incompatible shared state contracts.",
      "Dataset selection, pin or publish, inference, and artifact publish can be represented as one generated workflow."
    ],
    "prompt": "Add declarative cross-service workflow graph support to MCP++ UI Profile descriptors."
  },
  {
    "id": "MCPUI-016",
    "title": "Add event-sourced generated app state and replay logs",
    "phase": "State, Events, And Replay",
    "priority": "P1",
    "status": "pending",
    "dependencies": [
      "MCPUI-007",
      "MCPUI-012"
    ],
    "target_files": [
      "src",
      "web/js",
      "test"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Generated apps persist command, event, and projection replay logs per app instance.",
      "Restore-from-replay reconstructs deterministic local state.",
      "Stream generation guards and stale-handle prevention survive reconnects."
    ],
    "prompt": "Move generated app state toward deterministic event sourcing and replay."
  },
  {
    "id": "MCPUI-017",
    "title": "Add descriptor signing, allowlists, and trust-aware rendering",
    "phase": "Security And Trust Boundaries",
    "priority": "P1",
    "status": "pending",
    "dependencies": [
      "MCPUI-009",
      "MCPUI-012"
    ],
    "target_files": [
      "src",
      "web/js",
      "test"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Descriptor signing and verification are enforced for protected launch paths.",
      "Optional publisher allowlists are supported.",
      "Rendering surfaces trust status and least-privilege denial reasons."
    ],
    "prompt": "Implement descriptor trust boundaries and policy-aware generated UI behavior."
  },
  {
    "id": "MCPUI-018",
    "title": "Create descriptor authoring CLI",
    "phase": "Developer Experience",
    "priority": "P2",
    "status": "pending",
    "dependencies": [
      "MCPUI-010",
      "MCPUI-013",
      "MCPUI-014"
    ],
    "target_files": [
      "src",
      "scripts",
      "docs/mcp-plus-plus",
      "test"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "CLI supports lint, schema validation, compatibility checks, and template scaffolding.",
      "Starter packs cover CRUD, stream dashboard, long-running job console, and dataset-to-inference workflow.",
      "Docs show publishing a descriptor pack without custom app shell code."
    ],
    "prompt": "Add descriptor authoring CLI and starter pack scaffolding."
  },
  {
    "id": "MCPUI-019",
    "title": "Add visual descriptor inspector",
    "phase": "Developer Experience",
    "priority": "P2",
    "status": "pending",
    "dependencies": [
      "MCPUI-011",
      "MCPUI-012"
    ],
    "target_files": [
      "web/js",
      "src",
      "test"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "Inspector visualizes descriptor sections, template mappings, operation schemas, permissions, and state events.",
      "Inspector explains why a descriptor maps to a chosen template.",
      "Inspector highlights validation failures with actionable messages."
    ],
    "prompt": "Build a visual descriptor inspector for debugging generated UI mappings."
  },
  {
    "id": "MCPUI-020",
    "title": "Add generated app end-to-end quality gates",
    "phase": "Testing And Quality Gates",
    "priority": "P1",
    "status": "pending",
    "dependencies": [
      "MCPUI-012",
      "MCPUI-013",
      "MCPUI-014"
    ],
    "target_files": [
      "test/e2e",
      "test/mcp-plus-plus",
      "config"
    ],
    "validation": [
      "npx jest test/mcp-plus-plus --config=config/jest/jest.config.cjs --runInBand"
    ],
    "done_criteria": [
      "End-to-end tests launch generated apps from descriptors.",
      "Tests cover action invocation, stream updates, recovery, and policy denial paths.",
      "CI gates reject non-conforming descriptor packs."
    ],
    "prompt": "Add quality gates for descriptor-driven generated virtual desktop apps."
  },
  {
    "id": "MCPUI-021",
    "title": "Bridge todo daemon to ipfs_datasets_py MCP++ task queue backend",
    "phase": "Developer Experience",
    "priority": "P2",
    "status": "pending",
    "dependencies": [
      "MCPUI-005",
      "MCPUI-007"
    ],
    "target_files": [
      "scripts/mcp-plus-plus/todo_daemon.py",
      "test/mcp-plus-plus/todo_daemon_test.py",
      "docs/mcp-plus-plus/TEMPLATE_DRIVEN_UI_UX_TODO.md"
    ],
    "validation": [
      "python3 -m unittest discover -s test/mcp-plus-plus -p 'todo_daemon_test.py'"
    ],
    "done_criteria": [
      "Daemon can detect an available ipfs_datasets_py MCP++ task queue backend.",
      "Markdown queue items can be mirrored into the backend with stable task IDs and dependency metadata.",
      "Claim, complete, fail, and retry state stays consistent between local markdown and the backend.",
      "Local markdown/state mode remains the fallback when the backend is unavailable."
    ],
    "prompt": "Add an optional backend bridge from the SwissKnife todo daemon to the ipfs_datasets_py MCP++ task queue once the backend API is available."
  }
]
```
<!-- codex-todo-queue:end -->

Queue commands:

- `python3 scripts/mcp-plus-plus/todo_daemon.py status`
- `python3 scripts/mcp-plus-plus/todo_daemon.py next`
- `python3 scripts/mcp-plus-plus/todo_daemon.py run-once`
- `python3 scripts/mcp-plus-plus/todo_daemon.py run-once --execute`
- `python3 scripts/mcp-plus-plus/todo_daemon.py daemon --execute --interval 60`

`run-once` and `daemon` default to dry-run unless `--execute` is provided. Runtime claim history is stored under `.codex/todo-daemon/` and is intentionally ignored by git.

## Phase 1: Foundation

- [x] Define the SwissKnife MCP++ UI Profile descriptor shape with required sections:
  - `meta`
  - `services`
  - `ui`
  - `data_contracts`
  - `permissions`
  - `state_model`
- [x] Treat MCP++ MCP-IDL as the source of truth for canonical descriptor fields, method naming, compatibility verdict shape, and stream/event declarations.
- [x] Add profile conformance checks so publishing a generated-app descriptor fails before registration when required sections or operation contracts are missing.
- [x] Add a registry abstraction backed by MCP++ repository methods:
  - `interfaces/list`
  - `interfaces/get`
  - `interfaces/compat`
  - optional `interfaces/select`
- [x] Add version negotiation and compatibility fallback for app startup.
- [x] Seed descriptor examples for `ipfs_datasets_py` and `ipfs_accelerate_py` without requiring live services.

## Phase 2: ORB Capability Router

- [ ] Evolve ORB into a pluggable broker with transport adapters:
  - local in-process adapter
  - websocket adapter
  - HTTP adapter
  - MCP server bridge adapter
- [ ] Enforce this lifecycle for every descriptor operation:
  - discover
  - bind
  - authorize
  - invoke
  - stream
  - recover
- [ ] Add per-operation policy hooks:
  - authorization
  - rate limits
  - retries
  - circuit breaking
  - idempotency
- [ ] Add structured invocation receipts with `correlation_id`, `interface_cid`, operation name, policy decision, and output/provenance references.

## Phase 3: Template-Driven UI Generation

- [ ] Define template contracts and required descriptor capabilities:
  - dashboard
  - explorer
  - form-wizard
  - job-console
  - graph-viewer
- [ ] Add template selection policy:
  - interface type
  - operation input/output shape
  - stream profile
  - declared state model
- [ ] Generate commands, regions, forms, tables, and status widgets from operation schemas.
- [ ] Add policy-aware rendering that hides or disables prohibited actions and shows explicit denial reasons.
- [ ] Add descriptor-driven launch so desktop startup can resolve a generated app from live interface discovery instead of static descriptor arrays.

## Phase 4: Schema-to-Component Binding

- [ ] Introduce operation input/output schema descriptors for form and result renderer generation.
- [ ] Add field-level widgets:
  - CID picker
  - DID input
  - status badge
  - progress timeline
  - provenance panel
  - policy denial panel
- [ ] Keep strict escaping and sanitization for generated markup.
- [ ] Add typed validation for every generated control before ORB invocation.
- [ ] Add snapshot tests for generated controls from representative schemas.

## Phase 5: IPFS Integration Profile

- [ ] Map `ipfs_datasets_py` to dataset interfaces:
  - browse
  - get
  - index
  - pin
  - publish
  - sync/progress streams
- [ ] Map `ipfs_accelerate_py` to compute and inference interfaces:
  - hardware_profile
  - run_inference_job
  - job_status
  - telemetry streams
- [ ] Normalize payload contracts so dataset and compute services compose in one generated desktop workflow.
- [ ] Normalize event contracts so progress, job state, artifact publish, and audit lineage use the same event envelope.

## Phase 6: Cross-Service Composition

- [ ] Add declarative workflow graph descriptors:
  - step dependencies
  - shared state keys
  - rollback actions
  - compensation actions
- [ ] Enable generated apps that chain:
  - dataset selection
  - pin or publish
  - inference
  - artifact publish
- [ ] Surface `correlation_id` lineage and provenance in a built-in audit region.
- [ ] Add workflow graph validation before app publish.

## Phase 7: State, Events, And Replay

- [ ] Move generated apps toward deterministic event-sourced local state:
  - commands
  - events
  - projections
- [ ] Persist replay logs per app instance for debugging and restoration.
- [ ] Add stream generation guards.
- [ ] Add stale-handle prevention across reconnects.
- [ ] Add restore-from-replay tests for generated app sessions.

## Phase 8: Security And Trust Boundaries

- [ ] Enforce descriptor signing and verification.
- [ ] Add optional allowlists for interface publishers.
- [ ] Apply least-privilege permissions at operation/action level.
- [ ] Add policy-aware rendering for generated apps.
- [ ] Add descriptor trust status to app launch resolution.

## Phase 9: Developer Experience And Tooling

- [ ] Create descriptor authoring CLI:
  - lint
  - schema validate
  - compatibility check
  - scaffold templates
- [ ] Provide starter packs:
  - CRUD
  - stream dashboard
  - long-running job console
  - dataset-to-inference workflow
- [ ] Add a visual descriptor inspector for debugging generated UI mappings.
- [ ] Add docs that show how to publish a descriptor pack without custom app shell code.

## Phase 10: Testing And Quality Gates

- [ ] Contract tests:
  - descriptor schema
  - compatibility
  - template capability checks
- [ ] Integration tests:
  - ORB lifecycle against mocked MCP++ interfaces
  - IPFS dataset backend descriptors
  - IPFS accelerate backend descriptors
- [ ] End-to-end tests:
  - generated app launch
  - action invocation
  - stream updates
  - recovery paths
- [ ] Add CI gates so non-conforming descriptor packs cannot be published.

## Delivery Roadmap

- [ ] Phase 1, Foundation:
  - profile/spec
  - registry abstraction
  - ORB adapter contracts
  - validator hardening
- [ ] Phase 2, Generation:
  - template contracts
  - schema-driven forms/results
  - capability-based rendering
- [ ] Phase 3, IPFS packs:
  - descriptor packs for `ipfs_datasets_py`
  - descriptor packs for `ipfs_accelerate_py`
  - composed dataset-to-inference workflows
- [ ] Phase 4, Productionization:
  - signing and policy
  - observability
  - replay tooling
  - migration from hand-coded apps

## First Implementation Slice

- [x] Add SwissKnife MCP++ UI Profile types and conformance validator.
- [x] Add a publishing path that fails on non-conforming UI descriptors.
- [x] Add local MCP++ registry/discovery abstraction over `InterfaceRepository`.
- [x] Add template selection primitives for dashboard, explorer, form-wizard, job-console, and graph-viewer.
- [x] Add unit tests for conformance failure, conformance success, template selection, registry discovery, and compatibility fallback.
- [x] Add Codex todo queue adapter and daemon commands for status, next, claim, complete, dry-run, and execute.
- [x] Add static IPFS dataset and accelerate descriptor fixtures that validate without live services.
