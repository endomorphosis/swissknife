# Swissknife Meta Glasses I/O Capability Contract

Task MGW-364 defines the Swissknife-side contract for Meta glasses I/O
capability discovery, route selection, fallback, and MCP++ receipt metadata.
The runtime profile lives in `src/services/meta-glasses-io-profile.ts`.

## Profile Identity

- Profile id: `handsfree.meta-glasses/io-capability`
- Profile version: `0.1.0`
- Descriptor property: `meta_glasses_io`
- Scope: a declarative capability contract, not a native DAT binding.

The contract is intentionally broader than the display widget profile. Display
widgets describe what to render on a 600x600 Meta Ray-Ban Display target; the
I/O profile describes whether each glasses, phone, Web Apps, Bluetooth audio,
and MCP++ bridge surface is ready, degraded, unsupported, or routed to a
fallback.

## Required Capabilities

Every conformant profile must include these capability kinds:

| Capability | Primary surface | Notes |
| --- | --- | --- |
| `camera.photo_capture` | `dat-native` | Photo artifacts are control-plane payload references, not inline bytes. |
| `camera.video_capture` | `dat-native` | Video stream or recording readiness includes route loss and degraded state. |
| `microphone.input` | `bluetooth-audio` | Models OS Bluetooth audio route state plus transcript/audio artifact refs. |
| `speaker.output` | `bluetooth-audio` | Playback intents and route diagnostics, not raw speaker transport. |
| `headphone.output` | `bluetooth-audio` | Same route model as speaker output. |
| `display.output` | `dat-native` | Includes DAT display lifecycle and Web Apps/simulator/mobile fallback. |
| `neural_band.input` | `display-webapp` | Normalized app intent events only; no raw EMG assumption. |
| `captouch.input` | `display-webapp` | Normalized activation/navigation events. |
| `motion.orientation` | `display-webapp` | Web Apps sensor path with native DAT support treated as unsupported/unknown. |
| `phone_gps.context` | `phone-os` | Companion-phone GPS context with permission and stale/degraded states. |

## Readiness And Policy

The profile enumerates stable readiness states so downstream mocks and bridge
code can test the same outcomes:

`ready`, `permission_required`, `permission_denied`, `unsupported`,
`unavailable`, `degraded`, `disconnected`, `stale_session`, `route_lost`,
`dat_app_update_required`, `firmware_update_required`, and
`package_or_release_channel_unavailable`.

Permissions default deny. Capability scopes are explicit strings such as
`meta_glasses.camera.photo`, `meta_glasses.display.render`,
`meta_glasses.phone_gps.context`, and `meta_glasses.control.route`.

Policy decisions are embedded in both primary control-plane route decisions and
fallback routes. Outcomes are `allow`, `deny`, `require_confirmation`,
`fallback`, or `degrade`, with required/granted scopes and an optional
MCP++ policy receipt.

## Routing And Receipts

Each capability declares:

- application interaction bindings: app id, method, input/output event, surface,
  and optional payload references
- fallback routes: readiness states that trigger fallback, target surface,
  reason, and policy decision
- control-plane route decisions: selected surface, readiness, policy decision,
  libp2p peer/session ids, MCP session id, content-addressed payload refs, and
  MCP++ receipt metadata

Payload refs are content addressed with `sha256:` CIDs and carry purpose,
media type, size, retention, and privacy redaction metadata. Large media and
sensor artifacts should cross the control plane by reference.

Receipt metadata supports `mcp++/execution`, `mcp++/policy-decision`,
`mcp++/control-route`, and `mcp++/capability-readiness`. Route receipts carry a
correlation id field plus optional receipt, envelope, decision, interface, and
parent receipt CIDs.

## Validation

Use:

```ts
import {
  createDefaultMetaGlassesIOProfile,
  validateMetaGlassesIOProfile,
} from './src/services/meta-glasses-io-profile.js';

const profile = createDefaultMetaGlassesIOProfile();
const result = validateMetaGlassesIOProfile(profile);
```

The validator rejects missing required capabilities, duplicate capability
kinds, unknown permission scopes/readiness states, missing application
bindings, missing fallback routes, route decisions without libp2p/MCP session
identifiers, non-content-addressed payload references, and missing MCP++ receipt
metadata.
