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
    "status": "done",
    "dependencies": [
      "MCPUI-002",
      "MCPUI-006"
    ],
    "target_files": [
      "src/services/mcp-orb-capability-router.ts",
      "test/mcp-plus-plus/mcp-orb-capability-router.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-orb-capability-router.ts",
      "npx -y tsx -e \"import { MCPCapabilityRouter } from './src/services/mcp-orb-capability-router.ts'; const router = new MCPCapabilityRouter(); if (!router.listAdapters().includes('mcp-server')) throw new Error('missing adapter'); console.log('orb contracts ok');\""
    ],
    "done_criteria": [
      "ORB adapter interface supports local, websocket, HTTP, and MCP server bridge transports.",
      "Broker lifecycle is modeled as discover, bind, authorize, invoke, stream, and recover.",
      "Invocation receipts include correlation_id, descriptor identity, operation, policy decision, and provenance references."
    ],
    "prompt": "Introduce a pluggable ORB capability router contract for MCP++ descriptor operations.",
    "updated": "2026-05-21T18:26:12Z"
  },
  {
    "id": "MCPUI-008",
    "title": "Implement local ORB adapter and lifecycle tests",
    "phase": "ORB Capability Router",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPUI-007"
    ],
    "target_files": [
      "src/services/mcp-orb-capability-router.ts",
      "test/mcp-plus-plus/mcp-orb-capability-router.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-orb-capability-router.ts",
      "npx -y tsx -e \"import { MCPCapabilityRouter } from './src/services/mcp-orb-capability-router.ts'; void (async () => { const router = new MCPCapabilityRouter(); try { await router.invoke({ handle: 'stale', input: {} }); throw new Error('expected stale handle rejection'); } catch (error) { if (!(error instanceof Error) || !error.message.includes('Unknown ORB binding handle')) throw error; } console.log('local orb lifecycle ok'); })();\""
    ],
    "done_criteria": [
      "Local adapter can bind descriptor operations to mocked handlers.",
      "Lifecycle tests cover successful invocation, stream subscription, recovery, and stale-handle rejection.",
      "Policy and receipt data are emitted for every operation."
    ],
    "prompt": "Build the first local ORB adapter and test the full descriptor operation lifecycle.",
    "updated": "2026-05-21T18:27:05Z"
  },
  {
    "id": "MCPUI-009",
    "title": "Add per-operation policy hooks",
    "phase": "ORB Capability Router",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPUI-007"
    ],
    "target_files": [
      "src/services/mcp-orb-capability-router.ts",
      "test/mcp-plus-plus/mcp-orb-capability-router.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-orb-capability-router.ts",
      "npx -y tsx -e \"import { MCPCapabilityRouter } from './src/services/mcp-orb-capability-router.ts'; const router = new MCPCapabilityRouter({ operation_policies: { browse: { rate_limit: { max_invocations: 1, window_ms: 60000 } } } }); if (!router.getOperationPolicy('browse')?.rate_limit) throw new Error('missing policy'); console.log('orb policy hooks ok');\""
    ],
    "done_criteria": [
      "Authorization, rate limit, retry, circuit breaker, and idempotency hooks can be configured per operation.",
      "Denied operations return explicit reasons usable by UI rendering.",
      "Policy hooks are covered by unit tests."
    ],
    "prompt": "Add operation-level policy hooks to the ORB lifecycle.",
    "updated": "2026-05-21T18:39:06Z"
  },
  {
    "id": "MCPUI-010",
    "title": "Define template contracts and capability validator",
    "phase": "Template-Driven UI Generation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPUI-006",
      "MCPUI-007"
    ],
    "target_files": [
      "src/services/mcp-ui-profile.ts",
      "test/mcp-plus-plus/mcp-ui-profile.test.ts",
      "src/services/mcp-ipfs-ui-descriptors.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts src/services/mcp-ipfs-ui-descriptors.ts",
      "npx -y tsx -e \"import { IPFS_MCP_UI_PROFILE_DESCRIPTORS } from './src/services/mcp-ipfs-ui-descriptors.ts'; import { validateMCPUIProfileDescriptor, selectTemplateForDescriptor } from './src/services/mcp-ui-profile.ts'; for (const descriptor of IPFS_MCP_UI_PROFILE_DESCRIPTORS) { const result = validateMCPUIProfileDescriptor(descriptor); if (!result.conformant) throw new Error(JSON.stringify(result.errors)); } console.log(IPFS_MCP_UI_PROFILE_DESCRIPTORS.map(selectTemplateForDescriptor).map(selection => selection.kind).join(','));\""
    ],
    "done_criteria": [
      "Dashboard, explorer, form-wizard, job-console, and graph-viewer templates declare required descriptor capabilities.",
      "Template selection uses interface type, operation shape, stream profile, and state model.",
      "Invalid template mappings fail conformance checks before publish."
    ],
    "prompt": "Make template contracts explicit and validate that descriptors provide the required capabilities.",
    "updated": "2026-05-21T18:29:43Z"
  },
  {
    "id": "MCPUI-011",
    "title": "Generate schema-driven controls and result renderers",
    "phase": "Schema-to-Component Binding",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPUI-010"
    ],
    "target_files": [
      "src/services/mcp-schema-ui-generator.ts",
      "test/mcp-plus-plus/mcp-schema-ui-generator.test.ts",
      "src/services/mcp-ipfs-ui-descriptors.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-schema-ui-generator.ts",
      "npx -y tsx -e \"import { generateSchemaDrivenUI } from './src/services/mcp-schema-ui-generator.ts'; import { ipfsDatasetsUIProfileDescriptor } from './src/services/mcp-ipfs-ui-descriptors.ts'; const ui = generateSchemaDrivenUI(ipfsDatasetsUIProfileDescriptor); if (!ui.widgets.some(widget => widget.widget === 'cid-picker')) throw new Error('missing cid picker'); if (!ui.widgets.some(widget => widget.widget === 'progress-timeline')) throw new Error('missing progress timeline'); console.log('schema ui generator ok');\""
    ],
    "done_criteria": [
      "Operation input schemas generate typed forms.",
      "Operation output schemas generate tables, cards, logs, and result renderers.",
      "CID picker, DID input, status badge, progress timeline, provenance panel, and policy denial panel widgets are available."
    ],
    "prompt": "Generate commands, forms, regions, result renderers, and field widgets from MCP++ operation schemas.",
    "updated": "2026-05-21T18:33:03Z"
  },
  {
    "id": "MCPUI-012",
    "title": "Resolve virtual desktop app launch from live discovery",
    "phase": "Template-Driven UI Generation",
    "priority": "P0",
    "status": "done",
    "dependencies": [
      "MCPUI-002",
      "MCPUI-010",
      "MCPUI-011"
    ],
    "target_files": [
      "web/js/main.js",
      "web/js/generated-app-launcher.js",
      "src/services/mcp-interface-registry.ts",
      "src/services/mcp-schema-ui-generator.ts"
    ],
    "validation": [
      "node --input-type=module --check < web/js/generated-app-launcher.js",
      "node --input-type=module --check < web/js/main.js",
      "npx -y tsx -e \"import { discoverGeneratedApps } from './web/js/generated-app-launcher.js'; import { ipfsDatasetsUIProfileDescriptor } from './src/services/mcp-ipfs-ui-descriptors.ts'; void (async () => { const registry = { list: async () => ['sha256:dataset'], get: async () => JSON.stringify(ipfsDatasetsUIProfileDescriptor), compat: async () => ({ compatible: true, reasons: [], requiresMissing: [], suggestedAlternatives: [] }) }; const apps = await discoverGeneratedApps(registry, { required_methods: ['browse', 'pin'] }); if (apps.length !== 1) throw new Error('generated app discovery failed'); console.log('generated app launch ok'); })();\""
    ],
    "done_criteria": [
      "Desktop startup can resolve generated apps from registry discovery instead of static descriptor arrays.",
      "Version negotiation and compatibility fallback are exercised during launch.",
      "Policy-aware rendering hides or disables prohibited actions with explicit denial reasons."
    ],
    "prompt": "Wire generated virtual desktop app launch to MCP++ live interface discovery.",
    "updated": "2026-05-21T18:36:29Z"
  },
  {
    "id": "MCPUI-013",
    "title": "Build ipfs_datasets_py descriptor pack",
    "phase": "IPFS Integration Profile",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPUI-006",
      "MCPUI-010",
      "MCPUI-011"
    ],
    "target_files": [
      "src/services/mcp-ipfs-datasets-descriptor-pack.ts",
      "src/services/mcp-ipfs-ui-descriptors.ts",
      "test/mcp-plus-plus/ipfs-datasets-descriptor-pack.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-ipfs-datasets-descriptor-pack.ts src/services/mcp-schema-ui-generator.ts",
      "npx -y tsx -e \"import { validateIPFSDatasetsDescriptorPack, ipfsDatasetsDescriptorPack } from './src/services/mcp-ipfs-datasets-descriptor-pack.ts'; const result = validateIPFSDatasetsDescriptorPack(); if (!result.valid) throw new Error(JSON.stringify(result.errors)); console.log(ipfsDatasetsDescriptorPack.required_surfaces.join(','));\""
    ],
    "done_criteria": [
      "Descriptor pack maps browse, get, index, pin, publish, sync, and progress stream surfaces.",
      "Payload and event contracts are normalized for composition with compute backends.",
      "Pack can be validated without starting a live ipfs_datasets_py service."
    ],
    "prompt": "Create the full MCP++ descriptor pack for ipfs_datasets_py dataset workflows.",
    "updated": "2026-05-21T19:00:01Z"
  },
  {
    "id": "MCPUI-014",
    "title": "Build ipfs_accelerate_py descriptor pack",
    "phase": "IPFS Integration Profile",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPUI-006",
      "MCPUI-010",
      "MCPUI-011"
    ],
    "target_files": [
      "src/services/mcp-ipfs-accelerate-descriptor-pack.ts",
      "src/services/mcp-ipfs-ui-descriptors.ts",
      "test/mcp-plus-plus/ipfs-accelerate-descriptor-pack.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-ipfs-accelerate-descriptor-pack.ts src/services/mcp-schema-ui-generator.ts",
      "npx -y tsx -e \"import { validateIPFSAccelerateDescriptorPack, ipfsAccelerateDescriptorPack } from './src/services/mcp-ipfs-accelerate-descriptor-pack.ts'; const result = validateIPFSAccelerateDescriptorPack(); if (!result.valid) throw new Error(JSON.stringify(result.errors)); console.log(ipfsAccelerateDescriptorPack.required_surfaces.join(','));\""
    ],
    "done_criteria": [
      "Descriptor pack maps hardware_profile, run_inference_job, job_status, and telemetry streams.",
      "Payload and event contracts are normalized for composition with dataset backends.",
      "Pack can be validated without starting a live ipfs_accelerate_py service."
    ],
    "prompt": "Create the full MCP++ descriptor pack for ipfs_accelerate_py compute and inference workflows.",
    "updated": "2026-05-21T19:04:17Z"
  },
  {
    "id": "MCPUI-015",
    "title": "Add declarative workflow graph and composition validation",
    "phase": "Cross-Service Composition",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPUI-013",
      "MCPUI-014"
    ],
    "target_files": [
      "src/services/mcp-ui-profile.ts",
      "src/services/mcp-ipfs-ui-descriptors.ts",
      "src/services/mcp-schema-ui-generator.ts",
      "test/mcp-plus-plus/mcp-ui-profile.test.ts",
      "test/mcp-plus-plus/ipfs-ui-descriptors.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-schema-ui-generator.ts src/services/mcp-ipfs-datasets-descriptor-pack.ts src/services/mcp-ipfs-accelerate-descriptor-pack.ts",
      "npx -y tsx -e \"import { IPFS_MCP_UI_PROFILE_DESCRIPTORS, ipfsDatasetInferenceWorkflowDescriptor } from './src/services/mcp-ipfs-ui-descriptors.ts'; import { validateMCPUIProfileDescriptor } from './src/services/mcp-ui-profile.ts'; import { generateSchemaDrivenUI } from './src/services/mcp-schema-ui-generator.ts'; for (const descriptor of IPFS_MCP_UI_PROFILE_DESCRIPTORS) { const result = validateMCPUIProfileDescriptor(descriptor); if (!result.conformant) throw new Error(descriptor.name + ': ' + JSON.stringify(result.errors)); } const generated = generateSchemaDrivenUI(ipfsDatasetInferenceWorkflowDescriptor); if (generated.workflow_graph?.steps.length !== 4) throw new Error('missing workflow graph'); console.log(generated.workflow_graph.id);\""
    ],
    "done_criteria": [
      "Descriptors can declare step dependencies, shared state keys, rollback actions, and compensation actions.",
      "Validation rejects missing operation references and incompatible shared state contracts.",
      "Dataset selection, pin or publish, inference, and artifact publish can be represented as one generated workflow."
    ],
    "prompt": "Add declarative cross-service workflow graph support to MCP++ UI Profile descriptors.",
    "updated": "2026-05-21T19:08:58Z"
  },
  {
    "id": "MCPUI-016",
    "title": "Add event-sourced generated app state and replay logs",
    "phase": "State, Events, And Replay",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPUI-007",
      "MCPUI-012"
    ],
    "target_files": [
      "src/services/mcp-generated-app-state.ts",
      "src/services/mcp-orb-capability-router.ts",
      "web/js/generated-app-launcher.js",
      "test/mcp-plus-plus/mcp-generated-app-state.test.ts",
      "test/mcp-plus-plus/mcp-orb-capability-router.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-idl.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-schema-ui-generator.ts src/services/mcp-orb-capability-router.ts src/services/mcp-generated-app-state.ts",
      "node --input-type=module --check < web/js/generated-app-launcher.js",
      "npx -y tsx -e \"import { GeneratedAppStateManager, MemoryGeneratedAppReplayStorage, restoreGeneratedAppState } from './src/services/mcp-generated-app-state.ts'; void (async () => { const storage = new MemoryGeneratedAppReplayStorage(); const manager = new GeneratedAppStateManager({ app_id: 'app', app_instance_id: 'instance', storage }); await manager.dispatchCommand({ operation: 'browse', input: {}, correlation_id: 'corr' }); await manager.startStream({ operation: 'sync_status', correlation_id: 'corr', binding_handle: 'h1', binding_generation: 0 }); await manager.recoverStream({ operation: 'sync_status', correlation_id: 'corr', binding_handle: 'h2', binding_generation: 1 }); const stale = await manager.recordStreamEvent({ operation: 'sync_status', correlation_id: 'corr', event: { correlation_id: 'corr', interface_cid: 'sha256:d', operation: 'sync_status', event: {}, binding_handle: 'h1', binding_generation: 0, received_at: new Date().toISOString() } }); const restored = await restoreGeneratedAppState({ app_id: 'app', app_instance_id: 'instance', storage }); if (stale.accepted || restored.getState().stale_stream_events.length !== 1) throw new Error('replay guard failed'); console.log(restored.getState().replay_event_count); })();\"",
      "npx -y tsx -e \"import { MCPCapabilityRouter, LocalORBTransportAdapter, createDefaultORBAdapters } from './src/services/mcp-orb-capability-router.ts'; import { ipfsDatasetsUIProfileDescriptor } from './src/services/mcp-ipfs-ui-descriptors.ts'; void (async () => { const descriptor = JSON.parse(JSON.stringify(ipfsDatasetsUIProfileDescriptor)); descriptor.services = descriptor.services.map(s => ({ ...s, transport: 'local' })); const local = new LocalORBTransportAdapter(); local.registerStreamHandler('sync_status', async function* ({ binding, context }) { yield { correlation_id: context.correlation_id, interface_cid: binding.interface_cid, operation: binding.operation.method, event: { progress: 0.5 }, received_at: new Date().toISOString() }; yield { correlation_id: context.correlation_id, interface_cid: binding.interface_cid, operation: binding.operation.method, event: { progress: 1 }, received_at: new Date().toISOString() }; }); const router = new MCPCapabilityRouter({ adapters: createDefaultORBAdapters(local) }); const binding = await router.bind({ descriptors: [{ cid: 'sha256:d', descriptor }], operation: 'sync_status' }); const sub = await router.stream(binding.handle, { correlation_id: 'corr', capabilities: ['dataset/read', 'dataset/progress'] }); const iterator = sub.events[Symbol.asyncIterator](); const first = await iterator.next(); await router.recover(binding.handle, { correlation_id: 'corr' }, 'reconnect'); const second = await iterator.next(); if (first.value.binding_generation !== 0 || router.getBinding(binding.handle)?.binding_generation !== 1 || !second.done) throw new Error('stream guard failed'); console.log('orb stream guard ok'); })();\""
    ],
    "done_criteria": [
      "Generated apps persist command, event, and projection replay logs per app instance.",
      "Restore-from-replay reconstructs deterministic local state.",
      "Stream generation guards and stale-handle prevention survive reconnects."
    ],
    "prompt": "Move generated app state toward deterministic event sourcing and replay.",
    "updated": "2026-05-21T19:14:42Z"
  },
  {
    "id": "MCPUI-017",
    "title": "Add descriptor signing, allowlists, and trust-aware rendering",
    "phase": "Security And Trust Boundaries",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPUI-009",
      "MCPUI-012"
    ],
    "target_files": [
      "src/services/mcp-descriptor-trust.ts",
      "src/services/mcp-interface-registry.ts",
      "src/services/mcp-ui-profile.ts",
      "web/js/generated-app-launcher.js",
      "test/mcp-plus-plus/mcp-descriptor-trust.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-idl.ts src/services/mcp-ui-profile.ts src/services/mcp-descriptor-trust.ts src/services/mcp-interface-registry.ts src/services/mcp-ipfs-ui-descriptors.ts",
      "node --input-type=module --check < web/js/generated-app-launcher.js",
      "npx -y tsx -e \"import { DIDKeystore } from './src/auth/did-keystore.ts'; import { signMCPUIProfileDescriptor, verifyMCPUIProfileDescriptorTrust } from './src/services/mcp-descriptor-trust.ts'; import { ipfsDatasetsUIProfileDescriptor } from './src/services/mcp-ipfs-ui-descriptors.ts'; const ks = new DIDKeystore(); const did = ks.generateKey(); const signed = signMCPUIProfileDescriptor(ipfsDatasetsUIProfileDescriptor, did, ks); const ok = verifyMCPUIProfileDescriptorTrust(signed, { require_signature: true, allowed_publishers: ['endomorphosis'], allowed_signers: [did] }); const bad = verifyMCPUIProfileDescriptorTrust({ ...signed, version: '9.9.9' }, { require_signature: true }); if (!ok.launch_allowed || bad.status !== 'invalid') throw new Error(JSON.stringify({ ok, bad })); console.log(ok.status);\"",
      "npx -y tsx -e \"import { DIDKeystore } from './src/auth/did-keystore.ts'; import { InterfaceRepository } from './src/services/mcp-idl.ts'; import { LocalMCPInterfaceRegistryBackend, MCPInterfaceDiscoveryRegistry } from './src/services/mcp-interface-registry.ts'; import { signMCPUIProfileDescriptor } from './src/services/mcp-descriptor-trust.ts'; import { ipfsDatasetsUIProfileDescriptor } from './src/services/mcp-ipfs-ui-descriptors.ts'; void (async () => { const ks = new DIDKeystore(); const did = ks.generateKey(); const registry = new MCPInterfaceDiscoveryRegistry(new LocalMCPInterfaceRegistryBackend(new InterfaceRepository())); registry.publish(ipfsDatasetsUIProfileDescriptor); const rejected = await registry.resolveForLaunch({ app_id: 'ipfs-datasets-workbench', trust_policy: { require_signature: true } }); const signed = signMCPUIProfileDescriptor({ ...ipfsDatasetsUIProfileDescriptor, version: '0.2.0' }, did, ks); registry.publish(signed); const accepted = await registry.resolveForLaunch({ app_id: 'ipfs-datasets-workbench', trust_policy: { require_signature: true, allowed_signers: [did] } }); if (rejected || accepted?.trust.status !== 'trusted') throw new Error('protected launch trust failed'); console.log(accepted.descriptor.version); })();\"",
      "npx -y tsx -e \"import { evaluateGeneratedAppTrust } from './web/js/generated-app-launcher.js'; const descriptor = { meta: { publisher: 'endomorphosis' }, trust: { signed_by: 'did:key:z1', canonical_cid: 'sha256:x' } }; const ok = evaluateGeneratedAppTrust(descriptor, { require_signature: true, allowed_publishers: ['endomorphosis'], allowed_signers: ['did:key:z1'] }); const denied = evaluateGeneratedAppTrust({ meta: { publisher: 'other' } }, { require_signature: true, allowed_publishers: ['endomorphosis'] }); if (!ok.launch_allowed || denied.launch_allowed) throw new Error('browser trust failed'); console.log(ok.status + '/' + denied.status);\""
    ],
    "done_criteria": [
      "Descriptor signing and verification are enforced for protected launch paths.",
      "Optional publisher allowlists are supported.",
      "Rendering surfaces trust status and least-privilege denial reasons."
    ],
    "prompt": "Implement descriptor trust boundaries and policy-aware generated UI behavior.",
    "updated": "2026-05-21T19:20:24Z"
  },
  {
    "id": "MCPUI-018",
    "title": "Create descriptor authoring CLI",
    "phase": "Developer Experience",
    "priority": "P2",
    "status": "done",
    "dependencies": [
      "MCPUI-010",
      "MCPUI-013",
      "MCPUI-014"
    ],
    "target_files": [
      "scripts/mcp-plus-plus/descriptor_cli.mjs",
      "docs/mcp-plus-plus/DESCRIPTOR_AUTHORING_CLI.md",
      "test/mcp-plus-plus/descriptor_cli_test.py"
    ],
    "validation": [
      "node --check scripts/mcp-plus-plus/descriptor_cli.mjs",
      "python3 -m unittest discover -s test/mcp-plus-plus -p 'descriptor_cli_test.py'",
      "tmpdir=$(mktemp -d); for pack in crud stream-dashboard job-console dataset-inference-workflow; do node scripts/mcp-plus-plus/descriptor_cli.mjs scaffold \"$pack\" \"$tmpdir/$pack.json\" --app-id \"$pack\" >/dev/null; node scripts/mcp-plus-plus/descriptor_cli.mjs validate \"$tmpdir/$pack.json\" >/dev/null || exit 1; done; rm -rf \"$tmpdir\"; echo starter packs validate"
    ],
    "done_criteria": [
      "CLI supports lint, schema validation, compatibility checks, and template scaffolding.",
      "Starter packs cover CRUD, stream dashboard, long-running job console, and dataset-to-inference workflow.",
      "Docs show publishing a descriptor pack without custom app shell code."
    ],
    "prompt": "Add descriptor authoring CLI and starter pack scaffolding.",
    "updated": "2026-05-21T19:25:29Z"
  },
  {
    "id": "MCPUI-019",
    "title": "Add visual descriptor inspector",
    "phase": "Developer Experience",
    "priority": "P2",
    "status": "done",
    "dependencies": [
      "MCPUI-011",
      "MCPUI-012"
    ],
    "target_files": [
      "src/services/mcp-descriptor-inspector.ts",
      "web/js/descriptor-inspector.js",
      "test/mcp-plus-plus/mcp-descriptor-inspector.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-idl.ts src/services/mcp-ui-profile.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-descriptor-inspector.ts",
      "node --input-type=module --check < web/js/descriptor-inspector.js",
      "npx -y tsx -e \"import { inspectMCPUIProfileDescriptor } from './src/services/mcp-descriptor-inspector.ts'; import { ipfsDatasetInferenceWorkflowDescriptor, ipfsDatasetsUIProfileDescriptor } from './src/services/mcp-ipfs-ui-descriptors.ts'; const dataset = inspectMCPUIProfileDescriptor(ipfsDatasetsUIProfileDescriptor); const workflow = inspectMCPUIProfileDescriptor(ipfsDatasetInferenceWorkflowDescriptor); if (!dataset.validation.conformant || dataset.template.kind !== 'explorer' || workflow.workflow_graph?.steps.length !== 4) throw new Error('inspector failed'); console.log(dataset.operations.length + '/' + workflow.template.kind);\"",
      "npx -y tsx -e \"import { renderDescriptorInspector } from './web/js/descriptor-inspector.js'; const html = renderDescriptorInspector({ name: 'bad', namespace: 'x', version: '0.1.0', meta: { profile: 'wrong' }, methods: [], services: [], data_contracts: { operations: [] }, permissions: { operations: {} }, state_model: { keys: [], events: [] }, ui: { primary_template: 'dashboard', templates: [] } }); if (!html.includes('data-section=\\\"validation\\\"') || !html.includes('meta.profile')) throw new Error('render failed'); console.log('descriptor inspector render ok');\""
    ],
    "done_criteria": [
      "Inspector visualizes descriptor sections, template mappings, operation schemas, permissions, and state events.",
      "Inspector explains why a descriptor maps to a chosen template.",
      "Inspector highlights validation failures with actionable messages."
    ],
    "prompt": "Build a visual descriptor inspector for debugging generated UI mappings.",
    "updated": "2026-05-21T19:28:01Z"
  },
  {
    "id": "MCPUI-020",
    "title": "Add generated app end-to-end quality gates",
    "phase": "Testing And Quality Gates",
    "priority": "P1",
    "status": "done",
    "dependencies": [
      "MCPUI-012",
      "MCPUI-013",
      "MCPUI-014"
    ],
    "target_files": [
      "src/services/mcp-generated-app-quality-gates.ts",
      "test/mcp-plus-plus/mcp-generated-app-quality-gates.test.ts",
      "test/e2e/generated-app-quality-gate.e2e.test.ts"
    ],
    "validation": [
      "npx -y -p typescript tsc --noEmit --ignoreConfig --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --typeRoots /usr/share/nodejs/@types --types node src/services/mcp-idl.ts src/services/mcp-ui-profile.ts src/services/mcp-interface-registry.ts src/services/mcp-ipfs-ui-descriptors.ts src/services/mcp-schema-ui-generator.ts src/services/mcp-orb-capability-router.ts src/services/mcp-generated-app-quality-gates.ts",
      "npx -y tsx -e \"import { runGeneratedAppQualityGate } from './src/services/mcp-generated-app-quality-gates.ts'; import { IPFS_MCP_UI_PROFILE_DESCRIPTORS } from './src/services/mcp-ipfs-ui-descriptors.ts'; void (async () => { const report = await runGeneratedAppQualityGate({ descriptors: IPFS_MCP_UI_PROFILE_DESCRIPTORS, app_id: 'ipfs-datasets-workbench', invoke_operation: 'browse', stream_operation: 'sync_status' }); if (report.invocation.denied || !report.denial.denied || !report.stream?.recovered) throw new Error('quality gate failed'); console.log(report.generated_ui.app_id + ':' + report.stream.binding_generation); })();\"",
      "npx -y tsx -e \"import { validateDescriptorSet } from './src/services/mcp-generated-app-quality-gates.ts'; import { ipfsDatasetsUIProfileDescriptor } from './src/services/mcp-ipfs-ui-descriptors.ts'; const invalid = JSON.parse(JSON.stringify(ipfsDatasetsUIProfileDescriptor)); delete invalid.meta; try { validateDescriptorSet([invalid]); throw new Error('expected rejection'); } catch (error) { if (!(error instanceof Error) || !error.message.includes('Descriptor quality gate failed')) throw error; } console.log('quality gate rejects invalid descriptors');\""
    ],
    "done_criteria": [
      "End-to-end tests launch generated apps from descriptors.",
      "Tests cover action invocation, stream updates, recovery, and policy denial paths.",
      "CI gates reject non-conforming descriptor packs."
    ],
    "prompt": "Add quality gates for descriptor-driven generated virtual desktop apps.",
    "updated": "2026-05-21T19:23:02Z"
  },
  {
    "id": "MCPUI-021",
    "title": "Bridge todo daemon to ipfs_datasets_py MCP++ task queue backend",
    "phase": "Developer Experience",
    "priority": "P2",
    "status": "done",
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
      "python3 -m unittest discover -s test/mcp-plus-plus -p 'todo_daemon_test.py'",
      "python3 scripts/mcp-plus-plus/todo_daemon.py backend-status",
      "python3 scripts/mcp-plus-plus/todo_daemon.py backend-sync"
    ],
    "done_criteria": [
      "Daemon can detect an available ipfs_datasets_py MCP++ task queue backend.",
      "Markdown queue items can be mirrored into the backend with stable task IDs and dependency metadata.",
      "Claim, complete, fail, and retry state stays consistent between local markdown and the backend.",
      "Local markdown/state mode remains the fallback when the backend is unavailable."
    ],
    "prompt": "Add an optional backend bridge from the SwissKnife todo daemon to the ipfs_datasets_py MCP++ task queue once the backend API is available.",
    "updated": "2026-05-21T19:31:00Z"
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
