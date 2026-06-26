# Meta Glasses Control-Plane Routing

`meta-glasses-control-plane-router.ts` is the Swissknife handoff layer for expanded
Meta glasses I/O. Applications register app binding IDs for camera, audio, display,
Neural Band, captouch, motion/orientation, and GPS interactions. The router maps
those binding IDs to ORB/MCP++ tool calls and emits deterministic MCP++ receipts.

## Registered Bindings

The router derives bindings from the existing camera, audio, and input adapters:

- Camera: `camera.photo_capture` and `camera.video_capture` route to
  `swissknife.mobile_orb.request_capture`.
- Audio: `microphone.input`, `speaker.output`, and `headphone.output` route to
  `swissknife.mobile_orb.publish_glasses_event`.
- Input: Neural Band, captouch, and motion route to
  `swissknife.webapp_bridge.publish_display_event`; GPS context routes through
  the mobile ORB path.
- Display: `display.output` routes content-addressed display asset references to
  `swissknife.webapp_bridge.publish_display_event`.

Each binding records required Meta glasses permission scopes, the target ORB tool,
the Hallucinate App fallback tool, privacy redaction mode, and a small in-flight
limit for backpressure.

## Route Decision

`route()` accepts a binding ID, correlation ID, optional adapter request, normalized
event, content-addressed payload references, bridge envelope, policy decision, and
flow-control hints. Adapter requests are delegated to the MGW-367, MGW-368, and
MGW-369 services so the control-plane router preserves their normalized events,
policy decisions, payload refs, bridge metadata, and receipts.

The router then adds:

- ORB/MCP++ tool call metadata with a deterministic input CID.
- Hallucinate App policy handoff metadata.
- App session state with generation, receipt CIDs, route history, and libp2p
  session identifiers when bridge envelopes include them.
- Replay protection keyed by app, binding, event/correlation ID, and sequence.
- Backpressure decisions from bridge flow control and binding in-flight limits.
- Privacy redaction metadata that prevents raw camera, audio, sensor, GPS, or
  inline display payload forwarding.
- Fallback tool selection for unsupported, backpressure, fallback, and error
  states.

## Receipts

Every route decision produces one deterministic MCP++ receipt. Adapter receipts
are preserved as parent receipt CIDs, so camera capture, audio route selection, and
input authorization receipts remain linked to the final control-plane route. The
control-plane receipt records the router ID, status, binding ID, capability, ORB
tool, policy decision CID, replay key, session generation, payload refs, and bridge
envelope CID.

Denied and replayed routes use policy-decision receipts. Accepted, degraded,
fallback, unsupported, backpressure, and error paths use control-route receipts so
downstream conformance tests can validate the routing decision without invoking
hardware.
