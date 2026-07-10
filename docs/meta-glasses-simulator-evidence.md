# Meta Glasses Simulator Evidence

SWR-086 records hardware-free ORB/IDL handoff evidence with the Meta glasses simulator.
The release path does not assume direct desktop pairing to physical glasses.

## Evidence

- `test-results/virtual-desktop-ipfs-mcp-orb/glasses-simulator-handoff.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/glasses-simulator-screenshots/swr-086-simulator-handoff.png`
- `test/mcp-plus-plus/meta-glasses-simulator-handoff-evidence.test.ts`
- `test/e2e/meta-glasses-simulator-handoff.spec.ts`

## Validation

- `npm run test:e2e:meta-glasses`
- `npm run evidence:mcp-glasses`

## Simulator Boundary

No direct desktop pairing is used. The desktop emits ORB/IDL events to the mobile ORB edge, and the simulator renders the Meta glasses terminal states. The artifact records:

- `physical_glasses_required=false`
- `direct_desktop_pairing_required=false`
- `simulator.paired_physical_glasses=false`
- every handoff path has `direct_desktop_pairing=false`

## Capability Proofs

| Capability | Required proof | Artifact field |
| --- | --- | --- |
| `display.output` | Simulator-visible `rendered`, `updated`, `focused`, `activated`, and `cleared` display states from the display ORB adapter. | `capability_evidence[].simulator_visible_states` |
| `camera.photo_capture` | Permission denial, degraded-route mobile fallback, and accepted simulator capture states with MCP++ receipts. | `capability_evidence[].camera_permission_states` |
| `microphone.input` | Permission-required and granted simulator route policy states with raw audio redacted. | `capability_evidence[].audio_policy_states` |
| `speaker.output` | Granted simulator playback route and fallback/mock policy coverage with raw audio redacted. | `capability_evidence[].audio_policy_states` |

## Handoff Proofs

The artifact includes three replayable paths:

- `desktop_to_mobile_orb_to_simulator`: desktop event to mobile ORB edge to simulator display bridge.
- `mobile_to_desktop_resume`: mobile card resumes the desktop session state through the ORB binding.
- `policy_denied_camera_to_mobile_fallback`: simulator camera permission denial produces a policy receipt and mobile fallback.

Each path includes receipt CIDs and explicitly records that physical glasses and direct desktop pairing are not required.
