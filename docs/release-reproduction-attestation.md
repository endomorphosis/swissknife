# Release Reproduction Attestation

Generated: 2026-07-19T23:32:03.916Z
Task: SWR-141
Commit: `bf8649a1870aa6647015db5cf2e496ede45c408f`
Lockfile SHA-256: `584a3304603b208797b50faee86f00f5a6fe987d2289f382ae4f7b93a62dbc21`
Release decision: **NO_GO**

## Provenance

Parent repository commit: `75b1154385e4c04dcd789d8dd04d638003befd09`
Parent gitlink SHA: `bf8649a1870aa6647015db5cf2e496ede45c408f`
Parent gitlink matches checkout: yes
Detached checkout: no
Pre-run local status entries: 129
Source tree SHA: `c788f852b1f9835fea2f6d2cecf2450623b43a51`
Tracked content fingerprint: `4e9dabf4f56c0f187bf7c7b05e1e946b7b25d42e5b00a1c30c45bf8fad788b66`

## Tool Versions

Node: `v22.23.1`
npm: `10.9.8`
Git: `git version 2.43.0`
Platform: `Linux 6.17.0-35-generic x64`

## Browser Evidence

Browser projects: chromium, firefox, webkit
libp2p profile receipt decision: `GO`
libp2p desktop paths: 22
Proof runtime outcome: `passed`
Proof runtime assertions: 81

## Clean Checkout Reproduction

Status: `failed`
Commit: `bf8649a1870aa6647015db5cf2e496ede45c408f`
Failure reason: npm run release:readiness failed in clean checkout
Commands: git clone --no-hardlinks --no-checkout /home/barberb/barberb/copilot-worktrees/lift_coding/hallucinate-llc-psychic-adventure-swissknife-refactor-integration/swissknife /tmp/swissknife-release-reproduction-ti3NAX/swissknife=ok, git checkout --detach bf8649a1870aa6647015db5cf2e496ede45c408f=ok, git clean -ffdX=ok, npm ci=ok, npm run release:readiness=failed

## Freshness

| Evidence group | Blocking | Status | Current fingerprint |
| --- | --- | --- | --- |
| libp2p-browser-playwright | no | fresh | `4c2088af81490904af0404cee1c968b583f068fc2917951e53fdbc9dbdaf7483` |
| browser-bundle-budget | no | fresh | `3546b55d1a925d8ca73b0b4ea0ec0b0a7ee520c882be3c3a61d4aafed10ab2d5` |
| module-boundary-audit | no | fresh | `1bbe9cc9f84273ef82203cff4dd4e438b4007da84210e94b854e57d335310985` |
| virtual-desktop-release-evidence | yes | fresh | `4143dc06afa5179e3ec2a0ad22ebc12c19573f9b820d3a06395e24a715638f4b` |

## Output Hashes

| Output | Status | SHA-256 |
| --- | --- | --- |
| `docs/release-evidence-freshness.json` | present | `5c898aa0986ed9f1d9d95db1d8dab1d90f8ac3557d1795ea70f7366db20021b4` |
| `docs/release-readiness-report.json` | present | `c943db81815153aa9f7878085dac17cd8b244accd0fe5ac523b8ab2d12dcf5ff` |

Attestation JSON canonical payload SHA-256: `6cf6170da244b72cbbeae9f6946acdfc20fd924cbcd3b8a1ba3d7398bffa0b1c`
The attestation JSON self-hash is computed with its own output hash and canonical hash fields set to null.

## Decision Findings

- not-detached-checkout: release reproduction must run from a detached SwissKnife checkout (branch=automation/swissknife-refactor-integration)
- local-uncommitted-files: SwissKnife worktree had local uncommitted files before release evidence generation (M docs/agent-supervisor-console-evidence.md |  M docs/all-app-live-binding-gap-ledger.md |  M docs/browser-bundle-budget.fingerprint.json |  M docs/browser-bundle-budget.json |  M docs/browser-bundle-budget.md |  M docs/mcp-all-tool-catalog-evidence.md |  M docs/refactor-evidence-maintenance.md |  M docs/refactor-final-signoff.md |  M docs/release-evidence-freshness.json |  M docs/release-evidence-freshness.md |  M docs/release-readiness-report.json |  M docs/release-readiness-report.md |  M docs/restored-service-duplicate-inventory.json |  M docs/restored-service-duplicate-inventory.md |  M docs/service-boundary-audit.fingerprint.json |  M docs/service-boundary-audit.json |  M docs/supervisor-refactor-runbook.md |  M docs/virtual-desktop-all-tools-app-coverage.md |  M docs/virtual-desktop-release-evidence.fingerprint.json |  M docs/virtual-desktop-tool-ui-smoke-evidence.md |  M package.json |  M scripts/audit-release-evidence-freshness.mjs |  M scripts/capture-mcp-live-probe-evidence.cjs |  M scripts/capture-swissknife-all-tools-peer-evidence.cjs |  M scripts/ensure-ipfs-mcp-libp2p-bridges.cjs |  M scripts/lib/pick-free-port.mjs |  M scripts/lib/release-readiness-evidence-producers.mjs |  M scripts/release-readiness-gate.mjs |  M src/services/apps/all-app-live-tool-bindings.ts |  M test-results/browser-proof-runtime/observed-three-engine-runtime.json |  M test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-binding-gap-ledger.json |  M test-results/virtual-desktop-ipfs-mcp-orb/all-app-live-tool-bindings.json |  M test-results/virtual-desktop-ipfs-mcp-orb/all-app-meta-device-simulator.json |  M test-results/virtual-desktop-ipfs-mcp-orb/all-app-orb-idl-action-handoff.json |  M test-results/virtual-desktop-ipfs-mcp-orb/all-app-ui-ux-accessibility.json |  M test-results/virtual-desktop-ipfs-mcp-orb/all-tools-disposition-catalog.json |  M test-results/virtual-desktop-ipfs-mcp-orb/all-tools-release-evidence.md |  M test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json |  M test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/01-accelerate-panel-ipfs-accelerate-py-configured-compat-get-model-details.png |  M test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/02-agent-supervisor-ipfs-accelerate-py-configured-compat-gh-create-workflo.png |  M test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/03-ai-chat-ipfs-accelerate-py-configured-compat-execute-with-payl.png |  D test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/04-api-keys-ipfs-kit-py-configured-get-secrets-manager.png |  M test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/05-calculator-local-calculator.png |  M test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/06-calendar-local-calendar.png |  D test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/07-cinema-ipfs-kit-py-configured-handle-bucket-export-car.png |  M test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/08-clock-local-time.png |  M test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/09-cron-local-scheduler.png |  D test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/10-datasets-browser-ipfs-datasets-py-configured-ai-dataset-builder.png |  M test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/11-device-manager-ipfs-accelerate-py-configured-compat-detect-hardware.png |  M test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/meta-device-simulator/12-file-manager-ipfs-accelerate-py-configured-compat-ipfs-files-add.png)
- clean-checkout-reproduction-failed: clean detached checkout reproduction did not complete successfully (npm run release:readiness failed in clean checkout)
