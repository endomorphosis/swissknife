# SwissKnife Refactor Merge Package

Prepared: 2026-07-08

Task: SWR-035, prepare the main-branch merge package for the completed
SwissKnife refactor sequence.

## Merge Target

| Field | Value |
| --- | --- |
| Repository | `swissknife` nested Git repository |
| Remote | `origin` -> `https://github.com/endomorphosis/swissknife` |
| Target branch | `main` |
| Target ref | `origin/main` |
| Current SwissKnife HEAD | `8af6e6ac9a0ccd66f320bbf79c9620276c20da76` |
| Current HEAD subject | `Merge local swissknife working changes onto origin/main` |
| Current checkout state | Detached `HEAD`; local `main` and `origin/main` both point at `8af6e6a` |
| Merge-base with `origin/main` | `8af6e6ac9a0ccd66f320bbf79c9620276c20da76` |
| Ahead/behind relative to `origin/main` | `0` ahead, `0` behind before adding this package |

The refactor content is already present at the current `origin/main` tip. The
remaining integration action for this task is to commit this merge-package
document on top of `main`; no history rewrite, force push, root-repository
merge, or unrelated worktree cleanup is part of this package.

## Refactor Commit Set

The current target tip contains the following refactor commits and supporting
merge/documentation commits:

| Commit | Subject | Merge-package role |
| --- | --- | --- |
| `8af6e6a` | `Merge local swissknife working changes onto origin/main` | Current SwissKnife `HEAD`; adds current SWR-031/SWR-032 integration evidence including `docs/refactor-integration-review.md`, `docs/refactor-release-gate-output.md`, service-source audit output, browser compatibility report, and supporting scripts. |
| `084243d` | `Auto-update documentation - Quality: 87/100` | Documentation refresh on top of the large refactor candidate. |
| `04809e8` | `chore: add pending swissknife staged changes` | Main refactor payload: browser/host entrypoint split, module ownership manifest, browser compatibility and source-module audits, release gates, web bundle audit, Pyodide policy, browser libp2p Playwright evidence, package updates, and web legacy archive moves. |
| `d1cd15e` | `Auto-update documentation - Quality: 84/100` | Documentation refresh immediately before the refactor payload. |
| `0688943` | `Merge commit 'f76e6ee6' into merge/swissknife-into-origin-main` | Prior integration merge on the SwissKnife main line. |

Relevant older commits are retained in the history for adjacent integration
work, but the SWR-031 through SWR-034 evidence reviewed for this package is
represented by the committed files at `8af6e6a` and the main refactor payload at
`04809e8`.

## Dependency Evidence

| Dependency | Evidence files | Result |
| --- | --- | --- |
| SWR-031, refactor integration review | `docs/refactor-integration-review.md` | Reviews module boundaries, browser runtime, IPFS, Storage, Workers, libp2p, ZKP, and release gates; warns against root-repo contamination. |
| SWR-032, clean release gate archive | `docs/refactor-release-gate-output.md`, `docs/release-readiness-report.md`, `docs/release-readiness-report.json` | Refactor gate output records pass for service source audit, source module audit, browser typecheck, browser compatibility, web build, bundle audit, and evidence freshness. Full release-readiness report records 8 of 9 gates passed with one residual MCP/glasses evidence failure. |
| SWR-033, bundle host-leakage and Pyodide policy | `docs/browser-bundle-budget.md`, `docs/browser-bundle-budget.json`, `docs/browser-python-policy.md` | Bundle audit passed with 43 built assets, 1.65 MiB raw, 358.5 KiB gzip, zero host-only leakage findings, 17 non-failing Python text references, and zero default Pyodide exposure findings. |
| SWR-034, browser libp2p Playwright evidence | `docs/browser-libp2p-evidence.md`, `docs/browser-libp2p-evidence.fingerprint.json`, `test/e2e/libp2p-browser.spec.ts`, `build-tools/configs/playwright.libp2p-browser.config.ts` | Real Chromium evidence covers desktop and mobile projects, installed browser libp2p capability construction, capability-gap scenarios, relay/bootstrap configuration, and MCP p2p session success/error/timeout paths. Freshness receipt recorded at `2026-07-08T10:32:40.831Z`. |

## Validation Evidence

The package records existing generated evidence and the exact commands that
produced or validate it. Operators should re-run the commands after any conflict
resolution or after adding commits on top of `8af6e6a`.

