# Services Module Boundaries

This document defines the target structure for `src/services`. Behavior is
contained in bounded modules; the root of `src/services` is reserved for this
boundary policy and the machine-readable ownership manifest.

## Goals

- Keep work contained inside explicit service modules.
- Make browser-safe code distinguishable from Node/host adapters.
- Stop new root-level service files from accumulating.
- Keep public and internal imports pointed at module-owned paths.
- Give CI a machine-readable boundary policy through `module-ownership.json`.

## Target Layout

```text
src/services/
  shared/
  platform/
  mcp/
  glasses/
  ipfs/
  apps/
  logic/
    api/
    shared/
    nl/
    fol/
    tdfol/
    dcec/
    cec/
    deontic/
    modal/
    bridges/
  provers/
  zkp/
  proof-engine/
  integrations/
```

## Module Intent

| Module | Owns |
|---|---|
| `shared` | Browser-safe primitives: hashes, ids, encoding, errors, small config contracts. |
| `platform` | Runtime adapters: provider clients, telemetry, resource pools, hardware/browser acceleration, feature detection, with `browser.ts` for browser-safe utilities and `host.ts` for Node/CLI adapters. |
| `mcp` | MCP protocol, registries, descriptors, transports, event DAG provenance, policy broker, generated UI state, with `browser.ts` for descriptor/envelope/schema/policy primitives and `host.ts` for transports, discovery, descriptor trust, and CLI wrappers. |
| `glasses` | Meta-glasses, orb, webapp, control-plane, widget, display/input/audio/camera adapters. |
| `ipfs` | IPFS interface descriptors, UI profiles, widgets, storage/cache integration points. |
| `apps` | Virtual desktop app manifests, app capability policies, app result envelopes, composite descriptors, and app capability gateway orchestration. |
| `logic.shared` | Common formula/proof domain types, analyzers, validation, shared NL/temporal helpers, and shared theorem metadata. |
| `logic.api` | Stable logic-layer facades, batch processing, public APIs, and end-to-end validation. |
| `logic.nl` | NL parsing, grammar, multilingual parsers, NL-to-policy/DCEC/TDFOL compilation. |
| `logic.fol` | FOL parsing, formatting, conversion, exports, symbolic FOL helpers. |
| `logic.tdfol` | TDFOL AST, parser, prover, temporal/deontic APIs, strategy, performance, optimization. |
| `logic.dcec` | DCEC core types, parser, grammar, prototypes, integration, DCEC errors. |
| `logic.cec` | CEC/Event Calculus rules, tableaux, fluents, context, proof cache, prover management. |
| `logic.deontic` | Deontic parser, legal norm IR, legal-text extraction, conflict detection, normative graph projection. |
| `logic.modal` | Modal codec/compiler/decompiler/tableaux, Kripke structures, KG bridge, synthesis, ambiguity logic. |
| `logic.bridges` | Cross-logic adapters and multiview graph projection. |
| `provers` | Concrete prover adapters and prover-facing serializers, with `browser.ts` for pure TS/WASM imports and `host.ts` for native process/filesystem wrappers. |
| `zkp` | ZKP statements, circuits, browser/native backends, UCAN bridge, on-chain bridge, artifacts, witness/key management, with `browser.ts` for browser-safe imports and `host.ts` for native/artifact wrappers. |
| `proof-engine` | Proof execution, proof trees, strategies, caches, explainers, dependency graphs. |
| `integrations` | Optional external wrappers: FLogic, ErgoAI, spaCy WASM, neurosymbolic services, and compatibility shims for migrated integrations. |

## Dependency Direction

- `shared` imports only `shared`.
- Browser code should import `src/services/platform/browser` for telemetry,
  resource, acceleration, security, and utility helpers. Server or CLI code may
  import `src/services/platform/host` or the compatibility `index.ts` barrel
  when provider SDKs, filesystem, process, or terminal adapters are required.
- `logic/*` imports `shared`, `logic.shared`, its own module, and explicitly
  allowed adjacent logic modules.
