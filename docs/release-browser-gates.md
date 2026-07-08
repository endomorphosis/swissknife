# Release Browser Gates (SWR-029)

This document describes the complete set of release-blocking gates that
protect the browser bundle, libp2p budget, and browser-compatibility surface
of `swissknife`, and how they are wired into both local release preparation
(`npm run release:gate`) and CI (`.github/workflows/release-readiness-gates.yml`).

SWR-029 does not introduce a new build pipeline; it **wires together** the
outputs of four prerequisite refactor tasks into one enforceable policy so a
release candidate cannot silently skip any of them:

| Prerequisite | What it produced |
| --- | --- |
| SWR-016 | `scripts/audit-web-bundle.mjs`, `docs/browser-bundle-budget.md`, libp2p/browser bundle budgets |
| SWR-024 | `scripts/audit-source-modules.mjs`, `src/module-ownership.json`, the repository module-boundary audit |
| SWR-025 | `tsconfig.browser.json` / `tsconfig.host.json`, the `typecheck:browser` / `typecheck:services` lane split |
| SWR-028 | `test/e2e/libp2p-browser.spec.ts`, `test-results/libp2p-browser/`, `docs/browser-libp2p-evidence.md` — real-browser Playwright evidence for browser libp2p |

## Gate inventory

Every gate below maps 1:1 to an `npm run` script, so the exact same commands
run locally, in `npm run release:gate` (`scripts/release-readiness-gate.mjs`),
and in CI (`.github/workflows/release-readiness-gates.yml`).

