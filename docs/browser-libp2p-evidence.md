# Browser libp2p interoperability evidence (SWR-138)

`npm run test:e2e:libp2p-browser` runs the same real interoperability flow in
Chromium, Firefox, and WebKit. Each engine receives two independently-created
Playwright browser contexts; no page fixture, storage, permission state, or
libp2p identity is shared between them.

The test starts `test/e2e/fixtures/libp2p-browser-harness/relay-server.mjs`, a
real Node libp2p Circuit Relay v2 service. It listens only on a temporary local
TLS WebSocket address and is configured with WebSockets, Identify, Noise,
Yamux, and `circuitRelayServer()`. The browsers construct the production
`createBrowserLibp2pNode` default-enabled runtime, explicitly dial the relay
through their browser WebSocket transport, reserve circuit addresses, and dial
each other through those circuit addresses. No TCP, host transport, fake peer,
or status-only transport is present in either browser bundle.

The receiver registers `/swissknife/swr-138/signed-request/1.0.0`; the sender
opens that real libp2p stream and exchanges nonce-bound WebCrypto signed JSON
messages. The receiver verifies the request before signing its response, and
the sender verifies the response. The receipt records both verification results
and the actual connection metadata. The test fails unless the negotiated
encryption contains `noise` and the multiplexer contains `yamux`.

Every engine writes `test-results/libp2p-browser/swr-138-<engine>.json` with:

- distinct sender and receiver peer IDs plus their circuit-relay endpoints;
- live relay peer ID/address and Noise/Yamux configuration;
- registered protocol, nonce, signature algorithms, and both verification
  outcomes;
- typed (`swr-138.browser-libp2p.failure.v1`) receipts for an unavailable
  capability, isolated-context permission denial, a real protocol deadline,
  and loss of the relay after it is stopped; and
- clean browser-node/context shutdown results.

The negative cases are actual failure paths: capability assembly receives a
missing module, the browser's geolocation permission prompt is denied or left
permanently unresolved by the isolated context (both are genuine engine
behaviors — Chromium and WebKit auto-deny, headless Firefox never resolves the
prompt), a registered remote libp2p handler keeps a real stream open beyond
its deadline, and the relay process is terminated before a new circuit dial is
attempted.
They are not scripted success responses.

Run the evidence and browser-boundary checks with:

```sh
cd swissknife
npm run evidence:libp2p-browser
npm run audit:bundle-host-leakage
```

Raw Playwright reports, traces, and per-engine receipts are transient CI
artifacts under `test-results/libp2p-browser`; this document and its freshness
fingerprint are the checked-in provenance. The evidence command refreshes that
fingerprint only after all three engines pass.
