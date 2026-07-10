# Release Readiness Report

Generated: 2026-07-10T05:27:41.861Z
Commit: 8af6e6ac9a0ccd66f320bbf79c9620276c20da76
Overall status: ❌ FAILED
Duration: 25.5s

| Gate | Status | Duration |
| --- | --- | --- |
| Service-boundary audit (services:audit) | ✅ passed | 0.8s |
| Repository module-boundary audit (audit:module-boundary) | ✅ passed | 0.7s |
| TypeScript project typecheck (typecheck) | ✅ passed | 5.2s |
| Fast unit test lane (test:fast) | ✅ passed | 3.9s |
| Browser compatibility lane (test:browser-compat) | ✅ passed | 7.8s |
| Web bundle build + host-leakage/budget audit (build:web) | ❌ failed | 7.2s |

## Virtual Desktop Release Evidence

Path: `test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json`
Decision: `go`
Representative decision: `go`
All-tools decision: `go`
Blockers: 0
Warnings: 3

### Hierarchical MCP

Release gate decision: `go`
Evidence decision: `go`
Services live: 0 / 3
Expected live services: none
Full facade services: 0 / 3
Dispatch probes: 0 / 0
Direct-only descriptors: 0
Unexplained flat hierarchy gaps: 0
Stale live-service expectations ignored: 12

Release evidence warnings:
- Ignored 12 stale live-service expectations older than the hierarchical evidence batch: ipfs_kit_py from service_health.summary.available, ipfs_datasets_py from service_health.summary.available, ipfs_accelerate_py from service_health.summary.available, ipfs_kit_py from service_health.services, ipfs_datasets_py from service_health.services, ipfs_accelerate_py from service_health.services.
- Hierarchical MCP evidence warning: Only 0/3 configured MCP services responded; set HIERARCHICAL_MCP_REQUIRE_LIVE=1 to make endpoint availability a hard validation failure.
- Hierarchical MCP evidence observed 0/3 configured services live.

## Package export browser leakage

### Web bundle build + host-leakage/budget audit (build:web)

```
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
../dist/assets/strudel-ai-daw-DRJqdvZl.js            48.67 kB │ gzip: 12.29 kB
../dist/assets/training-manager-BbPciXRM.js          49.87 kB │ gzip: 10.62 kB
../dist/assets/index-CzrfZta-.js                     52.50 kB │ gzip: 11.77 kB
../dist/assets/ipfs-explorer-BI78ByE9.js             52.92 kB │ gzip: 11.89 kB
../dist/assets/friends-list-CJhCm1zv.js              53.16 kB │ gzip: 11.62 kB
../dist/assets/neural-photoshop-DFGyHC_i.js          66.89 kB │ gzip: 14.63 kB
../dist/assets/file-manager-vsY99IO3.js              67.50 kB │ gzip: 14.49 kB
../dist/assets/mcp-control-DvGeqCdr.js               70.81 kB │ gzip: 14.35 kB
../dist/assets/p2p-network-CoGl4ID_.js               97.03 kB │ gzip: 17.69 kB
✓ built in 1.80s
> swissknife@0.0.53 bundle:audit:web
> node scripts/audit-web-bundle.mjs --dist dist --report docs/browser-bundle-budget.md --json docs/browser-bundle-budget.json --fail-on-host-leakage --fail-on-default-pyodide && node scripts/audit-release-evidence-freshness.mjs --update browser-bundle-budget --json docs/release-evidence-freshness.json --report docs/release-evidence-freshness.md
Audited 48 web bundle files (1.68 MiB raw, 368.4 KiB gzip).
libp2p: 8 chunk(s), 328.2 KiB raw.
host leakage: 0; Python/Pyodide exposure: 17; default Pyodide: 0.
FAIL: bundle budgets exceeded: libp2pRawBytes
```

