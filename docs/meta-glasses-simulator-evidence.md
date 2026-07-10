# Meta Glasses Simulator Evidence

SWR-097 records hardware-free ORB/IDL handoff evidence with the Meta glasses simulator.
The release path does not assume direct desktop pairing to physical glasses.

## Evidence

- `test-results/virtual-desktop-ipfs-mcp-orb/glasses-simulator-handoff.json`
- `test-results/virtual-desktop-ipfs-mcp-orb/glasses-screenshots/swr-097-glasses-simulator-handoff.png`
- `test/mcp-plus-plus/meta-glasses-simulator-handoff-evidence.test.ts`
- `test/e2e/meta-glasses-simulator-handoff.spec.ts`

## Validation

- `npm run test:e2e:meta-glasses`
- `npm run evidence:mcp-glasses`

## Simulator Boundary

No direct desktop pairing is used. The desktop emits ORB/IDL events to the mobile ORB edge, and the simulator renders the Meta glasses terminal states. The artifact records:

- `simulator.simulator_runtime=playwright-meta-glasses-simulator`
- `simulator.device_profile_id=meta-ray-ban-display-simulator-swr-097`
- `physical_glasses_required=false`
- `direct_desktop_pairing_required=false`
- `simulator.paired_physical_glasses=false`
- every handoff path has `direct_desktop_pairing=false`
- desktop-to-simulator routes must pass through `mobile ORB edge`

## Capability Proofs

| Capability | Required proof | Artifact field |
| --- | --- | --- |
| `display.output` | Simulator-visible `rendered`, `updated`, `focused`, `activated`, and `cleared` display states from the display ORB adapter. | `capability_evidence[].simulator_visible_states` |
| `camera.photo_capture` | Permission denial, degraded-route mobile fallback, and accepted simulator capture states with MCP++ receipts. | `capability_evidence[].camera_permission_states` |
| `microphone.input` | Permission-required, redacted transcript, granted capture, and denial behavior with raw audio redacted. | `capability_evidence[].audio_policy_states` |
| `speaker.output` | Granted simulator playback route and fallback/mock policy coverage with raw audio redacted. | `capability_evidence[].audio_policy_states` |
| `touch.input` | Simulator touchpad event maps to the Display Web App view target with receipts and privacy-filtered payload CIDs. | `input_mapping_evidence[]` |
| `voice.input` | Simulator voice transcript maps to the desktop supervisor receipt command with a transcript CID and no raw audio. | `input_mapping_evidence[]` |

## Physical Device Degradation

Browser evidence never opens native DAT or Bluetooth hardware routes. Physical-device-only surfaces are represented in `physical_device_degradations[]` with receipt CIDs and `direct_physical_device_access=false`:

- `dat_native_display` degrades to the simulator display bridge.
- `dat_native_camera` degrades to the mobile fallback card after simulator permission denial/degraded route states.
- `bluetooth_microphone_route` degrades to a denied simulator policy state and desktop resume receipt.
- `bluetooth_speaker_route` degrades to simulator playback/fallback policy receipts.

## Handoff Profiles

The simulator launches and exercises each configured handoff profile:

- `display-webapp-handoff`: display rendering plus touch input on the simulator display surface.
- `mobile-card-fallback`: camera denial and degraded camera route to mobile fallback.
- `audio-summary-handoff`: speaker playback, microphone permission prompt, redacted transcript, and microphone denial.
- `supervisor-receipt-handoff`: voice command and desktop resume receipt handoff.

Each profile has `launch_state=launched`, `simulator_visible=true`, and receipt CIDs in `handoff_profiles[]`.

## Handoff Proofs

The artifact includes three replayable paths:

- `desktop_to_mobile_orb_to_simulator`: desktop event to mobile ORB edge to simulator display bridge.
- `mobile_to_desktop_resume`: mobile card resumes the desktop session state through the ORB binding.
- `policy_denied_camera_to_mobile_fallback`: simulator camera permission denial produces a policy receipt and mobile fallback.

Each path includes receipt CIDs and explicitly records that physical glasses and direct desktop pairing are not required.
