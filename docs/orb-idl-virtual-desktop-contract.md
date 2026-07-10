# Virtual Desktop ORB/IDL Contract

SWR-108 defines complete ORB/IDL coverage for the SwissKnife virtual desktop and
the Agent Supervisor Console.

The generated evidence artifact is:

`test-results/virtual-desktop-ipfs-mcp-orb/orb-idl-complete-coverage.json`

The schema is:

`contracts/orb_idl_virtual_desktop_contract.schema.json`

The implementation lives in:

`src/services/glasses/desktop-orb-idl-contract.ts`

## Scope

Every canonical app in `VIRTUAL_DESKTOP_APP_MANIFEST`, including generated
service surfaces and `agent-supervisor`, receives one ORB/IDL descriptor. Each
descriptor includes:

- a canonical MCP-IDL interface descriptor and computed `sha256:` interface CID
- explicit display, camera, speaker, microphone, and input modality descriptors
- explicit action-policy semantics for each IDL method
- typed fallback descriptors for supported, degraded, unsupported, and
  policy-gated paths
- backend capability references from the virtual desktop manifest
- glasses projection rules for status, receipts, action requests, and fallback
  rendering

Unsupported modalities are never omitted. They are represented as
`availability: unsupported`, `hardware_available: false`, and a typed
`unsupported-modality` fallback so callers can distinguish real capability
availability from a fallback route.

## Default Operations

Each desktop app descriptor exposes these methods:

| Method | Default policy | Purpose |
| --- | --- | --- |
| `read_status` | `read` | Read launch, transport, modality, and policy projection state. |
| `read_receipts` | `read` | Read descriptor, policy, and execution receipt references. |
| `request_action` | manifest-derived policy class | Request an app action through the confirmed desktop policy path when needed. |
| `request_fallback` | `read` | Return typed fallback metadata when a requested modality is unavailable. |

`agent-supervisor` also exposes `request_prompt_steering`. That method is not a
glasses-side direct action. It requires `confirmation:
required_for_steering`, uses the same desktop confirmation policy path as the
desktop console, and returns a `confirmed-policy-path` fallback if the policy
receipt is missing.

## Supervisor Console Rules

The Supervisor Console projection is read-only by default:

- `read_status` is read-only.
- `read_receipts` is read-only.
- display and input projections are read-only on glasses.
- prompt steering requires the same confirmed policy path used by the desktop
  console.
- steering receipts remain tied to the IPFS/MCP evidence path from SWR-107.

This prevents glasses status or receipt views from becoming an alternate
control channel for supervisor changes.

## Modality Semantics

The contract uses five required modality keys for every app:

`display`, `camera`, `speaker`, `microphone`, and `input`.

Display and input describe projection and normalized intent routes, not a claim
that physical Meta glasses hardware is paired. Camera, microphone, and speaker
descriptors default to explicit fallback or unsupported states unless the app
manifest declares a governed route. The `hardware_available` flag remains false
for the desktop contract because this layer is a declarative ORB/IDL contract,
not a physical-device pairing proof.

## Validation

Run:

```bash
npm run evidence:mcp-glasses
npm run typecheck:services
```

The evidence test regenerates `orb-idl-complete-coverage.json` and validates:

- descriptor coverage equals the canonical app manifest
- every descriptor has all five modality keys
- every modality has a typed fallback descriptor
- every interface CID matches the canonical IDL descriptor
- unsupported modalities do not claim hardware availability
- the `agent-supervisor` glasses projection remains read-only for status and
  receipts, with prompt steering gated by the confirmed desktop policy path
