# SwissKnife Refactor Final Signoff

Prepared: 2026-07-09

Task: SWR-045

## Decision

SWR-045 is signed off for the SwissKnife nested repository with the following
conditions:

- The commit-graph dry-run from `HEAD=8af6e6ac9a0ccd66f320bbf79c9620276c20da76`
  to `origin/main=f7c35c33f52ab5debe2680be31140bba0f590d42` is clean and
  fast-forwardable.
- `npm run release:readiness` passes after refreshing the SWR-043 browser smoke
  receipts and browser bundle freshness evidence.
- Parent-repository changes outside `swissknife` are excluded from the merge
  package unless an operator explicitly approves them.
- Existing local SwissKnife edits listed in `docs/refactor-merge-package.md`
  must be reviewed before an operator stages broad worktree changes.

## Merge Dry-Run

Commands:

```bash
git rev-parse HEAD origin/main
git merge-base HEAD origin/main
git merge-base --is-ancestor HEAD origin/main
git merge-tree --write-tree HEAD origin/main
```

Observed result:

```text
HEAD        8af6e6ac9a0ccd66f320bbf79c9620276c20da76
origin/main f7c35c33f52ab5debe2680be31140bba0f590d42
merge-base  8af6e6ac9a0ccd66f320bbf79c9620276c20da76
ancestor status: 0
merge-tree: a1bd2409cdbe1cf93e1817e0deb9268f50af100d
```

Interpretation: the target commit is reachable as a fast-forward from the
current checked-out commit. No merge-tree conflict output was emitted.

## Commits To Merge

The exact target commit is:

```text
f7c35c33f52ab5debe2680be31140bba0f590d42 origin/main
```

The release/signoff commits that directly affect SWR-045 readiness evidence
are:

```text
3af3fa08 feat(audit): add script for auditing package browser exports
1dc8aa4e feat(e2e): add browser smoke matrix tests and libp2p bootstrap matrix tests
a7114dcc feat: enhance release readiness gate for browser hardening phase
f7c35c33 fix: update timestamps and statuses in release readiness reports
```

The complete first-parent merge range is recorded in
`docs/refactor-merge-package.md`. Operators can reproduce the full object list
with `git log --oneline --reverse HEAD..origin/main`.

## Release Readiness Output

Command:

```bash
npm run release:readiness
```

Result:

```text
Release readiness: PASSED (7 passed, 0 failed)
Report: docs/release-readiness-report.json, docs/release-readiness-report.md
```

Gate summary from `docs/release-readiness-report.md`:

| Gate | Status |
| --- | --- |
| Package export browser leakage | PASSED |
| Browser dependency allowlist drift | PASSED |
| Browser WASM integrity metadata | PASSED |
| Browser deployment policy evidence | PASSED |
| Browser smoke evidence freshness | PASSED |
| Built bundle host leakage and default Pyodide | PASSED |
| Browser libp2p evidence freshness | PASSED |

Additional evidence:

- Browser smoke matrix: 12 Playwright tests passed.
- Browser smoke receipts captured from
  `2026-07-09T05:20:16.939Z` through `2026-07-09T05:20:57.633Z`.
- Bundle audit: 48 web bundle files, 1.67 MiB raw, 366.4 KiB gzip.
- Host leakage findings: 0.
- Default Pyodide exposure findings: 0.
- Browser libp2p, bundle budget, and module-boundary freshness: fresh.

## Residual Browser-Compatibility Risks

1. `docs/browser-bundle-budget.md` records `libp2pRawBytes` at 319.8 KiB
   against a 256.0 KiB budget. The SWR-044 readiness gate intentionally uses
   `--no-fail-on-budget` for this check and still blocks on host leakage,
   default Pyodide, stale evidence, policy drift, and browser-smoke failures.
   Treat the libp2p raw-size overage as a remaining optimization/review item
   before a size-budgeted production release.
2. The built bundle still contains 17 Python/Pyodide text references, but the
   default Pyodide exposure count is 0 and no in-browser host execution path was
   found.
3. Browser smoke evidence is timestamped; the JSON receipts are kept visible
   under `test-results/browser-smoke-matrix/` while screenshots remain ignored.
   Re-run `node scripts/run_playwright_test.mjs test -c
   build-tools/configs/playwright.browser-smoke.config.ts` after changing the
   web app shell, MCP dashboard, storage/worker capability handling, or browser
   libp2p runtime.
4. The current local build includes pre-existing browser-runtime bridge edits in
   `web/js/apps/mcp-control.js`, `web/js/apps/p2p-network.js`, and untracked
   browser bridge files under `web/js/core/`. Review those changes before any
   broad SwissKnife staging operation.
5. Optional libp2p dependency drift can still break real browser node
   construction even when static package export and allowlist checks pass.
   Re-run browser smoke and libp2p Playwright evidence after dependency updates.

## Rollback Plan

Use non-destructive rollback first.

1. If the SWR-045 signoff/docs commit causes a problem, revert that commit in
   the nested `swissknife` repository:

   ```bash
   cd swissknife
   git revert <swr-045-commit>
   npm run release:readiness
   ```

2. If the fast-forward to `origin/main=f7c35c33` causes a problem after it is
   pushed, create a revert commit for the offending range instead of force
   pushing:

   ```bash
   cd swissknife
   git revert --no-commit 8af6e6ac..f7c35c33
   git commit -m "revert: roll back SwissKnife refactor readiness merge"
   npm run release:readiness
   ```

3. If the parent repository gitlink was updated, revert only that parent commit
   after the nested rollback commit exists. Do not stage unrelated parent files.

4. If browser compatibility regresses after rollback, restore the last passing
   evidence by rerunning:

   ```bash
   node scripts/run_playwright_test.mjs test -c build-tools/configs/playwright.browser-smoke.config.ts
   node scripts/audit-web-bundle.mjs --dist dist --report docs/browser-bundle-budget.md --json docs/browser-bundle-budget.json --fail-on-host-leakage --fail-on-default-pyodide --no-fail-on-budget
   node scripts/audit-release-evidence-freshness.mjs --update browser-bundle-budget --json docs/release-evidence-freshness.json --report docs/release-evidence-freshness.md
   npm run release:readiness
   ```

## Final Signoff

The SwissKnife refactor merge package is ready for operator review. The merge
dry-run is clean, the phase-11 readiness gate passes, browser smoke evidence is
fresh, and no parent-repository changes are approved as part of this package.
