# Service Module Boundaries

This document is the human-readable service boundary contract for
`src/services`. The machine-readable source of truth is
`src/module-ownership.json`; the current generated audit evidence is
`docs/service-boundary-audit.json`.

## Current State

Restored root and sibling shadow implementations have been removed. Logic,
deontic, FOL, DCEC, TDFOL, prover, proof-engine, MCP, browser-runtime, and ZKP
work now lives in its named owning family. New service work should enter
through an owned subdirectory or an explicitly documented service entrypoint,
not by adding compatibility files directly under `src/services`.

`npm run services:audit` currently enforces:

- no unknown source files covered by the ownership manifest
- no forbidden cross-module imports
- no legacy compatibility shims
- no import specifiers that resolve to legacy root service shims
- no unclassified basename, normalized-content, or behavioral-equivalence collisions
- no executable service index shadows

The audit also reports repository-level root compatibility files outside
`src/services`. Those files are tracked by `src/module-ownership.json` and the
repository-wide boundary work, but they are not service shims.

## Owned Service Areas

| Area | Path | Manifest module | Runtime | Owner | Purpose |
| --- | --- | --- | --- | --- | --- |
| App surfaces | `src/services/apps` | `service-apps` | universal | `app-surface-runtime` | Application manifests, generated app state, capability policy contracts, all-tools app bindings, and release policy gates. |
| Glasses surfaces | `src/services/glasses` | `service-glasses` | split | `glasses-surface-runtime` | Meta glasses display, input, webapp, mobile ORB, and hardware-free replay adapters. |
| External integrations | `src/services/integrations` | `service-integrations` | split | `external-integration-service-runtime` | Browser and host integration adapters. |
| IPFS descriptors | `src/services/ipfs` | `service-ipfs` | split | `ipfs-descriptor-runtime` | IPFS MCP/UI descriptors, descriptor packs, ORB profiles, proof-cache integration, and browser/host IPFS service adapters. |
| Logic families | `src/services/logic` | `service-logic` | split | `logic-service-runtime` | Canonical CEC, DCEC, deontic, FOL, modal, natural-language, TDFOL, bridge, and shared logic implementations. |
| MCP protocol | `src/services/mcp` | `service-mcp` | split | `mcp-protocol-runtime` | MCP/MCP++ protocol, transport, ORB routing, UI profile contracts, mediation, registry, and generated IDL descriptor logic. |
| Platform services | `src/services/platform` | `service-platform` | split | `platform-service-runtime` | Platform notification, telemetry, browser acceleration, and host integrations. |
| Proof engine | `src/services/proof-engine` | `service-proof-engine` | split | `proof-engine-service-runtime` | Proof execution, routing, caching, explanation, and browser proof facade. |
| Provers | `src/services/provers` | `service-provers` | split | `prover-service-runtime` | Native, WASM, neural, and bounded browser prover adapters. |
| Shared services | `src/services/shared` | `service-shared` | universal | `shared-service-runtime` | Runtime-neutral service helpers and browser crypto. |
| ZKP | `src/services/zkp` | `service-zkp` | split | `zkp-service-runtime` | ZKP backends, browser adapters, artifact ownership, and Ethereum bridge. |
| Domain services | `src/services` | `services` | split | `domain-service-runtime` | Exceptional standalone service implementations explicitly listed in the ownership manifest. |

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

The exact entrypoints and all removed-path migrations are generated in
`docs/service-module-public-api.md`. Private implementation paths stay local to
their owning service area unless promoted into `publicEntrypoints` in
`src/module-ownership.json`. Cross-family consumers use those declared APIs;
compatibility barrels may contain exports only and may not recreate deleted
behavior.

## Evidence And Maintenance

Run the service boundary gate after every service milestone:

```sh
npm run services:audit
```

That command writes or refreshes:

- `docs/service-boundary-audit.json`
- `docs/restored-service-duplicate-inventory.json`
- `docs/restored-service-duplicate-inventory.md`
- `docs/service-module-public-api.md`
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
