# Browser libp2p Playwright Evidence (SWR-028)

This document records the Playwright evidence gathered for **SWR-028 — Add
browser libp2p Playwright evidence**, which depends on SWR-015 (browser libp2p
bootstrap hardening) and SWR-016 (libp2p/browser bundle budget tracking).

## What is exercised

Unlike the unit tests in `test/mcp-plus-plus/mcp-transport-libp2p-runtime.test.ts`
(which inject a fully mocked `importModule`), this evidence runs the **real**
production browser modules inside a **real** browser engine (Chromium, via
Playwright), with real installed npm packages:

- `src/services/mcp/libp2p-browser-runtime.ts` — `buildBrowserLibp2pConfig`,
  `createBrowserLibp2pNode`, `summarizeBrowserLibp2pGaps`.
- `src/services/mcp/mcp-p2p-session.ts` — the real `MCPp2pSession` state
  machine (idle → handshaking → open/error/closed), driven through a scripted
  (but real, framed, JSON-RPC) transport stream so the evidence is
  deterministic and does not depend on external network reachability.

The harness lives at `test/e2e/fixtures/libp2p-browser-harness/` (`index.html`
+ `harness.ts`) and is served by a dedicated Vite dev server config,
`build-tools/configs/vite.libp2p-browser-harness.config.ts`. Playwright drives
it via `build-tools/configs/playwright.libp2p-browser.config.ts` and
`test/e2e/libp2p-browser.spec.ts`, across two projects:

- `libp2p-browser-desktop-chromium` (1280×800 desktop viewport)
- `libp2p-browser-mobile-pixel-5` (393×727 mobile viewport, Playwright's
  `Pixel 5` device profile)

The harness's responsive layout switches from a two-column grid to a
single-column stack below 600px width; `body[data-layout]` reflects the active
layout and is asserted directly in the desktop and mobile runs.

### A note on dynamic imports in Vite

`libp2p-browser-runtime.ts`'s default `importModule` resolves optional
packages with `import(/* @vite-ignore */ specifier)`, where `specifier` is a
runtime variable. Real browsers cannot resolve bare module specifiers this way
without an import map, so a literal-string `import('@some/package')` is
required for Vite to statically resolve and serve an installed package. The
harness's `importModule` override therefore dispatches known package names to
literal `import()` calls (so installed packages load for real) and falls back
to the variable-specifier form only for packages that are genuinely absent or
deliberately forced "missing" by a scenario — which deterministically
reproduces the same "package unavailable" signal production code encounters.

## Dependency fix required for real evidence

Capturing real initialization evidence surfaced a genuine version mismatch:
`@libp2p/webrtc@^4.1.10` (and the `libp2p@1.9.4` core) require
`@libp2p/identify@^2.1.5` for its browser transport dependency-capability
checks, but `package.json` pinned `@libp2p/identify@^1.0.21` — a version that
predates the `serviceCapabilities`/`serviceDependencies` symbols the transport
dependency check relies on. Constructing a real `Libp2pNode` with the old
`@libp2p/identify` failed with:

```
CodeError: Service "@libp2p/webrtc" required capability "@libp2p/identify" but
it was not provided by any component
```

This was invisible to the existing SWR-015/SWR-016 unit tests because they use
a fully mocked `importModule` and never construct a real `Libp2pNode`. This
task bumped `@libp2p/identify` to `^2.1.5` in `package.json`
(`optionalDependencies`), which resolves cleanly and keeps
`npm run test:run -- test/mcp-plus-plus/mcp-transport-libp2p-runtime.test.ts
test/mcp-plus-plus/wasm-prover-browser-purity.test.ts` and
`npm run build:web && node scripts/audit-web-bundle.mjs ...` (the SWR-015/016
validation commands) green, with the libp2p bundle budget unchanged
(103.9 KiB raw / 3 chunks).

## Scenarios captured

| Scenario (`?scenario=`, or dedicated query) | What it proves |
| --- | --- |
| `available` (default) | Real `createLibp2p` node construction and `start()` succeed with all 7 optional capabilities (webrtc, websockets, circuit-relay-v2, noise, yamux, identify, gossipsub) installed and configured, with zero capability gaps. A real `peerId` is generated. |
| `missing-webrtc` | `@libp2p/webrtc` is forced unavailable. The runtime reports a real capability gap (`gap-webrtc`) instead of silently substituting a fake transport; the remaining capabilities stay real, installed, and configured. The default `/webrtc` listen multiaddr then has no matching transport, so the node start attempt fails — a real, deterministic consequence, not a harness bug. |
| `missing-multiple` | `@libp2p/webrtc`, `@libp2p/circuit-relay-v2`, and gossipsub (both `@libp2p/gossipsub` and its `@chainsafe/libp2p-gossipsub` fallback) are all forced unavailable simultaneously and reported as independent gaps. |
| `disabled` | `enabled: false` is passed through; the runtime reports `capabilities: []`, `gaps: []`, and no node is constructed at all. |
| Peer discovery (`@libp2p/mdns`, `@libp2p/kad-dht`) | These packages are genuinely absent from this repository's dependency tree (not simulated). The harness reports real `unavailable` gaps for both, mirroring the same optional-package pattern `MCPDiscovery.start()` uses in `mcp-discovery.ts`. |
| `relayListen=true` (+ `relay=`, `bootstrap=`) | The relay/bootstrap configuration panel renders the configured listen multiaddrs (including `/p2p-circuit`), the rendezvous/relay multiaddr, and the bootstrap/circuit-relay peer list — all sourced from URL query overrides, not hardcoded. Because no relay peer is actually reachable in this CI-safe run, the real circuit-relay-v2 transport fails to reserve a listen slot (`Transport (@libp2p/circuit-relay-v2-transport) could not listen on any available address`) — genuine evidence of what relay/bootstrap configuration requires in practice, with zero capability gaps (every package is installed; only the network-dependent listen attempt fails). |
| `p2p=success` | A real `MCPp2pSession` completes the MCP `initialize` handshake end-to-end (framing, JSON-RPC correlation, capability negotiation) against a scripted relay peer, reaching `open` state with negotiated `mcp++/*` profiles. |
| `p2p=error` | The scripted peer returns a JSON-RPC error during handshake; the session reaches `error` state with the real rejection message. |
| `p2p=timeout` | The scripted peer never responds; the harness's bounded race times out, reaching `error` state with a timeout message — proving the UI does not hang indefinitely on an unreachable relay. |

