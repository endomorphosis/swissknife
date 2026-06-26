# Meta Glasses I/O Playwright Coverage

MGW-372 adds a hardware-free Playwright gate for Swissknife applications that use
Meta glasses I/O. The gate lives in
`test/e2e/meta-glasses-io-apps.spec.ts` and runs with the root
`playwright.config.ts`.

MGW-422 extends that browser coverage with
`test/e2e/meta-glasses-expanded-io.spec.ts`. The expanded spec opens one
Swissknife app harness that exercises camera, microphone route,
speaker/headphone route, display, Meta Neural Band, captouch, motion/orientation,
phone GPS, bridge-route metadata, and control-plane receipts together.

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

The expanded MGW-422 spec additionally verifies:

- ArrowRight Neural Band input and Enter captouch input are bound to visible app
  actions
- permission denial does not emit a control-plane handoff
- content-addressed references are shown for allowed camera, video, audio,
  display, motion, and GPS samples
- raw audio and raw display pixels are absent from the browser-visible payload
  references
- MCP++ receipts are rendered for camera, microphone, headphones, display,
  Neural Band, captouch, and display lifecycle events
- an unauthorized control-plane handoff attempt is blocked and produces only a
  blocked-handoff receipt

## Running

```bash
cd swissknife
npx playwright test test/e2e/meta-glasses-io-apps.spec.ts --config=playwright.config.ts
npx playwright test test/e2e/meta-glasses-expanded-io.spec.ts --config=playwright.config.ts
```

The config is intentionally scoped to the Meta glasses I/O Playwright specs and
does not start Vite. The specs build their own in-page harnesses from checked-in
fixtures so CI can validate Meta glasses I/O routes without hardware.
