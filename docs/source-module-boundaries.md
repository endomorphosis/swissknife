# Source Module Boundaries

`src/module-ownership.json` is the machine-readable ownership manifest for
top-level SwissKnife source modules. This document explains the same boundaries
for contributors and reviewers.

## Dependency Direction

Imports should generally move from later layers to earlier layers:

`entrypoints -> commands -> screens -> components -> hooks -> screens-browser -> components-browser -> hooks-browser -> services -> platform -> inference -> ai/models -> workers -> tasks -> storage -> utils -> shared`

`shared` is the lowest layer. It owns only cross-runtime contracts, constants,
events, types, and pure helpers. `entrypoints` is the highest layer. It owns
process startup and may compose host-only modules.

Allowed exceptions must be explicit in `src/module-ownership.json`. Browser
entrypoints may import only `browser-safe` or `universal` modules. Host-only,
terminal, filesystem, subprocess, native, Python, and Node SDK code must stay
behind host entrypoints or host adapters.

## Runtime Classifications

| Classification | Meaning |
| --- | --- |
| `browser-safe` | Safe for static import by browser bundles. |
| `host-only` | Uses or may use Node, process, filesystem, terminal, subprocess, native, or server-only APIs. |
| `host-ui` | Ink or terminal UI that runs on the host, not browser UI. |
| `split` | Contains both browser-safe and host-only code; browser imports need an explicit browser-safe entrypoint. |
| `universal` | Runtime-neutral types, constants, and pure helpers. |
| `unknown` | Not approved for new imports until reviewed. |

## Module Homes

| Module | Classification | Ownership | Public entrypoints |
| --- | --- | --- | --- |
| `commands` | `host-only` | CLI command definitions and command-specific orchestration. | `src/commands.ts`, `src/commands/*.ts`, `src/commands/*.tsx` |
| `entrypoints` | `host-only` | Executable host process roots. | `src/entrypoints/cli.tsx`, `src/entrypoints/mcp.ts` |
| `components` | `host-ui` | Reusable Ink terminal UI components. | `src/components/*.tsx`, `src/components/*/*.tsx` |
| `components-browser` | `browser-safe` | Browser-safe React components for web/runtime surfaces. | `src/components/browser/index.ts`, `src/components/browser/*.tsx` |
| `screens` | `host-ui` | Whole-screen Ink flows. | `src/screens/*.tsx` |
| `screens-browser` | `browser-safe` | Browser-safe full-screen React flows. | `src/screens/browser/index.ts`, `src/screens/browser/*.tsx` |
| `hooks` | `host-ui` | React and Ink hooks for terminal interaction. | `src/hooks/*.ts` |
| `hooks-browser` | `browser-safe` | Browser-safe React hooks for web/runtime surfaces. | `src/hooks/browser/index.ts`, `src/hooks/browser/*.ts` |
| `platform` | `split` | Browser and host runtime facades. | `src/platform/browser.ts`, `src/platform/host.ts` |
| `services` | `split` | Domain services, protocol adapters, MCP, logic, prover, telemetry, and integration facades. | `src/services/logic-public-api.ts`, `src/services/mcp/*.ts`, `src/services/provers/*.ts`, `src/services/zkp/*.ts`, `src/services/apps/*.ts` |
| `storage` | `split` | Storage providers, registries, virtual filesystem, cache, and IPFS integration. | `src/storage/backend.ts`, `src/storage/browser.ts`, `src/storage/host.ts`, `src/storage/provider.ts`, `src/storage/registry.ts`, `src/storage/service.ts`, `src/storage/storage-service.ts`, `src/storage/virtual-filesystem.ts` |
| `tasks` | `split` | Task graph, scheduling, decomposition, delegation, and coordination. | `src/tasks/manager.ts`, `src/tasks/registry.ts`, `src/tasks/scheduler.ts`, `src/tasks/graph/*.ts`, `src/tasks/scheduler/*.ts` |
| `workers` | `split` | Worker pool and execution isolation. | `src/workers/pool.ts`, `src/workers/worker-pool.ts`, `src/workers/worker-thread.ts` |
| `ai` | `split` | AI facade, agents, thinking graph, AI model wrappers, and AI tool execution. | `src/ai/service.ts`, `src/ai/types.ts`, `src/ai/models/index.ts`, `src/ai/agent/base-agent.ts`, `src/ai/thinking/*.ts` |
| `models` | `split` | Model registry, provider metadata, initialization, and execution services. | `src/models/registry.ts`, `src/models/providers.ts`, `src/models/init.ts`, `src/models/execution.ts` |
| `inference` | `split` | Higher-level inference engines and browser/server inference adapters. | `src/inference/graph-rag-database.ts`, `src/inference/swarm-inference.ts`, `src/inference/webnn-server.ts` |
| `shared` | `universal` | Cross-runtime contracts, constants, events, types, and pure shared helpers. | `src/shared/index.ts`, `src/shared/*/index.ts` |
| `utils` | `split` | Low-level utilities and adapters that do not own domain behavior. | `src/utils/array.ts`, `src/utils/browser.ts`, `src/utils/errors.ts`, `src/utils/json.ts`, `src/utils/log.ts`, `src/utils/logger.ts`, `src/utils/model.ts`, `src/utils/terminal.ts`, `src/utils/validate.ts` |

