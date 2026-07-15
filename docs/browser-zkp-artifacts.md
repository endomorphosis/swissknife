# Browser ZKP Artifacts

SwissKnife currently ships one real browser Groth16 circuit corpus and one browser-native Schnorr helper. The authoritative browser WASM registry is `src/services/zkp/artifacts/browser-wasm-assets.json`.

The production browser Groth16 backend is `snarkjs-browser-groth16`, implemented by `src/services/zkp/browser-snarkjs-backend.ts`. It resolves the default circuit through `src/services/zkp/artifacts/index.ts`; it does not fall back to simulated ZKP helpers.

## Groth16 Deontic Discharge V1

Path: `src/services/zkp/artifacts/groth16/deontic_discharge_v1/`

The circuit proves:

```text
expected_discharge = obligation AND permitted AND not_prohibited
```

Public inputs are `obligation` and `expected_discharge`. Private witness inputs are `permitted` and `not_prohibited`.

Runtime files:

| File | Browser URL | SHA-256 |
| --- | --- | --- |
| `deontic_discharge_v1.wasm` | `/assets/zkp/groth16/deontic_discharge_v1/deontic_discharge_v1.wasm` | `0c3295889939f6f7dae5d9b380c4146e6464254fc33e173d1b199a154d113e5a` |
| `deontic_discharge_v1_final.zkey` | `/assets/zkp/groth16/deontic_discharge_v1/deontic_discharge_v1_final.zkey` | `48a364014929366ed2088d97aed16823ab56a54820a3c67b335b563c3a78fccc` |
| `verification_key.json` | `/assets/zkp/groth16/deontic_discharge_v1/verification_key.json` | `138fc4b9bd00602afe1b4db9d8c6a5a42391ee5e47bb1f2d212c67217e65368a` |

Audit/rebuild file:

| File | SHA-256 |
| --- | --- |
| `deontic_discharge_v1.r1cs` | `d8ca1aedbb1aa421bbf09584d91ef0813cc115647ee8c753adc6e352d1321c9f` |

`BrowserSnarkjsGroth16Backend` resolves bundled default URLs with `new URL(..., import.meta.url)`, so Vite can include the WASM, zkey, R1CS, manifest, and verification key in the web build. The `/assets/zkp/...` URLs above are the deployment-stable public locations recorded in the registry for hosts that copy artifacts to static asset storage.

Before proof generation, the backend fetches the WASM and zkey and verifies byte length and SHA-256 against the embedded manifest. Before verification, it loads and validates `verification_key.json` unless the caller injects a verification key.

Unavailable or invalid artifacts fail closed with:

- `BrowserZkpArtifactUnavailableError`
- `BrowserZkpArtifactIntegrityError`

Tests may inject absolute local paths and a parsed verification key to avoid network fetches.

## External Hosting

Use `artifactBaseUrl` when artifacts are hosted outside the Vite bundle:

```ts
const backend = new BrowserSnarkjsGroth16Backend({
  artifactBaseUrl: 'https://static.example.com/zkp',
});
```

The resolver appends `/groth16/deontic_discharge_v1/<artifact-file>`. Hosted files must be byte-for-byte identical to the committed artifacts unless a new manifest and registry entry are added in the same change.

## Rotation Procedure

1. Rebuild the Circom circuit and SnarkJS proving artifacts.
2. Replace the files under `src/services/zkp/artifacts/groth16/<circuitId>/`.
3. Update `manifest.json` byte counts, SHA-256 digests, SHA-384 SRI strings, browser URLs, and cache policy.
4. Update the embedded manifest in `src/services/zkp/artifacts/index.ts`.
5. Update `src/services/zkp/artifacts/browser-wasm-assets.json`.
6. Run:

```bash
node scripts/audit-browser-wasm-assets.mjs --fail-on-missing-integrity --report docs/browser-wasm-asset-policy.md
npm run test:run -- test/mcp-plus-plus/wasm-prover-browser-groth16-semantic.test.ts test/mcp-plus-plus/wasm-prover-browser-zkp-real.test.ts
```

## Schnorr Field Helper

Path: `src/services/zkp/artifacts/schnorr-field.wasm.b64`

Asset ID: `zkp.schnorr.field-helper.v1`

The Schnorr backend decodes this committed base64 payload into the inline helper used by `instantiateSchnorrWasmHelper()`. It is not fetched at runtime. Its decoded byte SHA-256 is `59fb1c30446716179bab2e5691bbf344aa2a60d123f7101fc0ee731e96976e0c`.

## Package-Owned WASM

The browser theorem/ZKP/NLP paths also depend on package-owned WASM:

- `theorem.z3-solver.z3-built-wasm` from `z3-solver@4.16.0`.
- `zkp.snarkjs.wasmcurves-bn128` and `zkp.snarkjs.wasmcurves-bls12381` from `wasmcurves@0.2.2`.
- `nlp.pyodide.runtime-wasm` from optional `pyodide@0.21.3`.
- `inference.onnxruntime-web` is not deployed and has no approved browser artifact yet.

Package assets must stay package-resolved or be copied to versioned vendor URLs with the same registry integrity. They must not be replaced by CDN URLs without updating the registry and deployment CSP.

## Test-Only Boundary

The simulated prover is not backed by these artifacts and is not a cryptographic proof backend. Production browser backend selection through `createBrowserZkpProductionBackend` rejects `simulated`, `simulated-zkp`, and `simulated-zkp-v0.1`.

Any simulated proof corpus, fixture, or mock proving asset must remain under `test/`; committed runtime assets under `src/services/zkp/artifacts` must be real circuit, key, verifier, or WASM helper files with registry integrity.
