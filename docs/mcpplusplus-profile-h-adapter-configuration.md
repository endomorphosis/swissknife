# MCP++ Profile H compatibility adapter

SwissKnife exposes `mcp++/x402-payments` only when a compatibility service is
explicitly connected to a live, complete Profile H seller. Configure one of:

```sh
MCPPLUSPLUS_PROFILE_H_IPFS_KIT_PY_ENDPOINT=https://kit-seller.example
MCPPLUSPLUS_PROFILE_H_IPFS_DATASETS_PY_ENDPOINT=https://datasets-seller.example
MCPPLUSPLUS_PROFILE_H_IPFS_ACCELERATE_PY_ENDPOINT=https://accelerate-seller.example
```

`MCPPLUSPLUS_PROFILE_H_ENDPOINT` is the optional common fallback. Endpoints must
be absolute unauthenticated HTTP(S) URLs.

The adapter probes `GET /mcp/payments/profile` and advertises Profile H only if
it declares all ten control methods, HTTP and libp2p, a durable ledger,
content-addressed artifacts, reconciliation, and a ready facilitator. A normal
facilitator reports `upstreamX402HttpConformance: true`; an in-process verifier
must be visibly labelled `mode: local-test` and report it as false.

Readiness is re-probed at Profile E session initialization and periodically
during an active session. Unset, unreachable, incomplete, and fixture-only sellers are omitted from MCP
Initialize. Their REST routes return `503 H_PROFILE_UNAVAILABLE` and JSON-RPC
returns typed `-32070`; ordinary MCP tools remain available.

## Bindings

```text
mcp++/payments/profile          GET  /mcp/payments/profile
mcp++/payments/catalog          GET  /mcp/payments/catalog
mcp++/payments/quote            POST /mcp/payments/quote
mcp++/payments/verify           POST /mcp/payments/verify
mcp++/payments/settle           POST /mcp/payments/settle
mcp++/payments/receipt/get      GET  /mcp/payments/receipts/:cid
mcp++/payments/entitlement/get  GET  /mcp/payments/entitlements/:cid
mcp++/payments/usage/get        GET  /mcp/payments/usage/:cid
mcp++/payments/refund/request   POST /mcp/payments/refunds
mcp++/payments/reconcile        POST /mcp/payments/reconcile
```

Python sellers mount `mcplusplus_profile_h.ProfileHControlPlane`, using
`handle_http` for HTTP and `dispatch` for native JSON-RPC/libp2p. The Profile E
bridge forwards values unchanged over `/mcp+p2p/1.0.0` and preserves remote
seller errors. Only payment-safe headers are proxied; cookies, authorization,
and hop-by-hop headers are not forwarded.