## Running the evidence

```
cd swissknife
node scripts/run_playwright_test.mjs test -c build-tools/configs/playwright.libp2p-browser.config.ts
```

This starts the dedicated Vite dev server
(`vite.libp2p-browser-harness.config.ts`), runs all scenarios across both
desktop and mobile projects (24 tests total), and writes:

- `test-results/libp2p-browser/results.json` — Playwright JSON report.
- `test-results/libp2p-browser/screenshots/*.png` — full-page screenshots per
  scenario, per project (available/missing-webrtc/relay-bootstrap-config/
  p2p-success/p2p-error/viewport-desktop/viewport-mobile).
- `test-results/libp2p-browser/evidence-*.json` — an aggregated evidence
  receipt per project (`swr_028_browser_libp2p_evidence_receipt_v1`).
- `test-results/libp2p-browser/playwright-artifacts/` — traces/videos on
  failure (`retain-on-failure`).

## Example captured evidence (desktop project, `available` scenario)

```json
{
  "schema": "swr_028_browser_libp2p_evidence_receipt_v1",
  "task_id": "SWR-028",
  "depends_on": ["SWR-015", "SWR-016"],
  "project": "libp2p-browser-desktop-chromium",
  "viewport": { "width": 1280, "height": 800 },
  "layout": "desktop",
  "initStatus": "started",
  "initDetail": "peerId=12D3KooWCNqFhFhbva2x8VyWgKi5qTQnLnJCnpaF1DpNRYYjacMw\nlisten multiaddrs=[\"/webrtc\"]\nadvertised addrs=[]",
  "capabilities": [
    "webrtc: installed=true configured=true (@libp2p/webrtc)",
    "websockets: installed=true configured=true (@libp2p/websockets)",
    "circuit-relay-v2: installed=true configured=true (@libp2p/circuit-relay-v2)",
    "noise: installed=true configured=true (@chainsafe/libp2p-noise)",
    "yamux: installed=true configured=true (@chainsafe/libp2p-yamux)",
    "identify: installed=true configured=true (@libp2p/identify)",
    "gossipsub: installed=true configured=true (@chainsafe/libp2p-gossipsub)"
  ],
  "discovery": [
    "mdns (@libp2p/mdns): unavailable — Failed to resolve module specifier '@libp2p/mdns'",
    "kad-dht (@libp2p/kad-dht): unavailable — Failed to resolve module specifier '@libp2p/kad-dht'"
  ],
  "p2pStatus": "open",
  "p2pDetail": "Connected to swissknife-libp2p-harness-relay (protocol 2024-11-05)\nnegotiated profiles: mcp++/cid-envelope, mcp++/ucan, mcp++/idl, mcp++/event-dag, mcp++/policy-d, mcp++/pubsub-bus, mcp++/p2p-transport"
}
```

The mobile project (`libp2p-browser-mobile-pixel-5`, 393×727) produces the
same structural evidence with `layout: "mobile"` and a distinct real `peerId`,
confirming parity across viewports.

## Files

- `test/e2e/fixtures/libp2p-browser-harness/index.html` — harness page and
  responsive layout.
- `test/e2e/fixtures/libp2p-browser-harness/harness.ts` — harness logic
  (real runtime calls, scenario parsing, DOM rendering).
- `build-tools/configs/vite.libp2p-browser-harness.config.ts` — isolated Vite
  dev server for the harness.
- `build-tools/configs/playwright.libp2p-browser.config.ts` — desktop +
  mobile Playwright project matrix and `test-results/libp2p-browser` reporter
  wiring.
- `test/e2e/libp2p-browser.spec.ts` — the Playwright specs described above.
- `scripts/run_playwright_test.mjs` — extended to allocate a stable, isolated
  dev-server port for this config (`SWISSKNIFE_LIBP2P_BROWSER_E2E_PORT`),
  mirroring the existing meta-glasses port allocation pattern.
- `package.json` — adds `npm run test:e2e:libp2p-browser` and bumps
  `@libp2p/identify` to `^2.1.5`.
