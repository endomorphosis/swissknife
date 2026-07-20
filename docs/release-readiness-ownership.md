# Release Readiness Ownership

SWR-160 promotes the SVD-131 cold-start release orchestration to maintained
release code. The producer source of truth is
`scripts/lib/release-readiness-evidence-producers.mjs`; the release gate and
the hermetic architecture test import that manifest directly. The same module
also exports `RELEASE_READINESS_ENTRYPOINT_OWNERSHIP`, which is the source for
the entrypoint decisions below, and `createReleaseEvidenceProducerGateEntries`,
which is the only release-gate producer expansion boundary.

## Owned Entrypoints

| Entrypoint | Owner | Runtime | Audit decision |
| --- | --- | --- | --- |
| `scripts/lib/release-readiness-evidence-producers.mjs` | `release-readiness` | host release library | Authoritative producer manifest for ownership, dependencies, artifact paths, default enablement, and evidence verification. Its validator rejects duplicate artifact ownership, dependency order drift, missing verification, and undocumented entrypoints. No second executable producer list is permitted. |
| `scripts/release-readiness-gate.mjs` | `release-readiness` | host release script | Production gate imports the manifest, runs the manifest ownership preflight, cold-resets only manifest-owned artifacts, enforces dependencies, runs each default-enabled producer, and reports missing or invalid producer evidence. |
| `scripts/lib/release-reproduction-attestation.mjs` | `release-readiness` | host release library | SWR-141 provenance helper that captures clean-checkout reproduction, source fingerprints, evidence fingerprints, output hashes, tool versions, browser projects, transport/proof receipts, and GO/NO_GO blockers. |
| `scripts/capture-refactor-main-reconciliation.cjs` | `release-readiness` | host release script | SWR-162 merge receipt producer. It records the accepted integration commit range, classifies task-attempt/recovery/diagnostic refs, and preserves rejected stale refs without merging them wholesale. |
| `scripts/lib/pick-free-port.mjs` | `release-readiness` | universal helper | Small endpoint lease helper. It only proves this process can bind a candidate port and returns explicit lease ownership metadata; it never reuses, inspects, kills, or masquerades as a foreign listener. |
| `scripts/run-with-owned-port.mjs` | `release-readiness` | host release script | Wrapper exports the leased port to one child command. If the preferred port is occupied, the foreign listener is left untouched and a private verified-free port is used. |
| `build-tools/configs/playwright.live-behavior-proof.config.ts` | `release-readiness` | browser Playwright | Dedicated current-behavior proof config. The spec owns its in-process fixture on an ephemeral port and writes real browser evidence and screenshots. |
| `build-tools/configs/playwright.live-gateway.config.ts` | `release-readiness` | browser Playwright | Dedicated application-originated gateway config. It uses `reuseExistingServer: false`, a strict leased port, and never attaches to an existing foreign dev server. |
| `test/architecture/release-readiness-hermetic.test.ts` | `release-readiness` | architecture test | Hermetic regression coverage imports the production manifest and owned-port helper instead of a task-local producer list. |

## Producer Manifest Decisions

Every producer in `RELEASE_EVIDENCE_PRODUCER_GATES` is default-enabled for
`npm run release:readiness`. Each entry declares:

- stable `id`, owning SVD task, production npm script, and dependencies;
- artifact files and screenshot directories under
  `test-results/virtual-desktop-ipfs-mcp-orb`;
- runtime ownership (`host-release`, `browser-playwright`, or
  `browser-libp2p`);
- JSON/content checks that reject missing, malformed, timestamp-only, copied,
  simulated, or incomplete receipts before the aggregate release evidence runs.

Browser and browser-libp2p producers remain TypeScript/JavaScript or WebAssembly
evidence paths. Python browser imports, copied receipts, simulated peer/proof
success, and compatibility shadow implementations are not accepted by this
boundary.
