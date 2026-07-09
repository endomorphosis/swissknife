# Browser WASM Asset Policy

Browser WASM used by proof, ZKP, inference, or optional NLP paths must have
deterministic resolution and integrity metadata before release.

## Required Metadata

- Every file in `src/services/zkp/artifacts/groth16/deontic_discharge_v1/manifest.json`
  records byte count and SHA-256 digest.
- `src/services/zkp/artifacts/index.ts` embeds the same metadata and derives
  SRI strings for browser deployment preflight.
- The Schnorr helper in `src/services/zkp-browser-schnorr.ts` includes
  `wasmArtifactSha256` in generated proof payloads.

## Isolation

Deployments that execute larger WASM workloads must preserve:

- `Content-Security-Policy` with `object-src 'none'`, explicit script sources,
  and `worker-src 'self' blob:`.
- `Cross-Origin-Opener-Policy: same-origin` (COOP).
- `Cross-Origin-Embedder-Policy: require-corp` (COEP) when shared memory,
  `SharedArrayBuffer`, threaded WASM, or cross-origin isolated proof engines
  are enabled.

## Cache Policy

WASM, zkey, r1cs, and verification-key assets are immutable only when their URL
contains a content hash or their SHA-256 metadata is verified before use. A
manifest digest change requires regenerating the browser ZKP test evidence.

## Release Gate

`npm run release:readiness` verifies manifest byte counts and SHA-256 digests,
checks the committed WASM policy evidence, and fails when integrity metadata is
missing or stale.
