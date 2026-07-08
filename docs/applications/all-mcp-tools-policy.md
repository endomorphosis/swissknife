# All MCP/MCP++ Tools Policy

This document summarizes the SVD-028 policy matrix generated from
`test-results/virtual-desktop-ipfs-mcp-orb/all-tools-ledger.json`.

The full machine-readable artifact is:

```text
test-results/virtual-desktop-ipfs-mcp-orb/all-tools-policy-matrix.json
```

## Current Matrix

| Scope | Count |
| --- | ---: |
| Total tool policy rules | 488 |
| `ipfs_kit_py` rules | 119 |
| `ipfs_datasets_py` rules | 354 |
| `ipfs_accelerate_py` rules | 15 |

## Policy Classes

| Policy class | Count |
| --- | ---: |
| `read` | 219 |
| `write` | 68 |
| `destructive` | 12 |
| `credential` | 29 |
| `oauth` | 0 |
| `external_network` | 77 |
| `heavy_compute` | 46 |
| `media_capture` | 9 |
| `communication` | 8 |
| `autonomous_action` | 20 |

The current live/static MCP ledger does not expose an OAuth-specific tool. OAuth
policy handling remains defined because virtual desktop app capabilities use it,
but this all-tools matrix has zero OAuth rows until an OAuth tool appears in the
ledger.

## Owner Modules

| Owner module | Count |
| --- | ---: |
| `ipfs` | 297 |
| `mcp` | 76 |
| `logic.deontic` | 56 |
| `integrations` | 37 |
| `platform` | 22 |

Ownership is intentionally singular. MCP control, policy, compliance, and
descriptor surfaces are owned by `mcp`; IPFS service-family tools default to
`ipfs`; accelerate hardware/compute tools default to `platform`; legal/logic
tools route to `logic.deontic`; credential, OAuth, media, and third-party
communication surfaces route to `integrations` or `platform`.

## Exposure Rules

| Exposure disposition | Count |
| --- | ---: |
| `app_visible` | 219 |
| `app_visible_with_confirmation` | 199 |
| `desktop_or_mobile_only` | 50 |
| `supervisor_only` | 20 |

Rules:

- `read` tools may be app-visible and may use native glasses display.
- `write`, `external_network`, `heavy_compute`, and `communication` tools require confirmation and side-effect receipts before app use.
- `destructive`, `credential`, `oauth`, and `media_capture` tools are desktop/mobile mediated.
- `autonomous_action` tools, including generic dispatchers, are supervisor-only and are not exposed directly to glasses.
- Every side-effectful tool requires `required_for_side_effects` receipts.

## Validation

The contract test is:

```text
npx jest test/mcp-plus-plus/all-tools-policy-classifier.test.ts --config=config/jest/jest.config.cjs --runInBand
```

It verifies that every ledger tool has exactly one owner module, policy class,
confirmation policy, receipt policy, fallback rule, and glasses exposure
disposition, and that high-risk tools are not directly exposed to glasses.
