# Browser Smoke Matrix Evidence (SWR-043)

SWR-043 adds a focused Playwright smoke matrix for the browser deployment
surface. It combines the real SwissKnife web desktop with the existing isolated
browser libp2p harness so one command covers startup, browser APIs, MCP Control,
and capability-constrained states.

## Validation

```bash
node scripts/run_playwright_test.mjs test -c build-tools/configs/playwright.browser-smoke.config.ts
```

The config starts two local Vite servers:

- SwissKnife web desktop via `build-tools/configs/vite.web.config.ts`.
- Browser libp2p harness via `build-tools/configs/vite.libp2p-browser-harness.config.ts`.

Both servers run with `CHOKIDAR_USEPOLLING=true` in this matrix so the smoke
command does not depend on host inotify watcher capacity.

The Playwright projects are:

| Project | Viewport / profile | Evidence role |
| --- | --- | --- |
| `browser-smoke-desktop-chromium` | Desktop Chrome, 1366x768 | Desktop startup, storage and worker APIs, MCP Control lazy loading, libp2p-capable state |
| `browser-smoke-mobile-pixel-5` | Playwright Pixel 5 profile | Mobile startup, storage and worker APIs, MCP Control lazy loading, libp2p-capable state |
| `browser-smoke-constrained-chromium` | Desktop Chrome, 1024x640 | Constrained libp2p capability state with forced missing optional packages |

## Coverage

`test/e2e/browser-smoke-matrix.spec.ts` records:

- Desktop and mobile viewport startup of the real web desktop.
- Storage availability: `localStorage`, `sessionStorage`, IndexedDB,
  CacheStorage, StorageManager estimate, and OPFS status when available.
- Worker availability through an actual blob `Worker` round trip.
- MCP Control dashboard launch from the desktop icon.
- Browser-safe app lazy loading: `mcp-control.js` is not requested before the
  app is opened, then is requested when the dashboard launches.
- Runtime and source-level host leakage checks for Node-only modules and APIs.
- libp2p-capable state with all default browser capabilities configured.
- libp2p-constrained state with deterministic gaps for WebRTC, circuit relay,
  and GossipSub while unrelated capabilities remain configured.

## Artifacts

Each run writes:

- `test-results/browser-smoke-matrix/results.json` - Playwright JSON report.
- `test-results/browser-smoke-matrix/screenshots/*.png` - startup, MCP dashboard,
  and libp2p capability screenshots per project.
- `test-results/browser-smoke-matrix/*.{json}` - SWR-043 receipts with viewport,
  storage, worker, lazy-loading, capability, and host-leakage evidence.
- `test-results/browser-smoke-matrix/playwright-artifacts/` - retained traces,
  screenshots, and videos on failure.

The generated receipt schema is
`swr_043_browser_smoke_matrix_receipt_v1`; each receipt includes the project
name, timestamp, evidence type, and the exact runtime observations asserted by
the spec.

## Source Boundaries

The smoke matrix relies on:

- `web/js/main-simple.js` for the production browser desktop entrypoint and
  dynamic app imports.
- `web/js/apps/mcp-control.js` for MCP dashboard rendering and the libp2p default
  capability panel.
- `src/services/mcp/libp2p-browser-runtime.ts` for browser libp2p capability
  resolution without host-module fallbacks.
- `test/e2e/fixtures/libp2p-browser-harness/` for deterministic capable and
  constrained browser-libp2p scenarios.

The test intentionally does not execute host daemon command text. MCP Control
renders host daemon commands as records only, while browser remotes are the only
entries represented as browser-connectable endpoints.
