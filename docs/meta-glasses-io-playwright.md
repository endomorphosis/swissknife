# Meta Glasses I/O Playwright Coverage

MGW-372 adds a hardware-free Playwright gate for Swissknife applications that use
Meta glasses I/O. The gate lives in
`test/e2e/meta-glasses-io-apps.spec.ts` and runs with the root
`playwright.config.ts`.

## What It Covers

The spec opens representative Swissknife app surfaces against deterministic mock
fixtures:

- Capture Review: camera photo and video capture.
- Audio Console: microphone input plus speaker and headphone playback.
- Input Lab: Meta Neural Band, captouch, motion/orientation, and phone GPS.
- Display Diagnostics: Meta display widget rendering.

The browser harness uses:

- `test/fixtures/meta-glasses-io/hardware-free-expanded-io.json` for expanded
  capability readiness, app bindings, permission scopes, samples, receipts, and
  failure modes.
- `test/e2e/fixtures/mgw-519-meta-glasses-control-plane.json` for bridge route
  metadata, libp2p session identifiers, control-plane operations, policy
  outcomes, fallback state, and DAT replay receipts.

No physical glasses, DAT package access, Bluetooth route, camera, microphone, or
GPS device is required.

## Assertions

The tests verify:

- visible app state for each representative Swissknife surface
- app interaction binding IDs and methods for every mocked capability
- camera permission prompt, explicit denial fallback, and granted capture flow
- content-addressed camera, audio, display, and receipt references
- mocked Bluetooth/Wi-Fi bridge route metadata
- libp2p peer/session metadata and MCP++ profile handoff evidence
- Hallucinate App policy handoff text in the rendered browser state
- fallback diagnostics for permission denial, unsupported, degraded, stale,
  route-lost, and recovered states
- receipt display for capability samples, control-plane replay, and recovery
  envelopes

## Running

```bash
cd swissknife
npx playwright test test/e2e/meta-glasses-io-apps.spec.ts --config=playwright.config.ts
```

The config is intentionally scoped to `meta-glasses-io-apps.spec.ts` and does not
start Vite. The spec builds its own in-page harness from checked-in fixtures so
CI can validate Meta glasses I/O routes without hardware.
