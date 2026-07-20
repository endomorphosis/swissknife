# Release Reproduction Attestation

Generated: 2026-07-20T08:10:40.345Z
Task: SWR-141
Commit: `9252e108bf10b80593adc3e36b441b75affe51b3`
Lockfile SHA-256: `584a3304603b208797b50faee86f00f5a6fe987d2289f382ae4f7b93a62dbc21`
Release decision: **GO**

## Provenance

Parent repository commit: `f07416ad1e801ac2e3fca3235f5af5ad6a218c8c`
Parent gitlink SHA: `9252e108bf10b80593adc3e36b441b75affe51b3`
Parent gitlink source: index
Parent gitlink matches checkout: yes
Detached checkout: no
Checkout policy: attached-release-branch (attached release branch automation/swissknife-refactor-integration is accepted for SWR-162 mainline integration validation)
Pre-run local status entries: 0
Source tree SHA: `09c604fbfb9673f50549e40df4849b9a1241fc93`
Tracked content fingerprint: `f26330d7c95584d62cdef61728b76d2f95ae540efb80da578d3ff938aae98239`

## Tool Versions

Node: `v22.23.1`
npm: `10.9.8`
Git: `git version 2.43.0`
Platform: `Linux 6.8.0-134-generic x64`

## Browser Evidence

Browser projects: chromium, firefox, webkit
libp2p profile receipt decision: `GO`
libp2p desktop paths: 22
Proof runtime outcome: `passed`
Proof runtime assertions: 81

## Clean Checkout Reproduction

Status: `passed`
Commit: `9252e108bf10b80593adc3e36b441b75affe51b3`
Failure reason: none
Commands: git clone --no-hardlinks --no-checkout /home/barberb/barberb/copilot-worktrees/lift_coding/hallucinate-llc-psychic-adventure-swissknife-refactor-integration/swissknife /tmp/swissknife-release-reproduction-Qh5KHW/swissknife=ok, git checkout --detach 9252e108bf10b80593adc3e36b441b75affe51b3=ok, git clean -ffdX=ok, npm ci=ok, npm run release:readiness=ok

## Freshness

| Evidence group | Blocking | Status | Current fingerprint |
| --- | --- | --- | --- |
| libp2p-browser-playwright | no | fresh | `4c2088af81490904af0404cee1c968b583f068fc2917951e53fdbc9dbdaf7483` |
| browser-bundle-budget | no | fresh | `d42626e0928351de4212de3f1ee75e2fef7e398a68ba75a24688efebb29e6d05` |
| module-boundary-audit | no | fresh | `bf7063cb61a0ea8fcf39ab29b2e1f27e7b02f512f210298b4a1c3b742d49f6e3` |
| virtual-desktop-release-evidence | yes | fresh | `0f1dea9cf2ec7cd291279e44de64d7d395a9708a0f2c81c6b642c9bb918a2d13` |

## Output Hashes

| Output | Status | SHA-256 |
| --- | --- | --- |
| `docs/release-evidence-freshness.json` | present | `ba0232764e51205d2ff8b5ca9d06ed0531ae0004e49975388ae5aa8953e4a4af` |
| `docs/release-readiness-report.json` | present | `dfb82a91625e136cb27207737679543fcb663640794c089c6906037faea659fb` |

Attestation JSON canonical payload SHA-256: `c779886af20846131d077183f9564c40ca491c7f320fb8f7b231c8eec335f179`
The attestation JSON self-hash is computed with its own output hash and canonical hash fields set to null.

## Decision Findings

No blocking findings.
