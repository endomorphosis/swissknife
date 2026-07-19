# Browser Deployment Policy

SwissKnife browser releases must be deployable without host-only runtime
capabilities. The release readiness gate treats this document, the web CSP, the
Vite browser import guard, and built headers as deployment evidence.

## Content-Security-Policy

Production headers must include `Content-Security-Policy` with:

- `default-src 'self'`
- explicit `script-src` and `style-src`
- `worker-src 'self' blob:`
- `child-src 'self' blob:`
- `object-src 'none'`
- `base-uri 'self'`
- `frame-ancestors 'none'`

The static `dist/_headers` file is the release evidence for hosted builds.

## Workers

Browser worker creation must go through browser-safe Worker or SharedWorker
APIs. Node `worker_threads`, subprocess workers, filesystem workers, and native
module loaders are host-only and are blocked from browser bundles by
`vite.web.config.ts`.

## Storage

Browser storage may use IndexedDB, OPFS, Cache Storage, and explicit browser
IPFS transports. Host filesystem paths, Node `fs`, subprocess adapters, and
native IPFS daemon assumptions must remain behind host entry points.

## Offline Mode

Offline behavior is served by the built service worker and offline shell. Cache
Storage must be available for runtime caching; failures degrade visibly rather
than silently falling back to host files.

## WASM Isolation

WASM proof engines follow the browser WASM asset policy. COOP and COEP headers
are required when cross-origin isolation, shared memory, or threaded WASM is
enabled. The default deployment keeps WASM assets same-origin and integrity
checked through SHA-256 metadata.

## Release Gate

`npm run release:readiness` fails when this policy evidence, built CSP headers,
worker/storage/offline coverage, or Vite host-import protections are missing.
The policy-specific audit and generated evidence are maintained by
`scripts/audit-browser-deployment-policy.mjs`.