## Import Rules By Module

Host-only CLI code lives in `entrypoints`, `commands`, and host platform
facades. It may use Node process, filesystem, terminal, subprocess, and native
capabilities, but browser bundles must reach it only through protocol or
runtime adapters.

`commands` are host-only. They may compose domain services, storage, tasks,
workers, AI/model/inference APIs, terminal screens, terminal components, hooks,
shared contracts, and utilities. They must not import `entrypoints`.

`entrypoints` are host-only composition roots. They may import command, terminal
UI, service, storage, task, worker, AI, model, inference, shared, and utility
modules. Browser application roots live under `web/` and must not import
`src/entrypoints`.

`components`, `screens`, and `hooks` are terminal UI. They may import each other
according to their composition role, plus services, shared contracts, and
utilities. They must not import entrypoints or own storage/worker behavior.

Browser UI code under `src` is owned only by `components-browser`,
`screens-browser`, and `hooks-browser`. These modules may import browser-safe
platform facades, shared contracts, pure utilities, and each other according to
their composition role. They must not import host terminal UI, commands,
entrypoints, storage backends, or worker-thread entrypoints.

`services` may import AI, inference, model, storage, task, worker, shared, and
utility modules. Services must not import command or terminal UI modules. Any
service used by browser code must be browser-safe all the way down its static
import graph.

`platform` owns explicit runtime facades. Browser bundles may import
`src/platform/browser.ts` only. Node process, filesystem, subprocess, terminal,
CLI, MCP, and command-loading capabilities belong in `src/platform/host.ts` and
must be reached only from host entrypoints.

`storage` may import shared contracts, utilities, and service protocol clients
when storage is adapting to a service boundary such as MCP or IPFS. Filesystem
backends are host-only. Browser storage needs a browser-specific provider and
must not import filesystem backends. Browser imports should use
`src/storage/browser.ts`, which selects between IndexedDB, OPFS, Cache
Storage, or an injected IPFS transport and never imports Node `fs`, `path`, or
`process`. Host imports that need Node filesystem, path, or
process/config-driven storage should use `src/storage/host.ts`.

`tasks` should keep graph and scheduler primitives runtime-neutral. Task
managers may import AI and model interfaces, shared contracts, and utilities.
Execution that needs workers, subprocesses, or provider SDKs belongs behind a
host adapter.

`workers` may import tasks, shared contracts, and utilities. Current TypeScript
worker pool code uses Node `worker_threads`, so it is host-only for browser
purity purposes unless a browser-specific worker entrypoint is added.

`ai`, `models`, and `inference` own provider and inference abstractions. They
may import shared contracts, utilities, and the adjacent model/AI/inference
layers documented in the manifest. Process environment reads, provider SDKs,
server endpoints, and native acceleration are host-only unless wrapped by an
explicit browser-safe adapter.

`shared` may import only shared submodules. It must not depend on utilities or
domain modules.

`utils` may import shared contracts. Utilities must stay small and generic. If a
helper knows about commands, services, models, storage, tasks, UI, or workers,
move it to the owning module instead of growing `utils`.

## Choosing A Home For New Work

Put process startup in `entrypoints`. Put command parsing and command-specific
actions in `commands`. Put reusable terminal UI in `components`, whole terminal
flows in `screens`, and terminal React hooks in `hooks`. Put browser React
components in `components-browser`, browser screens in `screens-browser`, and
browser React hooks in `hooks-browser`.

Put protocol, MCP, prover, telemetry, and domain facades in `services`. Put
persistence abstractions and backends in `storage`. Put task graphs and
schedulers in `tasks`. Put execution isolation in `workers`.

Put model metadata and execution registry code in `models`. Put AI orchestration,
agents, thinking graphs, and AI tools in `ai`. Put graph RAG, swarm, WebNN, and
other inference engines in `inference`.

Use `shared` only for cross-runtime contracts and pure shared helpers. Use
`utils` only for generic low-level helpers. When in doubt, choose the most
specific owning module and expose a public entrypoint there.

## Validation

`npm run lint:source-modules` and `npm run audit:module-boundary` run
`scripts/audit-source-modules.mjs` with unknown-file and forbidden-import
failures enabled.

`npm run services:audit` is the stricter release-facing boundary gate. It adds
legacy compatibility shim and legacy root import-specifier failures, writes
`docs/service-boundary-audit.json`, and refreshes the module-boundary evidence
receipt recorded in `docs/release-evidence-freshness.md`.

Service-specific ownership and evidence maintenance are documented in
`src/services/MODULE_BOUNDARIES.md` and `docs/refactor-evidence-maintenance.md`.