| # | Gate | Command | Fails release when |
| --- | --- | --- | --- |
| 1 | Service-boundary audit | `npm run services:audit` | Root-level service shims, unknown files, forbidden imports, or legacy compatibility shims exist under `src/services` |
| 2 | Module-boundary audit | `npm run audit:module-boundary` (`node scripts/audit-source-modules.mjs --fail-on-unknown --fail-on-forbidden`) | Any top-level `src` module has unknown files or forbidden cross-module/host imports (SWR-024's stricter, CI-suitable audit, independent of the `--fail-on-legacy` shim check in `services:audit`) |
| 3 | TypeScript typecheck | `npm run typecheck` (`typecheck:browser` + `typecheck:services`) | The browser project reference (`tsconfig.browser.json`) or the host/service project reference (`tsconfig.host.json`) has non-`TS6305` diagnostics |
| 4 | Fast unit tests | `npm run test:fast` | Any fast unit test fails |
| 5 | Browser compatibility | `npm run test:browser-compat` (static + runtime lanes) | A browser entrypoint imports a host-only module (`node:fs`, `child_process`, …), an archived/backup file leaks into an active Jest lane, or a browser-runtime unit test (storage/workers/AI-inference/WebGPU) fails |
| 6 | Web bundle build | `npm run build:web` (`vite build` + `bundle:audit:web`) | The production build fails, a bundle-size/libp2p budget in `docs/browser-bundle-budget.md` is exceeded, host-only leakage patterns are found in the built bundle, or Pyodide is reachable from a default entry chunk |
| 7 | Bundle host-leakage re-audit | `npm run audit:bundle-host-leakage` (`node scripts/audit-web-bundle.mjs --fail-on-host-leakage`) | An independent re-scan of the already-built `dist/` finds host-only leakage — this is the exact command from the SWR-029 acceptance validation, kept as its own gate so a change to the `build:web` script chain can never accidentally drop the leakage check |
| 8 | Release evidence freshness | `npm run evidence:freshness:check` (`node scripts/audit-release-evidence-freshness.mjs --fail-on-stale`) | The SWR-028 browser libp2p Playwright evidence (or the SWR-016 bundle-budget / SWR-024 module-boundary audit snapshots) is missing, was never certified, or no longer matches a content fingerprint of the source it was captured from (see below) |
| 9 | MCP/glasses evidence | `npm run evidence:mcp-glasses` | MCP/glasses manifest or capability-coverage evidence is missing or inconsistent (pre-existing SWR-006/SWR-009 gate, unchanged by SWR-029) |
| 10 | Dashboard consumer evidence (optional, cross-repo) | `npm run evidence:dashboard-consumer` | Only runs when the sibling `hallucinate_app` checkout is present; skipped (not failed) in a standalone `swissknife` checkout |

Gates 1–9 run in both `npm run release:gate` and the
`release-readiness-gates.yml` CI workflow (as separate jobs, so failures are
attributable and cacheable independently); gate 10 only runs in the local/
monorepo orchestrator when the sibling repo exists.

## Why a freshness gate, not just a re-run

Gates 1–7 and 9 are cheap enough (seconds to low tens of seconds) to re-run on
every release candidate, so they simply run for real every time. The SWR-028
browser libp2p Playwright evidence is different: it drives a real Chromium
engine against a real Vite dev server harness
(`test/e2e/fixtures/libp2p-browser-harness/`) across two viewport projects,
and is not something every release candidate should have to re-run just to
prove nothing regressed.

Instead, `scripts/audit-release-evidence-freshness.mjs` records a **content
fingerprint** (sha256 over the sorted `path:sha256` pairs of every file under
the evidence's declared source dependencies) at the moment the evidence is
captured or re-certified, and persists it as a small JSON receipt next to the
evidence:

- `test-results/libp2p-browser/evidence-source-fingerprint.json` for the
  SWR-028 Playwright evidence (depends on
  `src/services/mcp/libp2p-browser-runtime.ts`,
  `src/services/mcp/mcp-p2p-session.ts`, `src/services/mcp/mcp-discovery.ts`,
  `test/e2e/libp2p-browser.spec.ts`,
  `test/e2e/fixtures/libp2p-browser-harness/`,
  `build-tools/configs/playwright.libp2p-browser.config.ts`, and
  `build-tools/configs/vite.libp2p-browser-harness.config.ts`).
- `docs/browser-bundle-budget.fingerprint.json` for the SWR-016 bundle-budget
  snapshot (depends on `build-tools/configs/vite.web.config.ts`,
  `scripts/audit-web-bundle.mjs`, `src/module-ownership.json`, and
  `package.json`). This one is re-certified automatically as the last step of
  `npm run bundle:audit:web` (part of `build:web`), since that command already
  regenerates the evidence on every run.
- `docs/service-boundary-audit.fingerprint.json` for the SWR-024
  module-boundary audit snapshot (depends on `src/module-ownership.json` and
  `scripts/audit-source-modules.mjs`), re-certified automatically as the last
  step of `npm run services:audit`.

On every release candidate, `npm run evidence:freshness:check` recomputes the
fingerprint for each group from the current working tree and compares it
against the recorded receipt:

- **fresh** — recorded fingerprint matches the current one; evidence is still
  valid for the current source.
- **stale** — the source changed since the evidence was captured; the release
  candidate fails until the evidence is regenerated.
- **never-certified** — no fingerprint receipt exists yet (e.g. right after
  this policy was introduced, or a fresh clone that never ran the
  regeneration command); treated the same as stale.
- **missing-evidence** — one of the evidence artifact files itself is absent.

Certifying a single group (`--update <id>`) only affects the pass/fail
verdict for that group — it will not fail (or hide) staleness in an unrelated
group, so embedding `--update module-boundary-audit` inside `services:audit`
does not couple that command's exit code to, say, stale libp2p Playwright
evidence. The full, all-groups check (used by the `evidence:freshness:check`
release gate) always evaluates every group.

### Regenerating stale evidence

| Evidence group | Regenerate with |
| --- | --- |
| `libp2p-browser-playwright` | `npm run evidence:libp2p-browser` (runs the real Playwright suite, then re-certifies) |
| `browser-bundle-budget` | `npm run build:web` (re-certifies automatically) |
| `module-boundary-audit` | `npm run services:audit` (re-certifies automatically) |

To manually re-certify every group without re-running the underlying
generators (e.g. after confirming by hand that nothing meaningful changed),
use `npm run evidence:freshness:update`. This should be used sparingly and
only after visually confirming the evidence content itself is still accurate
— it exists for recovery/bootstrapping, not as a way to silence the gate.

## `release:gate` orchestration

`npm run release:gate` (`scripts/release-readiness-gate.mjs`) runs gates 1–9
above in the order they are listed, in a single process, and stops at the
first failing gate (fail-fast). It always writes a machine-readable JSON
report (default `docs/release-readiness-report.json`) and a human-readable
Markdown summary (default `docs/release-readiness-report.md`) recording each
gate's status and duration, so failures are auditable evidence rather than
console-only noise. `npm version` (`preversion`) and `npm publish`
(`prepublishOnly`) both depend on this gate passing before a release
proceeds.

## CI wiring

`.github/workflows/release-readiness-gates.yml` runs the same gates as
independent jobs (so failures are attributable per-gate in the GitHub Actions
UI and evidence artifacts upload per job), then an aggregate
`release-readiness-gate` job fails the workflow if any upstream job did not
succeed:

- `services-audit`
- `module-boundary-audit`
- `typecheck`
- `test-fast`
- `browser-compat`
- `build-web` (includes the `audit:bundle-host-leakage` re-audit step)
- `browser-libp2p-evidence-freshness`
- `mcp-glasses-evidence`
- `release-readiness-gate` (aggregate; depends on all of the above)

## Acceptance mapping

This table maps the SWR-029 acceptance criteria directly onto the gates that
enforce them:

| Acceptance condition | Enforced by |
| --- | --- |
| Service/source boundary drift | Gates 1 (`services:audit`) and 2 (`audit:module-boundary`) |
| Browser host leakage | Gates 6 (`build:web` → `bundle:audit:web --fail-on-host-leakage`) and 7 (`audit:bundle-host-leakage`) |
| libp2p budget drift | Gate 6 (`bundle:audit:web`'s `libp2pRawBytes` / `libp2pGzipBytes` / `libp2pBrotliBytes` / `libp2pChunkCount` budgets in `docs/browser-bundle-budget.md`) |
| Missing browser typecheck | Gate 3 (`typecheck` → `typecheck:browser`) |
| Missing browser compatibility tests | Gate 5 (`test:browser-compat`) |
| Stale browser/libp2p evidence | Gate 8 (`evidence:freshness:check`) |
