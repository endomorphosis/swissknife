# Meta Glasses App Capability Registry

MGW-414 defines the Swissknife app-facing registry for Meta glasses display widget
capabilities. The registry projects the MGW-364 I/O profile into stable
capability entries without importing DAT SDK classes or requiring paired
hardware.

## Registry Shape

`createDefaultMetaGlassesAppCapabilityRegistry()` returns:

- `registry_id`: `org.handsfree.swissknife.meta-glasses-app-capability-registry@0.1.0`
- `descriptor_cid`: a `sha256:` CID for the MCP++ descriptor
- `sdk_import_required`: always `false`
- `entries`: one entry per I/O capability, plus `fallback.route` and
  `unsupported.capability`

Each entry carries:

- app binding IDs copied from the I/O profile
- permission scopes, including `meta_glasses.control.route`
- readiness state and policy requirements
- control-plane route decisions with MCP++ receipts and libp2p session metadata
- MCP descriptor references for registry consumers
- fallback routes for degraded, lost, unsupported, or unavailable surfaces

## Request Behavior

`requestMetaGlassesAppCapability()` fails closed:

- Unknown capability IDs return the synthetic `unsupported.capability` entry
  with a deny policy.
- Requests from an app ID that does not match the registry binding return
  `denied`.
- Missing permission scopes return `permission_required` with the missing scope
  list and a `require_confirmation` policy decision.
- Non-ready route states select the first matching fallback route when one is
  available.
- Requests for `fallback.route` return a fallback policy decision and the first
  available fallback route, because the synthetic fallback capability has no
  primary hardware route.
- Ready requests with all required scopes return the selected control-plane
  route decision.

## Retry-Budget Repair Evidence

MGW-521 was filed because repeated MGW-414 validation attempts failed before
test assertions ran. The failing command was:

```sh
cd swissknife && npx jest test/mcp-plus-plus/meta-glasses-app-capability-registry.test.ts --config=config/jest/jest.config.cjs --runInBand
```

The failure was `Cannot find module '@babel/plugin-transform-modules-commonjs'`.
That package is named directly in `config/jest/jest.config.cjs`, so MGW-521 adds
it as a root dev dependency instead of relying on a transitive lockfile entry.
