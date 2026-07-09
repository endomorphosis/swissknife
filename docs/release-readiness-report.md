# Release Readiness Report

Generated: 2026-07-09T04:52:29.276Z
Commit: a7114dcc0cb5d503d499c2f897e7c96ec784eb4a
Overall status: PASSED
Duration: 4.6s

| Gate | Status | Duration |
| --- | --- | --- |
| Package export browser leakage | PASSED | 0.0s |
| Browser dependency allowlist drift | PASSED | 0.0s |
| Browser WASM integrity metadata | PASSED | 0.0s |
| Browser deployment policy evidence | PASSED | 0.0s |
| Browser smoke evidence freshness | PASSED | 0.0s |
| Built bundle host leakage and default Pyodide | PASSED | 4.5s |
| Browser libp2p evidence freshness | PASSED | 0.1s |

## Package export browser leakage

Detail:

- browser-relevant package targets: 49
- scanned files: web/src/swissknife-browser-core.ts, src/ai/browser.ts, src/components/browser/index.ts, src/hooks/browser/index.ts, src/services/ipfs/browser.ts, src/services/mcp/mcp-dashboard-browser-policy.ts, src/services/mcp/libp2p-browser-runtime.ts, src/models/browser.ts, src/platform/browser.ts, src/screens/browser/index.ts, src/storage/browser.ts, src/workers/browser.ts
- package exports: declared

## Browser dependency allowlist drift

Detail:

- allowlisted browser packages: 29
- declared browser-critical packages checked: 29

## Browser WASM integrity metadata

Detail:

- checked artifacts: 5
- policy docs: docs/browser-zkp-artifacts.md, docs/browser-wasm-asset-policy.md

## Browser deployment policy evidence

Detail:

- required evidence files: 4
- service worker: present

## Browser smoke evidence freshness

Detail:

- required receipts: 9
- max age days: 14
- capturedAt range: 2026-07-09T04:34:50.579Z .. 2026-07-09T04:35:29.995Z

## Built bundle host leakage and default Pyodide

Detail:

- Audited 49 web bundle files (1.67 MiB raw, 367.1 KiB gzip).
- libp2p: 7 chunk(s), 322.6 KiB raw.
- host leakage: 0; Python/Pyodide exposure: 17; default Pyodide: 0.

## Browser libp2p evidence freshness

Detail:

- Release evidence freshness:
-   - Browser libp2p Playwright evidence (SWR-028): fresh
-   - Browser bundle budget evidence (SWR-016): fresh
-   - Module-boundary / service-boundary audit evidence (SWR-024): fresh