| Gate | Command | Recorded evidence |
| --- | --- | --- |
| Service source audit | `npm run services:audit` | `docs/service-source-audit.md`: pass; 330 service files audited; 0 forbidden service imports. |
| Source module audit | `npm run audit:module-boundary` | `docs/service-boundary-audit.json`: 46 modules, 15 root files, 0 unknown files, 0 forbidden imports, 0 legacy compatibility shims, 0 legacy root import specifiers. |
| Browser typecheck | `npm run typecheck:browser` | `docs/refactor-release-gate-output.md`: pass, exit code 0. |
| Browser compatibility | `npm run test:browser-compat` | `docs/browser-compatibility-report.json`: 20 checks, 20 passed, 0 failed, 0 host-only matches. |
| Web build | `npm run build:web` | `docs/refactor-release-gate-output.md`: pass, `dist/index.html` produced. |
| Bundle audit | `npm run bundle:audit:web` | `docs/browser-bundle-budget.md`: pass; all total and libp2p budgets below limits; host leakage 0; default Pyodide exposure 0. |
| Evidence freshness | `npm run evidence:freshness:check` | `docs/release-evidence-freshness.md`: libp2p Playwright, browser bundle budget, and module-boundary audit evidence all fresh. |
| Browser libp2p Playwright | `node scripts/run_playwright_test.mjs test -c build-tools/configs/playwright.libp2p-browser.config.ts` | `docs/browser-libp2p-evidence.md`: real browser runtime exercised across desktop and mobile Chromium profiles. |

The SWR-035 validation command for this document is:

```bash
cd swissknife
test -f docs/refactor-merge-package.md
git status --short
git log --oneline -20
```

## Current Worktree Exclusions

At package-preparation time, the `swissknife` worktree had unrelated local
changes outside this document:

```text
M  docs/browser-zkp-artifacts.md
M  scripts/all-tools-evidence-lib.cjs
M  src/services/zkp/artifacts/groth16/deontic_discharge_v1/manifest.json
M  src/services/zkp/artifacts/index.ts
M  src/services/zkp/browser-snarkjs-backend.ts
M  test/mcp-plus-plus/all-tools-release-policy-gates.test.ts
?? docs/browser-wasm-asset-policy.md
?? scripts/audit-browser-wasm-assets.mjs
?? src/services/swissknife-mcp-capability-registry.ts
?? src/services/zkp/artifacts/browser-wasm-assets.json
```

Those files are not part of SWR-035 and must not be silently included in a
merge-package commit. If they are intended for a later task, commit or shelve
them separately with explicit operator approval.

The parent repository also has unrelated modified nested repositories and files
outside `swissknife`. This package does not authorize merging, resetting, or
committing those root-repository changes.

## Residual Risks

1. The full `docs/release-readiness-report.md` generated at
   `2026-07-08T10:36:53.641Z` reports overall failure because
   `evidence:mcp-glasses` could not find
   `test-results/virtual-desktop-ipfs-mcp-orb/all-tools-ledger.json`. The
   refactor-specific release gate output still records the browser, bundle,
   source audit, and freshness gates as passing. Treat the MCP/glasses evidence
   failure as a release risk to resolve before a production release cut.
2. Evidence freshness is fingerprint-based. Any follow-up edit to runtime,
   build, package, or Playwright evidence inputs must regenerate the matching
   report rather than hand-editing receipts.
3. The checkout is detached even though `main` points to the same commit. Commit
   this package from an attached `main` checkout to avoid creating orphaned
   commits.
4. Browser libp2p relies on optional packages. Package-lock or dependency
   conflict resolution can break real node construction even when mocked unit
   tests pass, so re-run the Playwright evidence after dependency changes.
5. Do not use root-repository `git add -A`, root-repository merges, or forced
   pushes as part of this package. The SwissKnife nested repository and the
   root repository have independent dirty states.

## Recommended Merge Commands

Use these commands from a clean operator shell. They intentionally avoid history
rewrites and only operate on the nested `swissknife` repository until the final
optional root gitlink update.

```bash
cd /home/barberb/barberb/copilot-worktrees/lift_coding/hallucinate-llc-psychic-adventure/swissknife

# Inspect first; do not proceed if unrelated local changes would be included.
git status --short
git log --oneline --decorate --max-count=20

# Attach to the target branch and update only by fast-forward.
git switch main
git fetch origin
git pull --ff-only origin main

# The current refactor target should already be present; fast-forward if not.
git merge-base --is-ancestor 8af6e6ac9a0ccd66f320bbf79c9620276c20da76 HEAD || git merge --ff-only 8af6e6ac9a0ccd66f320bbf79c9620276c20da76

# Stage only this SWR-035 package. Do not stage unrelated ZKP/WASM changes.
git add docs/refactor-merge-package.md
git diff --cached --stat
git commit -m "docs: add SwissKnife refactor merge package"

# Re-run required package validation and inspect the final commit window.
test -f docs/refactor-merge-package.md
git status --short
git log --oneline -20

# Push only the attached main branch. Never use --force for this package.
git push origin main
```

If the root repository tracks `swissknife` as a nested repository pointer, update
that pointer only after the nested SwissKnife commit has been reviewed and
pushed:

```bash
cd /home/barberb/barberb/copilot-worktrees/lift_coding/hallucinate-llc-psychic-adventure

# Confirm unrelated root changes are not staged.
git status --short

# Stage only the SwissKnife gitlink update if the operator explicitly approves.
git add swissknife
git diff --cached --submodule
git commit -m "chore: update SwissKnife refactor merge package pointer"
```

Do not run `git reset --hard`, `git rebase`, `git push --force`, root-level
`git merge`, or root-level `git add -A` for SWR-035 without explicit operator
approval.
