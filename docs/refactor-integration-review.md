# SwissKnife Refactor Integration Review

Review date: 2026-07-08

Task: SWR-031, review completed SwissKnife refactor commit set.

## Scope And Provenance

This review separates three different states that are easy to conflate:

| State | Evidence |
| --- | --- |
| Checked-out SwissKnife worktree | `HEAD=f752f53b9ebff975f9d3856b278dd34b0eaabfd8`, detached at `f752f53 Merge remote-tracking branch 'origin/main'`; `git status --short` inside `swissknife` was clean before this document was added. |
| Completed committed SwissKnife refactor candidate | `origin/main=084243dcedbffe0613ceef4c02e47916a118f60b`, whose parent is `04809e82dd270eca2cf32a1f90a769ab76f9ee6c chore: add pending swissknife staged changes`. The refactor outputs reviewed below are in `04809e8`, with `084243d` adding automated documentation updates on top. |
| Unrelated root-repo dirt | Parent repository `git status --short` showed existing modified or untracked files outside `swissknife`, including meta-glasses docs, `implementation_plan/docs/36-*`, the SWR todo file, `spec/meta_glasses_mobile_orb_bridge_interface.json`, `tests/test_virtual_ai_os_todo_queue.py`, `tmp/`, and dirty nested repos `external/ipfs_accelerate` and `hallucinate_app`. These are not used as SwissKnife refactor evidence. |

The active `swissknife` checkout (`f752f53`) does not contain the SWR-029
release-gate files. The committed candidate `04809e8` does contain them. Treat
this review as an integration guide for promoting the committed refactor
candidate onto the active SwissKnife line, not as proof that the active
detached checkout already has every SWR-029/SWR-030 output.

## Domain Review

