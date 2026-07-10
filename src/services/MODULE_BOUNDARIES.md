# Service Module Boundaries

This document is the human-readable service boundary contract for
`src/services`. The machine-readable source of truth is
`src/module-ownership.json`; the current generated audit evidence is
`docs/service-boundary-audit.json`.

## Current State

The legacy root-level service shims for MCP, IPFS, glasses, and app-surface
files have been moved into owned service submodules. New service work should
enter through an owned subdirectory or an explicitly documented service
entrypoint, not by adding compatibility files directly under `src/services`.

`npm run services:audit` currently enforces:

- no unknown source files covered by the ownership manifest
- no forbidden cross-module imports
- no legacy compatibility shims
- no import specifiers that resolve to legacy root service shims

The audit also reports repository-level root compatibility files outside
`src/services`. Those files are tracked by `src/module-ownership.json` and the
repository-wide boundary work, but they are not service shims.

## Owned Service Areas

| Area | Path | Manifest module | Runtime | Owner | Purpose |
| --- | --- | --- | --- | --- | --- |
| App surfaces | `src/services/apps` | `service-apps` | universal | `app-surface-runtime` | Application manifests, generated app state, capability policy contracts, all-tools app bindings, and release policy gates. |
| Glasses surfaces | `src/services/glasses` | `service-glasses` | split | `glasses-surface-runtime` | Meta glasses display, input, webapp, mobile ORB, and hardware-free replay adapters. |
| IPFS descriptors | `src/services/ipfs` | `service-ipfs` | split | `ipfs-descriptor-runtime` | IPFS MCP/UI descriptors, descriptor packs, ORB profiles, proof-cache integration, and browser/host IPFS service adapters. |
| MCP protocol | `src/services/mcp` | `service-mcp` | split | `mcp-protocol-runtime` | MCP/MCP++ protocol, transport, ORB routing, UI profile contracts, mediation, registry, and generated IDL descriptor logic. |
| Domain services | `src/services` | `services` | split | `domain-service-runtime` | Logic/prover services, telemetry, integration facades, and domain services that do not yet have a narrower service submodule. |

## Import Rules

Service code may import these top-level modules unless a narrower service
submodule overrides the rule in `src/module-ownership.json`:

- `ai`
- `inference`
- `models`
- `shared`
- `storage`
- `tasks`
- `utils`
- `workers`

Service code must not import:

- `commands`
- `entrypoints`
- `hooks`
- `screens`

The app, glasses, IPFS, and MCP service submodules are allowed to import
`services`, `shared`, and `utils`, with additional narrow allowances documented
in the manifest. They must not depend on CLI or terminal UI ownership.

## Browser And Host Runtime Rules

`src/services` is classified as `split`, so browser safety is an entrypoint
property, not a blanket guarantee for every file in the tree.

Browser-safe service files must not statically import Node process, filesystem,
subprocess, terminal, native binary, Python, Pyodide, or remote host bridge
dependencies. Browser-facing code should import only browser-safe service
entrypoints or data-only descriptors.

Cross-runtime service contracts that are shared by browser and host adapters
live under `src/shared/service-contracts`. Browser entrypoints may import those
contracts or explicit browser implementations, but must not import host
implementations for type reuse.

Host-only adapters belong behind explicit host entrypoints, host platform
facades, or clearly named host files. A host adapter must not be exported from a
browser-safe barrel.

## Public Entrypoints

The current manifest permits these service entrypoint patterns:

- `src/services/logic-public-api.ts`
- `src/services/browser-acceleration.ts`
- `src/services/mcp/*.ts`
- `src/services/provers/*.ts`
- `src/services/zkp/*.ts`
- `src/services/apps/*.ts`
- `src/services/glasses/*.ts`
- `src/services/integrations/*.ts`
- `src/services/ipfs/*.ts`

Private bridge, adapter, and wrapper files stay local to their owning service
area unless they are promoted into `publicEntrypoints` with a documented reason.

## Evidence And Maintenance

Run the service boundary gate after every service milestone:

```sh
npm run services:audit
```

That command writes or refreshes:

- `docs/service-boundary-audit.json`
- `docs/service-boundary-audit.fingerprint.json`
- `docs/release-evidence-freshness.json`
- `docs/release-evidence-freshness.md`

When a milestone changes service ownership, public entrypoints, or runtime
classification, update all of these together:

- `src/module-ownership.json`
- this file
- `docs/source-module-boundaries.md` if the top-level source contract changes
- `docs/refactor-evidence-maintenance.md` if evidence ownership or commands
  change
- `implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md`
  if task status, validation commands, or evidence links change

Do not manually edit generated JSON evidence to force a pass. Regenerate it
through the documented command so the release freshness receipts match the
current source tree.
