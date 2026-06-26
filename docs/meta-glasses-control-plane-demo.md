# Meta Glasses Control-Plane Demo

`examples/meta-glasses-control-plane-demo` is a hardware-free Swissknife demo app for the expanded Meta glasses I/O control plane.

The demo binds these mock routes to visible diagnostics:

- Camera photo capture: `camera.capturePhoto`
- Microphone route status: `meta_glasses_audio.start_microphone_capture`
- Speaker route status: `meta_glasses_audio.start_speaker_playback`
- Headphone route status: `meta_glasses_audio.start_headphone_playback`
- Display output: `display.render_widget`
- Neural Band command: `commands.confirm_selection`
- Captouch command: `views.navigate_timeline`
- Motion and orientation: `views.reflow_hud`
- Phone GPS context: `agent.update_location_context`

The exported `createMetaGlassesControlPlaneDemo()` helper creates a `MetaGlassesControlPlaneRouter` with the demo app id, runs deterministic adapter requests, and records UI-facing state:

- `diagnostics`: one visible row per routed app action
- `fallback_panels`: visible fallback UI when DAT-native or Web Apps routes are unavailable
- `handoff_receipts`: MCP++ control-plane receipt CIDs emitted by every route
- `capture_references`: content-addressed camera capture references, recorded only when the mock policy allows persistence
- `visible_actions`: stable labels for the demo UI

The default scenario is available as:

```ts
import { runMetaGlassesControlPlaneDemoScenario } from '../examples/meta-glasses-control-plane-demo';

const state = runMetaGlassesControlPlaneDemoScenario();
```

The scenario runs entirely on mocks. Camera capture uses the camera adapter mock path, audio uses local route-status descriptors, input uses deterministic Web Apps or phone-app bridge envelopes, and display uses content-addressed widget payload references instead of inline assets.

Fallback UI is exercised by routing a camera capture through a policy fallback and a display render through an unsupported Web Apps bridge readiness state. Both routes still emit MCP++ handoff receipts and expose fallback panel metadata for a demo UI.

Capture persistence is deliberately policy-gated. The demo may receive ephemeral or denied camera payload references from lower-level adapters, but it only records a capture in `capture_references` when:

- the control-plane status is `accepted`
- persistence was requested
- the policy outcome is `allow`
- the payload reference is pinned

Validation:

```sh
cd swissknife
npx jest test/mcp-plus-plus/meta-glasses-demo-bindings.test.ts --config=config/jest/jest.config.cjs --runInBand
```