| Domain | Commit and file evidence | Review risks | Recommended integration order |
| --- | --- | --- | --- |
| Module boundaries | `04809e8` adds `src/module-ownership.json`, `docs/source-module-boundaries.md`, `docs/service-boundary-audit.json`, `docs/service-boundary-audit.fingerprint.json`, and `scripts/audit-source-modules.mjs`. Earlier service-layout commits include `774f47d feat: restructure services and add new integrations`, `e3e7772 Refactor service module structure and update imports`, `2c3944e Refactor services and update imports`, `a259e6c Refactor service imports and remove deprecated files`, `da94412 Refactor module imports and update paths for consistency`, and `b939928 Refactor service entrypoints for browser and host compatibility`. | High rename churn across `src/services/*` can hide stale compatibility imports. The audit needs to run after every cherry-pick or merge conflict resolution because path moves affect many tests. Current `f752f53` lacks the new `src/module-ownership.json` gate, so relying on the checked-out tree alone under-reports risk. | Integrate first. The boundary manifest and audit should land before browser, IPFS, Storage, Workers, libp2p, or ZKP runtime changes so later imports are checked against the intended ownership model. |
| Browser runtime | `04809e8` adds explicit browser/host surfaces including `src/platform/browser.ts`, `src/platform/host.ts`, `src/ai/browser.ts`, `src/ai/host.ts`, `src/models/browser.ts`, `src/models/host.ts`, `src/components/browser/BrowserRuntimeSummary.tsx`, `src/hooks/browser/useBrowserPlatformSnapshot.ts`, and `src/screens/browser/BrowserHomeScreen.tsx`. It also adds `tsconfig.browser.json`, `tsconfig.host.json`, `config/jest/jest.browser-compat.config.cjs`, `build-tools/configs/vitest.browser-compat.config.ts`, and `scripts/audit-browser-compat.mjs`. | The checked-out `f752f53` only has the older `build:web` script and not the browser typecheck or compatibility lanes from the candidate. Conflict resolution must preserve host-only APIs behind `host.ts` entrypoints and browser-safe APIs behind `browser.ts`. Browser inventory in `docs/browser-compatibility-inventory.md` still classifies several dynamic-import app bundles as `unknown`; that should stay visible rather than being waived silently. | Integrate after Module boundaries. Then run `npm run typecheck:browser` and `npm run test:browser-compat` before adding higher-level browser evidence. |
| IPFS | `04809e8` adds `src/services/ipfs/browser.ts`, `src/services/ipfs/host.ts`, `docs/ipfs-browser-transport.md`, and moves IPFS descriptor files under `src/services/ipfs/`. The browser strategy documents gateway reads, explicitly configured browser HTTP API endpoints, and host-only daemon/filesystem/Python/native IPFS capabilities. | Browser IPFS must not default to localhost daemon assumptions. Host-only imports such as `src/ipfs/client.ts`, filesystem backends, native CLI, and Python bridges must stay out of browser graphs. The gateway/API split also needs product review because write operations require explicit API endpoint trust and CORS behavior. | Integrate after Browser runtime, before libp2p evidence, because browser IPFS delegates peer behavior to the browser libp2p runtime and depends on the browser-safe import split. |
| Storage | `04809e8` adds `src/storage/browser.ts` and `src/storage/host.ts`, keeps storage ownership documented in `docs/source-module-boundaries.md`, and preserves existing provider files such as `src/storage/backend.ts`, `src/storage/provider.ts`, `src/storage/registry.ts`, `src/storage/service.ts`, `src/storage/storage-service.ts`, `src/storage/virtual-filesystem.ts`, and host backends under `src/storage/backends/*`. | Storage is classified as split. Browser imports should go through `src/storage/browser.ts`; filesystem and local path behavior should stay behind `src/storage/host.ts`. Merge conflicts here can easily reintroduce `fs`, `path`, or process/config imports into browser bundles. | Integrate with IPFS or immediately after it. Then re-run source-module and browser-compat audits before any web build evidence is trusted. |
| Workers | `04809e8` adds `src/workers/browser.ts` and `src/workers/host.ts`, updates `build-tools/configs/vite.workers.config.ts`, and keeps worker guidance in `docs/workers/README.md`. It also adds browser compatibility coverage that inventories worker and worklet usage. | Existing worker pool files still include host-style execution paths such as worker threads. Browser worker entrypoints must not import `worker_threads` or host pool code directly. Worker build config conflicts can become runtime-only failures if only TypeScript is checked. | Integrate after Storage/IPFS splits. Run `npm run test:browser-compat` and any focused worker browser tests before promoting libp2p or release gates. |
| libp2p | `04809e8` adds `src/services/mcp/libp2p-browser-runtime.ts`, `test/e2e/libp2p-browser.spec.ts`, `test/e2e/fixtures/libp2p-browser-harness/*`, `build-tools/configs/playwright.libp2p-browser.config.ts`, `build-tools/configs/vite.libp2p-browser-harness.config.ts`, `docs/browser-libp2p-evidence.md`, and fingerprint evidence. `package.json` adds browser libp2p optional dependencies such as `@libp2p/webrtc`, `@libp2p/websockets`, `@libp2p/circuit-relay-v2`, `@libp2p/identify`, `@chainsafe/libp2p-noise`, `@chainsafe/libp2p-yamux`, and `@chainsafe/libp2p-gossipsub`. | The Playwright evidence is real-browser evidence, but it is fingerprinted and can become stale when runtime, config, or package files change. Optional dependency drift, especially `@libp2p/identify`, can make mocked tests pass while real node construction fails. Budget drift is covered only when `scripts/audit-web-bundle.mjs` and the web build are present. | Integrate after Browser runtime, IPFS, Storage, and Workers. Re-run or re-certify `npm run evidence:libp2p-browser` after conflicts are resolved, then check freshness. |
| ZKP | Active checked-out commits provide direct ZKP hardening evidence: `57b02ae refactor: remove node crypto from browser-facing logic paths`, `0247725 Harden browser-safe ZKP prover modules`, `4d2c4f1 Harden browser purity with transitive scan`, `7cdb704 Add TDFOL native crosslang conformance test`, `67d3589 Fail closed on ZKP UCAN fallback`, `facac51 Harden ZKP bridges against simulation`, `b3944d2 Add real browser ZKP backend path`, `80e4523 Relax strict ZKP bridge error assertions`, and `b25ecc3 refactor: replace Node crypto with browser-compatible hashing functions`. Key files include `src/services/provers/browser-crypto.ts`, `src/services/zkp/browser-snarkjs-backend.ts`, `src/services/zkp-browser-schnorr.ts`, `src/services/zkp/zkp-ucan-bridge.ts`, `src/services/zkp/artifacts/groth16/deontic_discharge_v1/*`, `src/services/zkp/circuits/deontic_discharge_v1.circom`, `src/types/snarkjs.d.ts`, `test/mcp-plus-plus/wasm-prover-browser-purity.test.ts`, `test/mcp-plus-plus/wasm-prover-browser-zkp-real.test.ts`, and `test/conformance/tdfol-native-crosslang-conformance.test.ts`. Candidate `04809e8` also adds `docs/browser-zkp-artifacts.md` and `src/services/zkp/artifacts/index.ts`. | Real artifacts and browser-safe crypto are high-value but high-risk. Do not weaken fail-closed behavior in `zkp-ucan-bridge.ts` to make tests pass. The artifact files affect package size and bundle policy; confirm they are excluded or lazy as intended by the web bundle audit. The candidate and checked-out lines both touch ZKP files, so expect non-trivial conflict resolution. | Integrate after boundary and browser runtime work, but before final Release gates. Run the browser-purity, real ZKP, and TDFOL conformance tests before trusting release readiness. |
| Release gates | `04809e8` adds `.github/workflows/release-readiness-gates.yml`, `scripts/release-readiness-gate.mjs`, `scripts/audit-web-bundle.mjs`, `scripts/audit-release-evidence-freshness.mjs`, `docs/release-browser-gates.md`, `docs/release-readiness-report.md`, `docs/release-readiness-report.json`, `docs/browser-bundle-budget.md`, `docs/browser-bundle-budget.json`, `docs/browser-python-policy.md`, and freshness receipts. `package.json` wires `services:audit`, `audit:module-boundary`, `typecheck:browser`, `test:browser-compat`, `build:web`, `evidence:freshness:check`, `evidence:libp2p-browser`, and release hooks. | These gates are absent from the active `f752f53` checkout. They should be reviewed as committed candidate content from `04809e8`, not as active local behavior. The `build:web` script changes from a simple Vite build to Vite plus `bundle:audit:web`; this can expose latent bundle leakage. Evidence receipts can fail for legitimate staleness after integration. | Integrate last. Release gates should be the final enforcement layer after runtime conflicts and focused tests pass, then run the full release gate and archive output under SWR-032. |

