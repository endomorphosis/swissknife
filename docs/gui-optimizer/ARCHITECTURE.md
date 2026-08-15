# Verified GUI Optimizer — SwissKnife observation architecture

**Status:** Current
**Audience:** Developers and agents adapting one additional screen, or
tracing Agent Supervisor evaluation
**Scope:** SwissKnife observation, evaluation, and target-adapter surfaces for
VerifiedGuiOptimizer (`VerifiedGuiOptimizerArchitecture@1`)
**Non-goals:** Optimizing every SwissKnife application; aesthetic optimality;
WCAG certification; complete security proof; importing prior semantic-index,
semantic-capsule, proof-cache, formal-verification-cache, or model-routing
packages
**Interfaces:** `VerifiedGuiOptimizerArchitecture@1`, `GuiApplicationAdapter@1`,
`GuiEvidenceAuthorityMatrix@1`
**Selected screen:** Agent Supervisor console
**Application / screen / route IDs:** `app:agent-supervisor`,
`screen:agent-supervisor`, `route:agent-supervisor`
**Primary source:** `swissknife/web/js/apps/agent-supervisor.js`
**Companion contracts:**
`external/ipfs_datasets/docs/gui_optimizer_contracts.md`,
`external/ipfs_accelerate/docs/architecture/VERIFIED_GUI_OPTIMIZER.md`

This guide describes the checked-in SwissKnife observation layer. Wire models
and formal receipts live in `ipfs_datasets_py.logic.gui_optimizer`. Isolated
execution, patch gates, and `gui-opt` live in
`ipfs_accelerate_py.agent_supervisor.gui_optimizer`.

## 1. Purpose and selected screen

VerifiedGuiOptimizer incrementally analyzes and improves **one bounded
screen** against declared interaction, accessibility, policy, and
visual-regression criteria. The selected end-to-end target is the SwissKnife
**Agent Supervisor** console implemented by
`swissknife/web/js/apps/agent-supervisor.js`.

