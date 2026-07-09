# Release Readiness Report

Generated: 2026-07-09T05:32:42.129Z
Commit: f7c35c33f52ab5debe2680be31140bba0f590d42
Overall status: FAILED
Duration: 6.8s

| Gate | Status | Duration |
| --- | --- | --- |
| Package export browser leakage | PASSED | 0.0s |
| Browser dependency allowlist drift | PASSED | 0.0s |
| Browser WASM integrity metadata | PASSED | 0.0s |
| Browser deployment policy evidence | PASSED | 0.0s |
| Browser smoke evidence freshness | PASSED | 0.0s |
| Built bundle host leakage and default Pyodide | FAILED | 6.7s |
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
- capturedAt range: 2026-07-09T05:25:25.705Z .. 2026-07-09T05:26:09.566Z

## Built bundle host leakage and default Pyodide

Detail:

- Audited 50 web bundle files (2.26 MiB raw, 542.4 KiB gzip).
- libp2p: 8 chunk(s), 922.3 KiB raw.
- host leakage: 3; Python/Pyodide exposure: 17; default Pyodide: 0.
- FAIL: host-only leakage detected: 3 finding(s)

Failures:

- audit-web-bundle failed with exit 1
- Audited 50 web bundle files (2.26 MiB raw, 542.4 KiB gzip).
- libp2p: 8 chunk(s), 922.3 KiB raw.
- host leakage: 3; Python/Pyodide exposure: 17; default Pyodide: 0.
- FAIL: host-only leakage detected: 3 finding(s)

## Browser libp2p evidence freshness

Detail:

- Release evidence freshness:
-   - Browser libp2p Playwright evidence (SWR-028): fresh
-   - Browser bundle budget evidence (SWR-016): fresh
-   - Module-boundary / service-boundary audit evidence (SWR-024): fresh

