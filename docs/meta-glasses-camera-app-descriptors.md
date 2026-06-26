# Meta Glasses Camera App Descriptors

Task MGW-367 adds the Swissknife runtime contract for camera photo capture and
video stream requirements. The implementation lives in
`src/services/meta-glasses-camera-adapter.ts` and composes the expanded I/O
profile plus the bridge transport envelopes from MGW-364 through MGW-366.

## Descriptor

Camera apps declare a `meta_glasses_camera` section with:

- profile id `handsfree.meta-glasses/camera-app-descriptor`
- profile version `0.1.0`
- linked I/O profile `handsfree.meta-glasses/io-capability`
- app id
- camera requirements for `photo` and `video_stream`
- app action bindings for `capture_photo`, `start_video_stream`, and
  `stop_video_stream`
- readiness entries for `mock`, `unsupported`, `ready`, and `degraded`

Each requirement maps to the I/O capability and permission scope:

| Requirement | I/O capability | Permission scope | Payload purpose |
| --- | --- | --- | --- |
| `photo` | `camera.photo_capture` | `meta_glasses.camera.photo` | `photo` |
| `video_stream` | `camera.video_capture` | `meta_glasses.camera.video` | `video` |

Bindings connect camera interactions to app-level action ids, input events, and
output events. The adapter treats bindings as the public application surface;
requests that reference undeclared binding ids return an MCP++ error receipt
and do not emit media payloads.

## Request Gate

`requestMetaGlassesCameraCapture()` requires:

- a declared app binding id
- an explicit user permission flag
- granted camera scope and `meta_glasses.control.route`
- an allow policy decision
- a route readiness state
- storage intent for the capture output

Default behavior is denial. Missing explicit permission, missing scope, a deny
policy, or a require-confirmation policy emits a denial receipt and a
control-plane denial event without payload references.

## Payload References

Accepted requests produce normalized `MetaGlassesIOPayloadRef` objects. Payload
bytes are not carried inline. References include a `sha256:` content id,
payload purpose, media type, size, retention policy, and privacy redaction.

When storage is enabled and the requirement allows IPFS persistence, the
adapter marks the payload retention as `pinned`. When storage is disabled, the
payload stays session-scoped. Camera payloads always use `privacy_filtered`
redaction metadata.

## Control Plane Events

Every terminal path returns a normalized control-plane event:

- `meta_glasses.camera.capture_result`
- `meta_glasses.camera.fallback`
- `meta_glasses.camera.denial`
- `meta_glasses.camera.error`

The event includes capability, app id, binding id, action id, correlation id,
payload references, policy decision, selected route, and the final receipt.
When the bridge envelope provides libp2p metadata, the event records libp2p
peer id, libp2p session id, MCP session id, device session id, and route
generation.

## Receipts

The adapter emits MCP++ receipts for:

- `capture_request`
- `capture_result`
- `fallback`
- `denial`
- `error`

Receipt CIDs are deterministic `sha256:` values over receipt stage,
correlation id, parent receipt CIDs, payload refs, and policy decision id.
Result, fallback, denial, and error receipts point back to the request receipt
through `parent_receipt_cids`.

## Validation

Use:

```ts
import {
  createMetaGlassesCameraDescriptor,
  requestMetaGlassesCameraCapture,
  validateMetaGlassesCameraDescriptor,
  validateMetaGlassesCameraCaptureResult,
} from './src/services/meta-glasses-camera-adapter.js';

const descriptor = createMetaGlassesCameraDescriptor();
const descriptorResult = validateMetaGlassesCameraDescriptor(descriptor);
```

The descriptor validator rejects missing profile metadata, missing photo or
video requirements, requirement and permission mismatches, missing app action
bindings, and missing camera readiness states. The capture result validator
rejects missing policy metadata, accepted captures without payload references,
payload refs without content ids and media metadata, missing MCP++ receipt CIDs,
and control-plane events that do not carry the normalized payload references.
