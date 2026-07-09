# Browser libp2p Bootstrap and Relay Matrix (SWR-047)

This document records the browser libp2p bootstrap and relay matrix added for
SWR-047. The evidence is generated from the real browser runtime in
`src/services/mcp/libp2p-browser-runtime.ts` through the Vite/Playwright harness
in `test/e2e/fixtures/libp2p-browser-harness`.

## Runtime Contract

`buildBrowserLibp2pConfig()` now returns `report.bootstrap` with schema
`swissknife.browser_libp2p_bootstrap_report.v1`. The report includes:

- `transportMode`: `default`, `relay-only`, or `websocket-only`.
- `listenMultiaddrs`: the browser listen addresses passed to libp2p.
- `bootstrapPeers`: the configured bootstrap or relay peer multiaddrs.
- `relayOnlyFallback`, `webRTCUnavailable`, `webSocketOnly`, and
  `gossipSubAvailable` booleans.
- capability summaries for WebRTC, WebSockets, circuit relay v2, and GossipSub.
- `capabilityGaps`: explicit package/export failures from optional libp2p
  modules.
- `simulatedTransports: false`, documenting that the runtime did not install a
  fake transport when a capability is missing.

Bootstrap peer discovery via `@libp2p/bootstrap` is not enabled in this repo
because that package is not currently a dependency. The matrix therefore records
the browser bootstrap/relay multiaddr policy separately from libp2p transport
assembly, without adding unknown config keys to `createLibp2p()`.

## Matrix

| Scenario | Query | Expected browser behavior |
| --- | --- | --- |
| Default bootstrap behavior | `/` | WebRTC listen address `/webrtc` is configured. WebSockets and circuit relay v2 are also configured for outbound relay/bootstrap paths. The default bootstrap peer list contains a circuit-relay multiaddr. GossipSub is available as `services.pubsub`. |
| Relay-only fallback | `?scenario=relay-only` | WebRTC is not requested. WebSockets and circuit relay v2 are configured, listen multiaddrs are `["/p2p-circuit"]`, and `relayOnlyFallback` is true. A reachable relay is still required for successful relay reservation. |
| WebRTC unavailable mode | `?scenario=missing-webrtc` | `@libp2p/webrtc` is resolved through the real browser import path and reported as an explicit `webrtc` capability gap. The runtime does not add a substitute transport, so the default `/webrtc` listen attempt fails. |
| WebSocket-only mode | `?scenario=websocket-only` | Only the real WebSockets transport is requested among browser transports. WebRTC and circuit relay v2 are not requested, listen multiaddrs are empty, and bootstrap peers are direct WSS multiaddrs. |
| GossipSub availability | `/` | `@chainsafe/libp2p-gossipsub` is imported and configured as the `pubsub` service. `gossipSubAvailable` is true. |
| Multiple capability gaps | `?scenario=missing-multiple` | WebRTC, circuit relay v2, and GossipSub are independently reported as missing. WebSockets remains configured, and `simulatedTransports` remains false. |

## Evidence

Run the matrix with:

```sh
cd swissknife
node scripts/run_playwright_test.mjs test -c build-tools/configs/playwright.libp2p-browser.config.ts --grep "bootstrap|relay|capability"
```

The command runs `test/e2e/libp2p-bootstrap-matrix.spec.ts` across the desktop
Chromium and mobile Pixel 5 projects, alongside the existing libp2p browser
evidence tests matched by the grep. Matrix receipts are written to:

```text
test-results/libp2p-browser/bootstrap-matrix/*.json
```

Each receipt uses schema
`swr_047_browser_libp2p_bootstrap_matrix_receipt_v1` and includes the project,
scenario, initialization status, bootstrap report, capability gaps, and rendered
capability rows captured from the browser page.

## Non-Simulation Guarantee

The runtime only imports real libp2p browser packages:

- `@libp2p/webrtc`
- `@libp2p/websockets`
- `@libp2p/circuit-relay-v2`
- `@chainsafe/libp2p-noise`
- `@chainsafe/libp2p-yamux`
- `@libp2p/identify`
- `@chainsafe/libp2p-gossipsub`

If an optional package is absent or deliberately unavailable in a matrix
scenario, the runtime records a capability gap and omits that capability from
the libp2p config. It does not create local stand-ins for missing browser
transports.