## Cross-Domain Risks

The biggest integration risk is branch skew. The active detached checkout
contains recent ZKP hardening commits, while `origin/main` contains the large
SWR browser/runtime/release-gate candidate. A simple fast-forward is not
available from the active `f752f53` state. Expect to resolve conflicts in
`package.json`, lockfiles, `src/services/zkp/*`, `src/services/provers/*`,
browser build configs, and tests.

The second risk is evidence freshness. The candidate deliberately records
fingerprints for bundle budget, module-boundary, and libp2p Playwright
evidence. After any conflict resolution, stale evidence is a useful failure,
not noise. Re-run the underlying generator instead of manually editing the
receipt.

The third risk is root-repo contamination. The parent worktree is dirty with
files unrelated to this SwissKnife review. Do not cite those files as
SwissKnife refactor evidence, do not revert them during SwissKnife
integration, and run validation from inside `swissknife` when possible.

## Recommended Integration Order

1. Bring in Module boundaries: `src/module-ownership.json`,
   `docs/source-module-boundaries.md`, `scripts/audit-source-modules.mjs`, and
   service path moves. Validate with `npm run services:audit` and
   `node scripts/audit-source-modules.mjs --fail-on-unknown --fail-on-forbidden`.
2. Bring in Browser runtime split: platform, AI/model browser and host
   entrypoints, browser components/hooks/screens, `tsconfig.browser.json`, and
   browser compatibility lanes. Validate with `npm run typecheck:browser` and
   `npm run test:browser-compat`.
3. Bring in IPFS and Storage splits: `src/services/ipfs/browser.ts`,
   `src/services/ipfs/host.ts`, `src/storage/browser.ts`, and
   `src/storage/host.ts`. Re-run the boundary and browser compatibility audits.
4. Bring in Workers browser/host split and worker build config. Validate the
   browser compatibility runtime lane and worker-focused tests before moving
   on.
5. Bring in libp2p browser runtime and Playwright evidence. Re-run or
   re-certify `npm run evidence:libp2p-browser` after package and config
   conflicts are resolved.
6. Reconcile ZKP changes from the active line and candidate line. Preserve
   fail-closed UCAN behavior, real browser backend paths, and browser-purity
   transitive scans.
7. Bring in Release gates and CI workflow last. Run the SWR-032 clean
   release-readiness gate only after the lower-level checks are green.

## Validation Commands For This Review

This document is intentionally evidence-only. It does not claim the active
checkout passes candidate release gates that are absent from `f752f53`.

Minimum validation for SWR-031:

```bash
cd swissknife
test -f docs/refactor-integration-review.md
rg -n "Browser runtime|libp2p|Module boundaries|ZKP|IPFS|Storage|Workers|Release gates" docs/refactor-integration-review.md
```

Recommended validation before integrating the candidate commit set:

```bash
cd swissknife
npm run services:audit
node scripts/audit-source-modules.mjs --fail-on-unknown --fail-on-forbidden
npm run typecheck:browser
npm run test:browser-compat
npm run build:web
node scripts/audit-web-bundle.mjs --fail-on-host-leakage
```

Run the recommended validation only after the committed candidate files are
present in the active checkout. On the current detached `f752f53` line, several
of those scripts and docs are not available.
