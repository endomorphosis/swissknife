# App Capability Policy

SwissKnife app capabilities are classified before desktop, ORB, MCP++, mobile,
or glasses surfaces invoke them. The policy catalog is generated from the
virtual desktop manifest plus descriptor-derived IPFS/MCP operation
capabilities.

## Policy Classes

- `read`: local or remote reads with no durable side effect.
- `write`: storage, publishing, indexing, or state-changing actions.
- `destructive`: delete, remove, unpin, revoke, or equivalent actions.
- `credential`: API keys, credential storage, or secret-bearing settings.
- `oauth`: OAuth login, token exchange, or delegated account access.
- `external_network`: third-party network calls and service-specific external APIs.
- `heavy_compute`: inference, model jobs, vector work, and long-running compute.
- `media_capture`: audio, image, or video capture/generation surfaces that can expose user media.
- `communication`: pubsub, chat, notifications, and contact/social operations.
- `autonomous_action`: scheduler, ORB dispatch, gateway, and auto-UI actions that may execute on behalf of a user or agent.

## Enforcement Rules

Every capability rule contains policy metadata, a confirmation policy, a receipt
policy, and fallback scope. `read` capabilities may use optional receipts and no
confirmation. Every side-effectful class requires confirmation plus
`required_for_side_effects` receipts, and result envelopes must include receipt
and event DAG references.

Sensitive classes use `desktop_or_mobile_only` confirmation and fallback:
`credential`, `oauth`, and `media_capture`. This prevents direct glasses display
or background agent execution from handling secrets, account delegation, or
media-sensitive workflows without a desktop/mobile mediation surface.

## Validation

The Jest contract in `test/mcp-plus-plus/app-capability-policy.test.ts` verifies:

- all manifest and descriptor-derived capabilities have policy rules;
- every required class is represented;
- side-effectful capabilities require confirmations, receipts, and event DAG refs;
- sensitive capabilities default to desktop/mobile-only fallback paths.