- `logic.modal` and `logic.tdfol` may depend on each other for modal tableaux
  over TDFOL formulas and TDFOL prover fallback strategies. TDFOL bridge code
  may depend on proof-engine bridge contracts.
- `mcp` can orchestrate logic, provers, and ZKP. Logic modules must not import
  `mcp`. Browser code should import `src/services/mcp/browser`; native
  CLI/server code may import `src/services/mcp/host` or the compatibility
  `index.ts` barrel.
- `glasses` can use MCP descriptors and IPFS profiles. MCP core should not
  import glasses implementations.
- `apps` can use MCP descriptors, glasses profiles, and IPFS capability
  registries to describe app-level orchestration. Other modules should import
  it only when they are building app manifests, app coverage, or app capability
  plans.
- `zkp` can depend on `shared`, `logic.shared`, selected theorem modules, and
  `provers`. Browser ZKP entrypoints must not import Node-only backends; browser
  code should import `src/services/zkp/browser`, while CLI/server code may use
  `src/services/zkp/host` or the compatibility `index.ts` barrel.
- `provers` owns solver adapters. Policy translation and theorem semantics
  should live under `logic/*`. Browser code should import
  `src/services/provers/browser`; native CLI/server code may import
  `src/services/provers/host` or the compatibility `index.ts` barrel.
- MCP control-surface mediation belongs to `mcp`; glasses modules may re-export
  or consume its structural contracts for device-specific adapters.

## Migration Rules

1. Add a module barrel before moving implementation files.
2. Move files with `git mv` in small batches.
3. Convert internal imports to module-local relative imports or `@/services/...`
   aliases after the move.
4. Remove compatibility shims only after tests and downstream imports are moved.
5. Update `module-ownership.json` in the same change as any new service file.

## Suggested Batch Order

1. `platform`, `ipfs`, and descriptor-only files.
2. `glasses` control-plane and adapter files.
3. `logic.fol`, `logic.nl`, and language parsers.
4. `logic.deontic` and deontic bridge helpers.
5. `logic.modal`.
6. `logic.tdfol`, `logic.cec`, and `logic.dcec`.
7. `logic.bridges`.
8. `zkp`, `provers`, and `proof-engine`.
9. `integrations`.

## Audit

Run:

```bash
npm run services:audit
```

The audit reports root-file debt, legacy root import specifiers, module
classification, unknown files, and cross-module imports. The npm script is
strict by default and fails on root-file debt, legacy root imports, unknown
files, and forbidden cross-module imports. To inspect the report without the
npm script defaults, run:

```bash
node scripts/audit-services-modules.mjs
```

Current baseline after removing root service compatibility shims, migrating the
old `bridge`, `deontic`, `fol`, and `fol-utils` namespace folders into
module-owned paths, relocating and behavior-renaming the remaining numbered
implementation bundles, collapsing the remaining FOL `utils` namespace, moving
TDFOL/DCEC formula types, policy translators, and domain processors into
logic-owned modules, retargeting downstream imports, reconciling the strict
dependency manifest, promoting browser-safe crypto primitives into `shared`,
moving MCP EventDAG provenance into `mcp`, and adding an audit gate for active
root-level service import specifiers, then adding explicit browser-safe and
host-native MCP/platform/prover/ZKP entrypoints, replacing deterministic
logic/IPFS/proof hash helpers with shared browser-safe crypto, and moving
MCP envelope/IDL content addressing onto browser-safe bytes, then promoting
browser-safe MCP libp2p defaults and event emitters
on `2026-07-07`:

| Metric | Count |
|---|---:|
| Service files | 406 |
| Root-level service files | 0 |
| Root compatibility shims | 0 |
| Root implementation files | 0 |
| Legacy root files | 0 |
| Legacy path files | 0 |
| Unknown files | 0 |
| Import edges | 994 |
| Forbidden cross-module imports | 0 |
| Legacy root import specifiers | 0 |

The final acceptance target is satisfied for root files: only
`MODULE_BOUNDARIES.md` and `module-ownership.json` remain directly under
`src/services`. The legacy module and legacy path exception counts are also
zero; new implementation files should be assigned to an explicit non-legacy
owner.
