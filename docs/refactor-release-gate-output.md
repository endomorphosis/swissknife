# SwissKnife Refactor Release Gate Output

Generated: 2026-07-08T18:12:36.164Z
Overall status: pass

## Service source audit

- ID: service_source_audit
- Command: `npm run services:audit`
- Status: pass
- Exit code: 0
- Duration: 350 ms
- Required output: docs/service-source-audit.json
- Required output exists: true

### stdout

```text

> swissknife@0.0.53 services:audit
> node scripts/audit-service-boundaries.mjs --fail-on-forbidden

Service source audit: pass
Audited 330 service files.
Wrote docs/service-source-audit.json
Wrote docs/service-source-audit.md
```

### stderr

```text
(empty)
```

## Source module boundary audit

- ID: source_module_audit
- Command: `npm run audit:module-boundary`
- Status: pass
- Exit code: 0
- Duration: 532 ms
- Required output: docs/service-boundary-audit.json
- Required output exists: true

### stdout

```text

> swissknife@0.0.53 audit:module-boundary
> node scripts/audit-source-modules.mjs --fail-on-unknown --fail-on-forbidden

Source module audit: pass
Audited 791 source files and 311 source import edges.
Wrote docs/service-boundary-audit.json
Wrote docs/source-module-boundaries.md
```

### stderr

```text
(empty)
```

## Browser TypeScript typecheck

- ID: browser_typecheck
- Command: `npm run typecheck:browser`
- Status: pass
- Exit code: 0
- Duration: 3648 ms

### stdout

```text

> swissknife@0.0.53 typecheck:browser
> tsc --noEmit -p web/tsconfig.release.json
```

### stderr

```text
(empty)
```

## Browser compatibility test

- ID: browser_compatibility_test
- Command: `npm run test:browser-compat`
- Status: pass
- Exit code: 0
- Duration: 309 ms
- Required output: docs/browser-compatibility-report.json
- Required output exists: true

### stdout

```text

> swissknife@0.0.53 test:browser-compat
> node scripts/test-browser-compat.mjs

PASS required file: web/index.html
PASS required file: web/js/main-simple.js
PASS required file: web/js/core/swissknife-core.js
PASS required file: vite.web.config.ts
PASS required file: web/tsconfig.json
PASS index has viewport meta
PASS index loads browser module entry
PASS desktop app registered: terminal
PASS desktop app registered: ai-chat
PASS desktop app registered: file-manager
PASS desktop app registered: task-manager
PASS desktop app registered: model-browser
PASS desktop app registered: ipfs-explorer
PASS desktop app registered: mcp-control
PASS desktop app registered: p2p-network
PASS desktop app registered: p2p-chat-unified
PASS vite web base is relative
PASS vite web target is es2020
PASS vite web aliases browser polyfills
PASS web source excludes host-only node APIs
Wrote docs/browser-compatibility-report.json
```

### stderr

```text
(empty)
```

## Web build

- ID: web_build
- Command: `npm run build:web`
- Status: pass
- Exit code: 0
- Duration: 2358 ms
- Required output: dist/index.html
- Required output exists: true

### stdout

