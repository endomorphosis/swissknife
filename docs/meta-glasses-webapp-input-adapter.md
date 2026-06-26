# Meta Glasses Web Apps Input Adapter

MGW-418 adds a Web Apps-facing adapter for Meta Neural Band, captouch,
motion/orientation, and phone GPS events. The implementation lives in
`src/services/meta-glasses-webapp-input-adapter.ts` and wraps the lower-level
Meta glasses input adapter with browser-safe descriptors.

## Web Apps Surface

`createMetaGlassesWebAppInputAdapterDescriptor()` declares four Web Apps input
bindings:

- `neural_band` maps `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, and
  `Enter` into Swissknife command intent descriptors.
- `captouch` maps the same Arrow/Enter key vocabulary into view navigation
  intent descriptors.
- `motion` accepts `deviceorientation` and `devicemotion` context events and
  emits privacy-filtered orientation and motion summaries.
- `phone_gps` accepts coarse geolocation context and emits metadata-only
  location descriptors.

Each binding preserves the app binding ID from the shared input adapter, keeps
the normalized event name, declares required permission scopes, and carries the
same stale-event and maximum-frequency limits used by the control plane.

## Unsupported Web Apps Assumptions

Display Web Apps do not receive camera capture, microphone input, speaker
playback, or headphone playback routes through this adapter. Requests that imply
`camera.photo_capture`, `camera.video_capture`, `microphone.input`,
`speaker.output`, or `headphone.output` return an `unsupported` route result with
a denial policy and MCP++ receipts. Native/mobile camera and audio adapters own
those capabilities.

## Routing And Receipts

`routeMetaGlassesWebAppInputEvent()` returns a Web Apps route result with:

- a normalized Swissknife event from the shared input adapter;
- an intent descriptor for Neural Band and captouch key input;
- a privacy-safe context descriptor for motion/orientation or phone GPS;
- the control-plane route decision and policy decision;
- MCP++ receipts for authorization, control routing, and the terminal Web Apps
  stage.

Terminal receipts are emitted for `allowed`, `denied`, `fallback`,
`unsupported`, `stale`, `throttled`, and `replayed` events. Route-lost,
disconnected, or unavailable input paths are surfaced to Web Apps as `fallback`
so apps can degrade without assuming direct hardware access.

## Privacy And Rate Limits

The adapter never exposes raw sensor samples or precise coordinates. GPS output
is limited to coarse labels such as `nearby`, `in_transit`, or `arrived`, with
`precise_coordinates_redacted: true`. Motion output includes only orientation,
motion state, and confidence.

High-frequency sensor events use the declared per-binding `max_hz` limits.
Events outside the freshness window return `stale`; events that arrive faster
than the allowed interval return `throttled`. Reused input IDs or non-increasing
sequence numbers return `replayed`.
