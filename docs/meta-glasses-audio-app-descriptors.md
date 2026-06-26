# Meta Glasses Audio App Descriptors

MGW-368 exposes microphone capture plus speaker/headphone playback to
Swissknife apps through SDK-free descriptor objects. The implementation lives in
`src/services/meta-glasses-audio-adapter.ts` and builds on the MGW-364 I/O
profile plus MGW-366 bridge envelopes.

## Descriptor Surface

`createMetaGlassesAudioAdapterDescriptor()` returns an MCP++ interface
descriptor with a `meta_glasses_audio` section:

- `microphone.input` uses the Bluetooth HFP route for capture.
- `speaker.output` uses the Bluetooth A2DP route for playback.
- `headphone.output` uses the BLE-audio route for private playback.
- Every requirement carries an app binding ID, action method, required
  permission scopes, and default route state.
- `raw_audio_allowed_by_default` is always `false`.

The descriptor intentionally does not import DAT SDK classes. Native Bluetooth,
phone, simulator, IPFS, libp2p, and MCP++ details stay behind the bridge
envelope boundary.

## Request Behavior

`requestMetaGlassesAudioRoute()` returns a normalized route result for app
requests:

- missing scopes return `permission_required` with a `require_confirmation`
  policy decision;
- `ready` routes emit capture/playback events and control-plane receipts;
- `route_lost`, `degraded`, or other non-ready states return `fallback`;
- `mock: true` returns a simulator-backed mock route;
- unsupported capabilities return `unsupported` or `error` with denial
  receipts.

Audio payloads are represented as content references. By default the adapter
creates only privacy-filtered metadata CIDs with `ephemeral` retention. When
`storage_enabled` is true, caller-provided CIDs are mapped to
`policy_controlled` payload references. Raw audio bytes are never present on the
result object.

## Receipts And Control Plane

Each result includes:

- a normalized audio event for the control plane;
- a bridge envelope with Bluetooth route metadata;
- a policy decision with required and granted scopes;
- MCP++ `control-route` and `execution` receipts;
- content-addressed payload refs suitable for IPFS-backed storage when policy
  allows it.

This keeps microphone and playback routes auditable without leaking raw audio
through app descriptors by default.
