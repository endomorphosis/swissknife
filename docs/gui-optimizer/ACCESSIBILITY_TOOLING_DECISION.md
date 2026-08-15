# Accessibility tooling decision (VGO-031)

Date: 2026-08-13
Evaluator: `UiAccessibilityEvaluator@1` / `gui-accessibility-evaluator@1.0.0`
Engine: first-party live-DOM rules `1.0.0`

This record decides whether VerifiedGuiOptimizer live-DOM accessibility
evaluation can be implemented from existing SwissKnife facilities, or whether
the single permitted direct dependency (`axe-core@4.6.3`) must be added with a
synchronized lockfile update.

## Decision

Existing facilities are insufficient by themselves for a live-DOM
accessibility receipt, but they are sufficient as coverage evidence plus a
first-party live-DOM rule engine.

No new direct accessibility dependency is added. `swissknife/package.json`,
`swissknife/package-lock.json`, and `swissknife/yarn.lock` are unchanged.

Automated success is not WCAG certification. The evaluator always sets
`wcag_compliance_claimed` and `wcag_certification_claimed` to `false`.

## Existing-facility inventory

| Facility | What it already covers | Live-DOM gap |
| --- | --- | --- |
| `swissknife/test/e2e/all-app-ui-ux-accessibility.spec.ts` (SVD-112 Playwright simulator) | Accessible names via `getByRole`, four-control tab order, failure visibility, overflow/clip heuristics | Simulator HTML only; not a live Agent Supervisor DOM; no contrast, duplicate IDs, heading outline, form error association, or WCAG disposition split |
| `swissknife/src/services/gui-optimizer/scanner.ts` | Static ARIA/role/`tabIndex`/keyboard/focus findings from source | Does not execute or observe a rendered DOM |
| `swissknife/src/services/gui-optimizer/ui-capsule.ts` | Capsule `accessibility_contract_id` and static violation attributes | Capsules are source identities, not live observations |
| `npm run test:e2e:accessibility` / `npm run evidence:ui-ux-accessibility` | Runs the SVD-112 simulator suite | Same simulator limits as the spec above |
| `lighthouse@10.1.0` (`performance-test` script) | Performance audit against `localhost:3001` | Not wired into gui-optimizer; not a receipt producer |
| Transitive `axe-core@4.6.3` (Lighthouse only) | Present in `node_modules` as a Lighthouse dependency | Not a direct, pinned gui-optimizer dependency. Importing it without a lock-synchronized direct pin would be an unpinned coupling and is forbidden |

There is no `@axe-core/playwright`, `jest-axe`, or `pa11y` surface already
producing `AccessibilityReceipt@1` records.

## Why a first-party engine is enough

VGO-031 requires recorded automated severity, labels, keyboard
reachability/order/traps, duplicate IDs, contrast, images/headings/forms,
manual checks, unsupported WCAG criteria, and unperformed screen-reader
review. Those checks are closed, deterministic, and implementable against a
serialized live DOM (HTML, explicit node tree, or `documentElement`) without
axe's broader, version-sensitive rule pack.

The permitted pin remains documented: if a later task needs axe's remaining
automated rules, it may add exactly `axe-core@4.6.3` as one direct dependency
and update the committed lockfiles in the same change. Unpinned or unrelated
audit packages stay forbidden.

## Lock and dependency outcome

- Direct accessibility dependency added: no
- Permitted pin if later required: `axe-core@4.6.3`
- Lockfile changes in this task: none
- Engine identity: `first-party-live-dom-rules@1.0.0`

## Receipt boundary

`AccessibilityReceipt@1` separates:

- `automated_pass_count` — automated passes
- `violation_ids` / `violation_count` — automated violations
- `unsupported_criteria` — WCAG 2.2 criteria this engine cannot fully evaluate
- `manual_check_ids` — human review, including `manual:screen-reader-review`
- `keyboard_result` — `ConstraintCheckStatus`
- `screen_reader_reviewed` — false unless a human review is supplied

`KeyboardEvaluation@1` records reachability, tab order, positive `tabindex`,
modal containment, focus leaks, and missing keyboard activation.

Critical findings (`duplicate-id`, unlabeled interactive controls, keyboard
unreachable/unactivatable controls, modal tab leaks, missing form labels) are
emitted as `AccessibilityAcceptanceBlocker@1` records. A new critical finding
against a supplied baseline uses `critical_regression`. Either case is a
machine-readable automatic-acceptance blocker. Non-critical contrast or
heading issues are violations without forcing that gate.

The evaluator never sets `verification_status` to `verified` as a WCAG proof.
A clean live-DOM run is `structurally_valid` automated evidence only.
