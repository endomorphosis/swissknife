# Meta Glasses Input App Descriptors

MGW-369 exposes Meta Neural Band gestures, captouch, motion/orientation, and
phone GPS context to Swissknife apps as SDK-free MCP++ descriptors. The
implementation lives in `src/services/meta-glasses-input-adapter.ts` and builds
on the Meta glasses I/O profile plus bridge envelopes.

## Descriptor Surface

`createMetaGlassesInputAdapterDescriptor()` returns an interface descriptor with
a `meta_glasses_input` section:

- `neural_band.input` binds gesture intents to app commands.
- `captouch.input` binds touch gestures to view navigation.
- `motion.orientation` binds orientation and motion state to view updates.
- `phone_gps.context` binds coarse phone location context to agent actions.

Every binding declares its required permission scopes, target type, target ID,
maximum event rate, stale-event window, privacy mode, and normalized event name.
The descriptor intentionally does not import DAT SDK classes or expose raw
sensor samples.

## Routing Behavior

`routeMetaGlassesInputEvent()` evaluates one input event descriptor and returns a
normalized control-plane result:

- allowed events include a normalized event and route decision;
- denied events include the missing scopes and a policy-denial receipt;
- unsupported routes are denied without losing route metadata;
- disconnected, route-lost, or unavailable routes return fallback policy;
- stale events are marked `stale` with degraded policy;
- high-frequency events are marked `throttled`;
- replayed input IDs or non-increasing sequences are denied.

Applications can bind the normalized event and intent descriptors to commands,
views, or agent actions without receiving raw Neural Band, captouch, IMU, or GPS
payloads.

## Privacy

Payloads are represented as `sensor_sample` content references with ephemeral
retention. GPS descriptors expose only coarse context such as `arrived` or
`in_transit`; precise latitude and longitude are redacted by default. Motion and
gesture descriptors include only privacy-filtered summaries such as gesture
label, orientation, motion state, and confidence.

## Receipts And Control Plane

Each route result includes:

- a Hallucinate App policy decision;
- a control-plane route decision for the mobile orb or webapp bridge;
- libp2p and MCP session identity when bridge metadata is available;
- MCP++ receipts for authorization, control routing, and the terminal event
  stage;
- privacy-safe payload references suitable for audit, replay protection, and
  descriptor-level app binding.

This keeps handsfree input routing auditable while preventing raw sensor or
precise location data from leaking through Swissknife app descriptors.
