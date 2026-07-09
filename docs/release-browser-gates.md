# Release Browser Gates (SWR-044)

SWR-044 wires the phase-11 browser hardening work into one release-readiness
entry point:

```sh
npm run release:readiness
```

The command runs `scripts/release-readiness-gate.mjs` and writes:

- `docs/release-readiness-report.json`
- `docs/release-readiness-report.md`

## Gate Inventory

| Gate | Release blocker |
| --- | --- |
| Package export browser leakage | Browser/import/default package export targets or `browser` replacements point at host-only, terminal, native, filesystem, subprocess, Python, or test/archive modules. |
| Browser dependency allowlist drift | Browser-critical packages are declared without an owner in `package.json` `swissknife.dependencyOwnership`, or a Node builtin package name enters dependencies/allowlists. |
| Browser WASM integrity metadata | ZKP/WASM artifacts are missing, their byte counts or SHA-256 digests drift from manifests, Schnorr WASM proof metadata stops carrying a digest, or WASM policy evidence is missing COOP/COEP/CSP/integrity requirements. |
| Browser deployment policy evidence | CSP/header, worker, storage, offline, OPFS, IndexedDB, Cache Storage, COOP, and COEP evidence is missing from the deployment policy and built headers. |
| Browser smoke evidence freshness | SWR-043 desktop, mobile, and constrained receipts are missing, stale, mismatched, record host leakage, or no longer prove storage, worker, MCP dashboard lazy loading, and libp2p capable/constrained states. |
| Built bundle host leakage and default Pyodide | `scripts/audit-web-bundle.mjs --fail-on-host-leakage --fail-on-default-pyodide --no-fail-on-budget` finds Node host APIs or default Pyodide reachability in `dist/`. |
| Browser libp2p evidence freshness | `scripts/audit-release-evidence-freshness.mjs --fail-on-stale` reports stale or missing libp2p/browser release evidence. |

The bundle size budget remains tracked by `npm run bundle:audit:web`, but it is
not part of the SWR-044 acceptance criteria. SWR-044 blocks on browser safety
and evidence freshness: host leakage, default Pyodide, stale smoke/libp2p
evidence, missing WASM integrity, deployment policy evidence, dependency
allowlist drift, and package export leakage.

## Evidence Sources

| Evidence | Source |
| --- | --- |
| Package exports | `package.json` `exports` and `browser` fields. |
| Dependency allowlist | `package.json` `swissknife.dependencyOwnership`. |
| WASM integrity | `src/services/zkp/artifacts/groth16/deontic_discharge_v1/manifest.json`, artifact bytes, `src/services/zkp-browser-schnorr.ts`, and `docs/browser-wasm-asset-policy.md`. |
| Deployment policy | `docs/browser-deployment-policy.md`, `web/index.html`, `vite.web.config.ts`, and `dist/_headers`. |
| Browser smoke | `test-results/browser-smoke-matrix/*.json` receipts from SWR-043. |
| Host/Pyodide bundle audit | `dist/` plus `scripts/audit-web-bundle.mjs`. |
| libp2p freshness | `docs/browser-libp2p-evidence.md`, fingerprint receipts, and `scripts/audit-release-evidence-freshness.mjs`. |

## Regeneration

| Stale or missing item | Regenerate with |
| --- | --- |
| Browser smoke receipts | `node scripts/run_playwright_test.mjs test -c build-tools/configs/playwright.browser-smoke.config.ts` |
| libp2p evidence | `npm run evidence:libp2p-browser` |
| Bundle host/Pyodide evidence | `npm run build:web` then `npm run release:readiness` |
| WASM artifact metadata | Recompute artifact byte counts and SHA-256 digests, update manifests and embedded registry metadata, then rerun browser ZKP tests. |
| Deployment policy evidence | Update `docs/browser-deployment-policy.md`, web headers/CSP, and Vite browser import guard together. |

CI runs the same command through `.github/workflows/release-readiness-gates.yml`.
