# Services Module Boundaries

This document defines the target structure for `src/services`. The current tree
contains a large flat service namespace; the refactor should move behavior into
bounded modules without changing public behavior in one large step.

## Goals

- Keep work contained inside explicit service modules.
- Make browser-safe code distinguishable from Node/host adapters.
- Stop new root-level service files from accumulating.
- Move files in batches while keeping compatibility re-export shims available.
- Give CI a machine-readable boundary policy through `module-ownership.json`.

## Target Layout

```text
src/services/
  index.ts
  shared/
  platform/
  mcp/
  glasses/
  ipfs/
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
  legacy/
```

## Module Intent

| Module | Owns |
|---|---|
| `shared` | Browser-safe primitives: hashes, ids, encoding, errors, small config contracts. |
| `platform` | Runtime adapters: provider clients, telemetry, resource pools, hardware/browser acceleration, feature detection. |
| `mcp` | MCP protocol, registries, descriptors, transports, policy broker, generated UI state. |
| `glasses` | Meta-glasses, orb, webapp, control-plane, widget, display/input/audio/camera adapters. |
| `ipfs` | IPFS interface descriptors, UI profiles, widgets, storage/cache integration points. |
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
| `provers` | Concrete prover adapters and prover-facing serializers. |
| `zkp` | ZKP statements, circuits, browser/native backends, UCAN bridge, on-chain bridge, artifacts, witness/key management. |
| `proof-engine` | Proof execution, proof trees, strategies, caches, explainers, dependency graphs. |
| `integrations` | Optional external wrappers: FLogic, ErgoAI, spaCy WASM, neurosymbolic services, and compatibility shims for migrated integrations. |
| `legacy` | Temporary holding area for sprint bundles and unclassified modules during migration. |

## Dependency Direction

- `shared` imports only `shared`.
- `logic/*` imports `shared`, `logic.shared`, its own module, and explicitly
  allowed adjacent logic modules.
- `logic.modal` and `logic.tdfol` may depend on each other for modal tableaux
  over TDFOL formulas and TDFOL prover fallback strategies. TDFOL bridge code
  may depend on proof-engine bridge contracts.
- `mcp` can orchestrate logic, provers, and ZKP. Logic modules must not import
  `mcp`.
- `glasses` can use MCP descriptors and IPFS profiles. MCP core should not
  import glasses implementations.
- `zkp` can depend on `shared`, `logic.shared`, selected theorem modules, and
  `provers`. Browser ZKP entrypoints must not import Node-only backends.
- `provers` owns solver adapters. Policy translation and theorem semantics
  should live under `logic/*`.
- MCP control-surface mediation belongs to `mcp`; glasses modules may re-export
  or consume its structural contracts for device-specific adapters.
- `legacy` is temporary; new code must not be added there without a migration
  ticket.

## Migration Rules

1. Add a module barrel before moving implementation files.
2. Move files with `git mv` in small batches.
3. Leave root-level compatibility shims for public imports:

   ```ts
   export * from './logic/deontic/deontic-formula-builder.js';
   ```

4. Convert internal imports to module-local relative imports or `@/services/...`
   aliases after the move.
5. Remove compatibility shims only after tests and downstream imports are moved.
6. Update `module-ownership.json` in the same change as any new service file.

## Suggested Batch Order

1. `platform`, `ipfs`, and descriptor-only files.
2. `glasses` control-plane and adapter files.
3. `logic.fol`, `logic.nl`, and language parsers.
4. `logic.deontic` and deontic bridge helpers.
5. `logic.modal`.
6. `logic.tdfol`, `logic.cec`, and `logic.dcec`.
7. `logic.bridges`.
8. `zkp`, `provers`, and `proof-engine`.
9. `integrations` and remaining `legacy` files.

## Audit

Run:

```bash
npm run services:audit
```

The audit reports root-file debt, module classification, unknown files, and
cross-module imports. By default it is report-only because the current tree is
known to be transitional. Tighten it progressively with:

```bash
node scripts/audit-services-modules.mjs --fail-on-unknown --fail-on-forbidden
```

Current baseline after the initial IPFS, platform, integrations, proof-engine,
`logic.nl`, legacy sprint-bundle, FOL, bridge-core, DCEC, CEC/Event Calculus,
deontic, modal, TDFOL, root prover, ZKP, and glasses/control-plane
implementation moves, plus MCP, `logic.shared`, final root implementation
containment, EventDAG, shared bridge-type moves, `logic.api`, MCP policy
deontic ownership, shared NL/temporal helper moves, MCP control-surface
ownership, strict dependency manifest reconciliation, Phase 1 root shim
pruning, CEC/platform test-import retargeting, and
NL/shared/modal/proof-engine plus MCP/glasses/legacy sprint/deontic/FOL
test-import retargeting on
`2026-07-06`:

| Metric | Count |
|---|---:|
| Service files | 486 |
| Root-level service files | 120 |
| Root compatibility shims | 120 |
| Root implementation files | 0 |
| Legacy root files | 120 |
| Legacy path files | 26 |
| Unknown files | 0 |
| Import edges | 865 |
| Forbidden cross-module imports | 0 |

The final acceptance target is fewer than 20 files directly under
`src/services`, no unknown service files, and no forbidden cross-module imports.
