# Release Readiness Report

Generated: 2026-07-10T05:42:20.526Z
Commit: 8af6e6ac9a0ccd66f320bbf79c9620276c20da76
Overall status: ❌ FAILED
Duration: 25.2s

| Gate | Status | Duration |
| --- | --- | --- |
| Service-boundary audit (services:audit) | ✅ passed | 0.7s |
| Repository module-boundary audit (audit:module-boundary) | ✅ passed | 0.6s |
| TypeScript project typecheck (typecheck) | ✅ passed | 5.0s |
| Fast unit test lane (test:fast) | ✅ passed | 4.0s |
| Browser compatibility lane (test:browser-compat) | ✅ passed | 7.7s |
| Web bundle build + host-leakage/budget audit (build:web) | ❌ failed | 7.2s |

## Virtual Desktop Release Evidence

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
../dist/assets/strudel-ai-daw-B6CQf7mq.js            48.67 kB │ gzip: 12.30 kB
../dist/assets/training-manager-BbPciXRM.js          49.87 kB │ gzip: 10.62 kB
../dist/assets/index-CF9Z65rD.js                     52.50 kB │ gzip: 11.77 kB
../dist/assets/ipfs-explorer-BI78ByE9.js             52.92 kB │ gzip: 11.89 kB
../dist/assets/friends-list-CJhCm1zv.js              53.16 kB │ gzip: 11.62 kB
../dist/assets/neural-photoshop-DFGyHC_i.js          66.89 kB │ gzip: 14.63 kB
../dist/assets/file-manager-vsY99IO3.js              67.50 kB │ gzip: 14.49 kB
../dist/assets/mcp-control-DBsKWBy7.js               70.81 kB │ gzip: 14.35 kB
../dist/assets/p2p-network-DhwQmoGt.js               97.03 kB │ gzip: 17.69 kB
✓ built in 2.03s
> swissknife@0.0.53 bundle:audit:web
> node scripts/audit-web-bundle.mjs --dist dist --report docs/browser-bundle-budget.md --json docs/browser-bundle-budget.json --fail-on-host-leakage --fail-on-default-pyodide && node scripts/audit-release-evidence-freshness.mjs --update browser-bundle-budget --json docs/release-evidence-freshness.json --report docs/release-evidence-freshness.md
Audited 48 web bundle files (1.68 MiB raw, 368.4 KiB gzip).
libp2p: 8 chunk(s), 328.1 KiB raw.
host leakage: 0; Python/Pyodide exposure: 17; default Pyodide: 0.
FAIL: bundle budgets exceeded: libp2pRawBytes
```