The architecture is reusable. No task may expand into optimizing every
application. Adding another screen requires the exact adapter additions in
[§8 Application-extension checklist](#8-application-extension-checklist).

The required completion statement is only:

> The selected GUI workflow was incrementally analyzed and improved against
> declared interaction, accessibility, policy, and visual-regression criteria,
> with content-addressed evidence for the evaluated scenarios.

The GUI is not proved optimal.

## 2. Implementation boundaries

| Layer | Owns | Does not own |
| --- | --- | --- |
| `ipfs_datasets_py.logic.gui_optimizer` | Closed wire models, canonical identity, bounded formal adapter, invariant engine, receipt aggregation | Scanning, live DOM, patches, CLI |
| `swissknife/src/services/gui-optimizer` | Non-executing static scan, graph, capsules, state, scenarios, live accessibility / visual / interaction, context packs, target adapters | Host authorization, worktree mutation, model routing |
| `ipfs_accelerate_py.agent_supervisor.gui_optimizer` | Security authority, patch scope, isolated worktrees, check plans, journaled loop, CLI, artifact store, benchmark catalog | UI parsing, WCAG certification |

Static analysis uses the TypeScript compiler API and bounded HTML/CSS
tokenizers. It never imports, evaluates, bundles, or executes arbitrary
repository source.

UI visibility and enabled state are not authorization. The host re-evaluates
action, arguments, policy freshness, and confirmation through
`swissknife/src/services/mcp/mcp-control-surface-mediator.ts` and
`swissknife/src/services/mcp/all-app-tool-gateway.ts`. Browser policy output
is never authoritative.

## 3. Current modules and interfaces

Current SwissKnife modules under `swissknife/src/services/gui-optimizer/`:

| Module | Interfaces |
| --- | --- |
| `models.ts` | `GuiStaticScanner@1`, `GuiSourceFinding@1`, `GuiExtractionConfidence@1`, shared VGO-001 wire types |
| `scanner.ts` | `GuiStaticScanner@1` extraction |
| `identity.ts` | `GuiCanonicalIdentity@1`, `TypeScriptGuiCanonicalIdentity@1`, `GuiArtifactDigest@1`, `UiComponentVersionCompiler@1` |
| `component-graph.ts` | `UiComponentGraph@1` |
| `ui-capsule.ts` | `UiSemanticCapsule@1`, `UiCapsuleCompiler@1` |
| `state-machine.ts` | `UiStateMachine@1`, `UiStateDefinition@1`, `UiEventDefinition@1`, `UiTransitionDefinition@1` |
| `scenario-catalog.ts` | `DeterministicScenarioCatalog@1`, `UiEvaluationScenario@1`, `ViewportSpec@1` |
| `policy-validator.ts` | `UiActionBinding@1`, `UiConfirmationBinding@1`, `UiPolicyBindingValidator@1` |
| `invalidation.ts` | `UiChangeSet@1`, `UiInvalidationPlan@1`, `UiInvalidationPlanner@1` |
| `context-pack.ts` | `UiContextPack@1`, `BuildGuiContextPack@1` |
| `accessibility.ts` | `UiAccessibilityEvaluator@1`, `AccessibilityReceipt@1`, `KeyboardEvaluation@1` |
| `visual-regression.ts` | `VisualRegressionEvaluator@1`, `VisualRegressionReceipt@1` |
| `interaction-runner.ts` | `UiInteractionRunner@1`, `InteractionReceipt@1` |
| `baseline.ts` | `UiBaseline@1`, `UiBaselineCompiler@1` |
| `evaluator.ts` | `GuiObjectiveEvaluator@1` |
| `cli.ts` | `GuiOptimizerTypeScriptCliBridge@1`, `gui-opt scan@1`, `gui-opt baseline@1`, `gui-opt impact@1`, `gui-opt evaluate@1`, `gui-opt pack-context@1`, `gui-opt verify@1`, `gui-opt improve@1`, `gui-opt report@1` |
| `targets/agent-supervisor.ts` | `AgentSupervisorTarget@1`, `UiSemanticBaseline@1`, the current `GuiApplicationAdapter@1` |

Supporting SwissKnife surfaces (interoperability inputs, not GUI scanners):

- Canonical inventory: `swissknife/src/services/apps/virtual-desktop-app-manifest.ts`
- Runtime registration projection: `swissknife/web/js/main-simple.js`
- Action authority: `swissknife/src/services/apps/all-app-executable-backend-contract.ts`,
  `swissknife/src/services/apps/all-app-live-tool-bindings.ts`
- Capability / deontic presentation: `swissknife/src/services/apps/app-capability-policy.ts`,
  `swissknife/src/services/apps/mcp-deontic-ui-manifest.ts`
- Device projection: `swissknife/src/services/mcp/mcp-deontic-interface-broker.ts`
- UI/UX IR wire codec: `swissknife/src/services/mcp/ui-ux-ir-codec.ts` (schema
  `ui-ux-ir/v1`) — interoperability only

Tests that bind these modules:

- `swissknife/test/unit/services/gui-optimizer/scanner.test.ts`
- `swissknife/test/unit/services/gui-optimizer/component-graph.test.ts`
- `swissknife/test/unit/services/gui-optimizer/ui-capsule.test.ts`
- `swissknife/test/unit/services/gui-optimizer/state-machine.test.ts`
- `swissknife/test/unit/services/gui-optimizer/scenario-catalog.test.ts`
- `swissknife/test/unit/services/gui-optimizer/policy-validator.test.ts`
- `swissknife/test/unit/services/gui-optimizer/invalidation.test.ts`
- `swissknife/test/unit/services/gui-optimizer/context-pack.test.ts`
- `swissknife/test/unit/services/gui-optimizer/accessibility.test.ts`
- `swissknife/test/unit/services/gui-optimizer/visual-regression.test.ts`
- `swissknife/test/unit/services/gui-optimizer/interaction-runner.test.ts`
- `swissknife/test/unit/services/gui-optimizer/evaluator.test.ts`
- `swissknife/test/unit/services/gui-optimizer/identity.test.ts`
- `swissknife/test/unit/services/gui-optimizer/identity-vectors.test.ts`
- `swissknife/test/unit/services/gui-optimizer/agent-supervisor-fixtures.test.ts`
- `swissknife/test/unit/services/gui-optimizer/agent-supervisor-baseline.test.ts`
- `swissknife/test/browser/verified-gui-optimizer-agent-supervisor-boundary.test.ts`
- `swissknife/test/e2e/verified-gui-optimizer-agent-supervisor-baseline.spec.ts`
- `swissknife/test/e2e/verified-gui-optimizer-agent-supervisor-regression.spec.ts`
- `swissknife/build-tools/configs/playwright.verified-gui-optimizer.config.ts`

## 4. Static analysis, graph, and state

`scanGuiSources` in `scanner.ts` extracts bounded React/TSX/JSX, standalone
HTML/CSS, templates, props, state, events, accessibility, style, responsive,
localization, action, and host-boundary facts with spans and confidence.

Every typed edge carries source/target stable identity, relation, span,
extraction method, extractor version, and one of `exact`, `conservative`,
`heuristic`, or `opaque`. Required relations include `renders`, `contains`,
`routes_to`, `opens_dialog`, `closes_dialog`, `updates_state`, `reads_state`,
`submits`, `validates`, `invokes_action`, `requires_confirmation`,
`depends_on_policy`, `depends_on_schema`, `styled_by`, `uses_design_token`,
`localized_by`, `tested_by`, `screenshot_by`, `responsive_variant_of`, and
`device_projection_of`.

Dynamic HTML, imperative DOM, uncontrolled delegation, dynamically loaded
styles, remote or unknown widgets, computed actions, unresolved globals, and
runtime-generated forms downgrade classification and record the unresolved
cause. Opaque regions that intersect a required invariant block automatic
acceptance.

`UiSemanticCapsule@1` is a new, closed GUI-specific record built from source
evidence. It is not the excluded prior semantic-capsule package.

`extractUiStateMachineFromScan` covers initial, loading, ready, empty,
success, failure, confirmation, disabled, offline/unavailable, terminal, and
recovery states where they are statically present.

## 5. Evaluation, invalidation, and context

The Agent Supervisor catalog
(`catalog:agent-supervisor-scenarios`) declares the sealed kinds in
`REQUIRED_SCENARIO_KINDS`: initial load, loading, success, empty, recoverable
and unrecoverable failure, invalid/valid submission, keyboard-only, mobile
(390x844), desktop (1280x800), wide (1600x1000), 200% text scale, reduced
motion, dark mode, service unavailable, confirmation grant, and confirmation
deny. Fixtures are inert and synthetic.

`planUiInvalidation` emits an explicit `UiInvalidationPlan@1`. Graph closure
stops at typed dependency boundaries. Missing, stale, conservative, or opaque
edges expand to a documented broader fallback rather than pretending
precision.

`build_gui_context_pack` / `context-pack.ts` emits `UiContextPack@1` with
exact editable raw source, exact relevant CSS or design tokens, exact
affected tests, unchanged parent/child capsules, the current state machine,
formal failures, accessibility observations, screenshot references, routes
and action bindings, metric baseline, acceptance criteria, exclusions, and
token accounting. Content identity proves integrity, not truth.

Live accessibility uses the first-party engine documented in
`ACCESSIBILITY_TOOLING_DECISION.md`. Automated success is not WCAG
certification. `wcag_compliance_claimed` and `wcag_certification_claimed`
remain `false`. Visual hierarchy, density, consistency, clarity, whitespace,
polish, and primary-action prominence are heuristic or human-reviewed.

## 6. Evidence authority matrix

`GuiEvidenceAuthorityMatrix@1` (analysis classification is independent from
verification status):

| Label | What it covers | Automatic acceptance |
| --- | --- | --- |
| Formally verified | A supported, exact bounded obligation discharged by `GuiFormalAdapter@1` / `UiInvariantEngine@1` with premises and tool versions bound in `UiConstraintReceipt@1` | Only when `verification_status` is `verified` **and** the obligation is in the closed property set |
| Structurally validated | Finite-graph structural conclusions (`structurally_valid`, evidence level `structural`) | Never automatic-acceptance authority by itself |
| Integrity valid | Canonical SHA-256 / CIDv1 match of retained bytes (`integrity_valid`) | Permitted only as integrity of already-classified evidence; a hash never upgrades a heuristic |
| Simulated | Fixture or synthetic screenshot / action (`simulated`) | Never treated as a live browser observation |
| Heuristic | Inferred visual or metric description (`heuristic`) | Never overrides accessibility, policy, confirmation, or security gates |
| Human-reviewed | Operator or designated reviewer judgment (`human_reviewed`) | Required for subjective hierarchy and for kinds in `ALWAYS_HUMAN_REVIEW_KINDS` |

Parser validation, content integrity, tests, screenshots, and heuristic
assessments retain their distinct labels. A receipt is an immutable evidence
record; verification is recomputed for the current source/scenario identity.

## 7. Commands

Fixed argument vectors (repository-relative, allowlisted):

```text
gui-opt scan agent-supervisor
gui-opt baseline agent-supervisor
gui-opt impact path-or-component
gui-opt evaluate agent-supervisor
gui-opt pack-context agent-supervisor --objective <objective>
gui-opt verify <worktree-or-patch-or-alias> [--receipt PATH] [--full]
gui-opt improve agent-supervisor --objective <objective> [--isolated]
gui-opt report <run-id-or-alias> [--require-complete] --verify-receipts
```

Targets resolve only through `TARGET_REGISTRY` in
`swissknife/src/services/gui-optimizer/cli.ts` and the Python twin
`ipfs_accelerate_py.agent_supervisor.gui_optimizer.cli.TARGET_REGISTRY`.
The sole registered application target is `agent-supervisor`. Observation
commands are non-effectful. `verify` / `improve` refuse canonical-tree
defaults.

## 8. Application-extension checklist

To adapt **one** additional application, add every item below. Do not reuse
the Agent Supervisor target, scenarios, or receipts as a silent substitute.

### Manifest

1. Add a verified application definition to
   `swissknife/src/services/apps/virtual-desktop-app-manifest.ts` with a
   stable `id`, `title`, `component`, `capabilities`, and
   `backend_capabilities`.
2. Add the matching runtime registration in
   `swissknife/web/js/main-simple.js` if the loader map is not derived solely
   from the manifest. Record any inventory/runtime divergence; do not silently
   pick one.

### Target (`GuiApplicationAdapter@1`)

3. Add `swissknife/src/services/gui-optimizer/targets/<app-id>.ts` implementing
   the same adapter shape as `targets/agent-supervisor.ts`
   (`AgentSupervisorTarget@1` / `UiSemanticBaseline@1`).
4. Register the target and component IDs in `TARGET_REGISTRY` and
   `COMPONENT_REGISTRY` in both:
   - `swissknife/src/services/gui-optimizer/cli.ts`
   - `external/ipfs_accelerate/ipfs_accelerate_py/agent_supervisor/gui_optimizer/cli.py`
5. Point `source_paths` at the live application source, never
   `web/legacy-archive`, `emergency-archive`, `cleanup-archive`, or
   `virtual-desktop-live-gateway.ts`.

### Scenario

6. Add a sealed catalog entry (or sibling catalog) in
   `swissknife/src/services/gui-optimizer/scenario-catalog.ts` covering the
   same required kinds in `REQUIRED_SCENARIO_KINDS` that apply to the screen.
7. Add `swissknife/test/fixtures/gui-optimizer/scenarios/<app-id>-scenarios.json`.
8. Add controlled fixtures:
   - `swissknife/test/fixtures/gui-optimizer/<app-id>/fixture-host.html`
   - `swissknife/test/fixtures/gui-optimizer/<app-id>/fixture-services.js`
   - `swissknife/test/fixtures/gui-optimizer/<app-id>/fixture-scenarios.json`

### Action and policy

9. Declare executable actions in
   `swissknife/src/services/apps/all-app-executable-backend-contract.ts`.
10. Bind live tools in
    `swissknife/src/services/apps/all-app-live-tool-bindings.ts`.
11. Add capability rows in
    `swissknife/src/services/apps/app-capability-policy.ts` and deontic
    presentation in
    `swissknife/src/services/apps/mcp-deontic-ui-manifest.ts`.
12. Emit `UiActionBinding@1` / `UiConfirmationBinding@1` records for every
    displayed action. Confirmation remains bound to the exact action and
    arguments. The host still re-evaluates through
    `mcp-control-surface-mediator.ts` and `all-app-tool-gateway.ts`.

### Tests, screenshots, and acceptance

13. Unit: `swissknife/test/unit/services/gui-optimizer/<app-id>-fixtures.test.ts`
    and `<app-id>-baseline.test.ts`.
14. Browser boundary:
    `swissknife/test/browser/verified-gui-optimizer-<app-id>-boundary.test.ts`.
15. Playwright baseline and regression (included by
    `swissknife/build-tools/configs/playwright.verified-gui-optimizer.config.ts`
    via `**/verified-gui-optimizer-*.spec.ts`):
    - `swissknife/test/e2e/verified-gui-optimizer-<app-id>-baseline.spec.ts`
    - `swissknife/test/e2e/verified-gui-optimizer-<app-id>-regression.spec.ts`
16. Screenshot artifacts go through `GuiEvidenceArtifactStore@1`; durable
    manifests live under
    `implementation_plan/evidence/verified_gui_optimizer/`. Synthetic PNGs
    must remain labeled `simulated`.
17. Every proposal must declare files, components, state and visual effects,
    tests, screenshots, and acceptance criteria. Hard gates: confirmation,
    policy freshness, critical accessibility, and patch scope. Required
    receipts: `VisualRegressionReceipt@1`, `AccessibilityReceipt@1`,
    `InteractionReceipt@1`, `UiConstraintReceipt@1`,
    `GuiImprovementReceipt@1`.

This documentation task does not implement a second application.

## 9. Exclusions and non-goals

Excluded as implementation dependencies (must not be imported or treated as
authority):

- prior semantic-index modules
- prior semantic-capsule modules (distinct from the new `UiSemanticCapsule@1`)
- proof-cache and formal-verification-cache modules
- model-routing / provider-routing modules
- the untracked datasets `ipfs_datasets_py/logic/ui_ux_ir` tree
- `swissknife/web/legacy-archive`, `emergency-archive`, `cleanup-archive`,
  `config/archive`, `test/archived`
- `virtual-desktop-live-gateway.ts` as authorization authority

Non-goals:

- proving beauty, emotional appeal, or aesthetic optimality
- complete WCAG certification or complete security proof
- global optimality of layout or interaction
- optimizing every SwissKnife application in this program
- treating content identities or receipts as proofs of truth
- executing arbitrary repository source during static analysis

## 10. Narrow final claim

The selected GUI workflow was incrementally analyzed and improved against declared interaction, accessibility, policy, and visual-regression criteria, with content-addressed evidence for the evaluated scenarios.

This document does not claim that the GUI is proved optimal, that
accessibility is WCAG-certified, or that security is complete.

## Diagrams tied to tests

```text
agent-supervisor.js
        |  scanner.test.ts / component-graph.test.ts
        v
  GuiStaticScanner@1 --> UiComponentGraph@1
        |  ui-capsule.test.ts / state-machine.test.ts
        v
  UiSemanticCapsule@1 + UiStateMachine@1
        |  scenario-catalog.test.ts / policy-validator.test.ts
        v
  DeterministicScenarioCatalog@1 + UiActionBinding@1
        |  invalidation.test.ts / context-pack.test.ts
        v
  UiInvalidationPlan@1 + UiContextPack@1
        |  accessibility.test.ts / visual-regression.test.ts
        |  interaction-runner.test.ts / evaluator.test.ts
        v
  live receipts (heuristic/human visual scores stay unlabeled as verified)
        |  agent-supervisor-baseline.test.ts
        |  verified-gui-optimizer-agent-supervisor-boundary.test.ts
        |  verified-gui-optimizer-agent-supervisor-baseline.spec.ts
        |  verified-gui-optimizer-agent-supervisor-regression.spec.ts
        v
  isolated improve/verify (Python VerifiedGuiOptimizer@1)
```
