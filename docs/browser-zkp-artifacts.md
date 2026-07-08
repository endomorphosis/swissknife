# Browser ZKP Artifacts

SwissKnife browser Groth16 proving uses committed SnarkJS artifacts from:

`src/services/zkp/artifacts/groth16/deontic_discharge_v1/`

The production browser backend is `snarkjs-browser-groth16`, implemented by
`src/services/zkp/browser-snarkjs-backend.ts`. It resolves the default circuit
through `src/services/zkp/artifacts/index.ts`; it does not fall back to
simulated ZKP helpers.

## Default Circuit

Circuit ID: `deontic_discharge_v1`

Semantic claim:

`expected_discharge = obligation AND permitted AND not_prohibited`

Public inputs:

- `obligation`
- `expected_discharge`

Private inputs:

- `permitted`
- `not_prohibited`

Committed artifacts:

- `manifest.json`
- `deontic_discharge_v1.r1cs`
- `deontic_discharge_v1.wasm`
- `deontic_discharge_v1_final.zkey`
- `verification_key.json`

Each artifact has a byte count and SHA-256 digest in `manifest.json`. The
browser registry embeds the same metadata and exposes SRI strings for deployment
systems that want to preflight hosted artifacts.

## Loading Rules

The default `BrowserSnarkjsGroth16Backend` resolves bundled artifact URLs with
`new URL(..., import.meta.url)`, so Vite includes the WASM, zkey, R1CS, manifest,
and verification key in the web build.

Before proof generation, the backend fetches the WASM and zkey and verifies:

- byte length matches the manifest
- SHA-256 matches the manifest

Before verification, the backend loads and validates `verification_key.json`
unless a caller explicitly injected a verification key.

Unavailable or invalid artifacts fail closed with typed errors:

- `BrowserZkpArtifactUnavailableError`
- `BrowserZkpArtifactIntegrityError`

## External Hosting

Use `artifactBaseUrl` when artifacts are hosted outside the Vite bundle:

```ts
const backend = new BrowserSnarkjsGroth16Backend({
  artifactBaseUrl: 'https://static.example.com/zkp',
});
```

The resolver appends:

`/groth16/deontic_discharge_v1/<artifact-file>`

The hosted files must be byte-for-byte identical to the committed artifacts
unless a new manifest and registry entry are added in the same change.

## Rotation Procedure

1. Rebuild the Circom circuit and SnarkJS proving artifacts.
2. Replace the files under `src/services/zkp/artifacts/groth16/<circuitId>/`.
3. Update `manifest.json` byte counts and SHA-256 digests.
4. Update the embedded manifest in `src/services/zkp/artifacts/index.ts`.
5. Run:

```bash
npm run test:run -- test/mcp-plus-plus/wasm-prover-browser-groth16-semantic.test.ts test/mcp-plus-plus/wasm-prover-browser-zkp-real.test.ts
npm run build:web
```

## Simulated Helpers

`src/services/zkp/zkp-simulated-prover.ts` remains a deterministic test helper
for legacy conformance tests. It is not a production browser proof backend.
Production browser backend selection through `createBrowserZkpProductionBackend`
rejects `simulated`, `simulated-zkp`, and `simulated-zkp-v0.1`.