```text

> swissknife@0.0.53 build:web
> vite build --config vite.web.config.ts

vite v7.3.6 building client environment for production...
transforming...
✓ 58 modules transformed.
rendering chunks...
computing gzip size...
../dist/assets/favicon-c6ccp5z9.ico                   0.01 kB
../dist/assets/navi-icon--4zhKvv7.png                10.90 kB
../dist/index.html                                   17.51 kB │ gzip:  3.10 kB
../dist/assets/index-lX1cMv4V.css                   237.01 kB │ gzip: 38.57 kB
../dist/assets/vibecode-D0wbqg_z.js                  13.07 kB │ gzip:  3.72 kB
../dist/assets/music-studio--P-Otwmv.js              13.78 kB │ gzip:  3.85 kB
../dist/assets/todo-CYdVt4P9.js                      18.50 kB │ gzip:  4.30 kB
../dist/assets/settings-BfTepxfi.js                  19.76 kB │ gzip:  4.08 kB
../dist/assets/p2p-chat-unified-CXzE0BPr.js          20.00 kB │ gzip:  4.84 kB
../dist/assets/cinema-D71-COLf.js                    21.44 kB │ gzip:  5.18 kB
../dist/assets/p2p-chat-BKRNT_gM.js                  27.55 kB │ gzip:  6.06 kB
../dist/assets/terminal-DCkEMWWa.js                  27.86 kB │ gzip:  7.56 kB
../dist/assets/strudel-grandma-BLTjt66H.js           28.15 kB │ gzip:  7.06 kB
../dist/assets/clock-DTEI821Q.js                     29.45 kB │ gzip:  5.84 kB
../dist/assets/calendar-C9boqXjM.js                  29.49 kB │ gzip:  6.44 kB
../dist/assets/task-manager-Dw1XCIVR.js              29.97 kB │ gzip:  6.96 kB
../dist/assets/navi-BzJUTMhn.js                      30.44 kB │ gzip:  8.36 kB
../dist/assets/openrouter-X6isg24m.js                30.94 kB │ gzip:  6.03 kB
../dist/assets/neural-network-designer-DbHPmSiZ.js   32.09 kB │ gzip:  7.76 kB
../dist/assets/oauth-login-BIBz_IGK.js               32.29 kB │ gzip:  7.33 kB
../dist/assets/media-player-Dog2xcOh.js              32.99 kB │ gzip:  7.45 kB
../dist/assets/peertube-I9ShmDKZ.js                  33.21 kB │ gzip:  6.79 kB
../dist/assets/notes-DRk3rS59.js                     33.64 kB │ gzip:  8.05 kB
../dist/assets/model-browser-QPSo-nha.js             33.69 kB │ gzip:  8.15 kB
../dist/assets/ai-chat-DIGU9k4f.js                   34.31 kB │ gzip:  7.39 kB
../dist/assets/device-manager-BNnL1EZ0.js            34.69 kB │ gzip:  7.77 kB
../dist/assets/music-studio-unified-D96Hde8p.js      35.03 kB │ gzip:  7.29 kB
../dist/assets/github-C7z4FcBm.js                    35.65 kB │ gzip:  6.69 kB
../dist/assets/cron-BZ7azz3_.js                      35.75 kB │ gzip:  8.29 kB
../dist/assets/image-viewer-DBuvJ1x3.js              37.57 kB │ gzip:  7.49 kB
../dist/assets/system-monitor-DV0YDtb-.js            39.67 kB │ gzip:  8.06 kB
../dist/assets/api-keys-BudxLkI9.js                  42.03 kB │ gzip:  8.72 kB
../dist/assets/huggingface-kNxMl9sf.js               42.38 kB │ gzip:  6.54 kB
../dist/assets/calculator-DxXtFSyX.js                43.18 kB │ gzip:  6.58 kB
../dist/assets/strudel-ai-daw-CVsR4bfE.js            48.67 kB │ gzip: 12.30 kB
../dist/assets/training-manager-BbPciXRM.js          49.87 kB │ gzip: 10.62 kB
../dist/assets/index-DmVfrOm2.js                     52.29 kB │ gzip: 11.65 kB
../dist/assets/ipfs-explorer-BI78ByE9.js             52.92 kB │ gzip: 11.89 kB
../dist/assets/friends-list-CJhCm1zv.js              53.16 kB │ gzip: 11.62 kB
../dist/assets/mcp-control-DC3Pbf6p.js               57.19 kB │ gzip: 11.01 kB
../dist/assets/neural-photoshop-DFGyHC_i.js          66.89 kB │ gzip: 14.63 kB
../dist/assets/file-manager-vsY99IO3.js              67.50 kB │ gzip: 14.49 kB
../dist/assets/p2p-network-iaAJOubo.js               90.21 kB │ gzip: 15.83 kB
✓ built in 1.78s
```

### stderr

```text
(empty)
```

## Web bundle audit

- ID: web_bundle_audit
- Command: `npm run bundle:audit:web`
- Status: pass
- Exit code: 0
- Duration: 323 ms
- Required outputs: docs/browser-bundle-budget.json, docs/browser-bundle-budget.md, docs/browser-python-policy.md
- Required output exists: true

### stdout

```text

> swissknife@0.0.53 bundle:audit:web
> node scripts/audit-web-bundle.mjs --fail-on-host-leakage --fail-on-default-pyodide

Browser bundle audit: pass
Audited 43 built assets from dist.
Wrote docs/browser-bundle-budget.json
Wrote docs/browser-bundle-budget.md
```

### stderr

```text
(empty)
```

## Evidence freshness check

- ID: evidence_freshness
- Command: `npm run evidence:freshness:check`
- Status: pass
- Exit code: 0
- Duration: 254 ms
- Required output: docs/release-evidence-freshness.json
- Required output exists: true

### stdout

```text

> swissknife@0.0.53 evidence:freshness:check
> node scripts/audit-release-evidence-freshness.mjs --fail-on-stale

PASS libp2p_playwright_results test-results/libp2p-browser/results.json
PASS libp2p_desktop_receipt test-results/libp2p-browser/evidence-libp2p-browser-desktop-chromium.json
PASS libp2p_mobile_receipt test-results/libp2p-browser/evidence-libp2p-browser-mobile-pixel-5.json
PASS virtual_desktop_release_evidence test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json
Wrote docs/release-evidence-freshness.json
```

### stderr

```text
(empty)
```
