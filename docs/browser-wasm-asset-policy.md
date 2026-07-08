# Browser WASM Asset Policy

This policy owns browser-loadable WASM and proving-key assets used by theorem proving, ZKP, and optional NLP/inference paths. The source of truth is `src/services/zkp/artifacts/browser-wasm-assets.json`; run `node scripts/audit-browser-wasm-assets.mjs --fail-on-missing-integrity --report docs/browser-wasm-asset-policy.md` after any asset, package, or resolver change.

## Resolution Rules

Browser WASM assets must resolve deterministically from one of these sources:

- Committed ZKP artifacts under `src/services/zkp/artifacts/**`.
- Version-pinned npm package assets recorded with `packageName`, `packageVersion`, and package-relative `browserUrl`.
- Inline module bytes whose committed source file and decoded bytes are both listed in the registry.

Remote CDN fallback is not allowed for theorem prover or proof-generation assets. `SPACY_WASM_PACKAGES_BASE_URL` may point spaCy wheel installs at an approved mirror, but the Pyodide runtime itself remains package-resolved unless `SPACY_WASM_PYODIDE_INDEX_URL` is explicitly configured by the deployment owner.

`inference.onnxruntime-web` is intentionally `not-deployed`: the source probes `onnxruntime-web`, but the dependency is not in `package.json`. Adding it requires a new registry entry for every shipped ONNX Runtime Web WASM artifact before browser release.

## Integrity

Every deployed or optional-runtime entry must include byte length, SHA-256, and SHA-384 SRI metadata. The audit script recalculates integrity from the actual source bytes and fails on drift when `--fail-on-missing-integrity` is used.

The current registry entries are:

| Asset | Source | Cache | Integrity |
| --- | --- | --- | --- |
| `zkp.schnorr.field-helper.v1` | `src/services/zkp/artifacts/schnorr-field.wasm.b64` | module-immutable | `312741ca9aa9db89eaad2c558f32a71ea654e7e83f65841f4e6a224cd1ca5a8e` |
| `zkp.groth16.deontic-discharge-v1.r1cs` | `src/services/zkp/artifacts/groth16/deontic_discharge_v1/deontic_discharge_v1.r1cs` | immutable | `d8ca1aedbb1aa421bbf09584d91ef0813cc115647ee8c753adc6e352d1321c9f` |
| `zkp.groth16.deontic-discharge-v1.wasm` | `src/services/zkp/artifacts/groth16/deontic_discharge_v1/deontic_discharge_v1.wasm` | immutable | `0c3295889939f6f7dae5d9b380c4146e6464254fc33e173d1b199a154d113e5a` |
| `zkp.groth16.deontic-discharge-v1.zkey` | `src/services/zkp/artifacts/groth16/deontic_discharge_v1/deontic_discharge_v1_final.zkey` | immutable | `48a364014929366ed2088d97aed16823ab56a54820a3c67b335b563c3a78fccc` |
| `zkp.groth16.deontic-discharge-v1.verification-key` | `src/services/zkp/artifacts/groth16/deontic_discharge_v1/verification_key.json` | immutable | `138fc4b9bd00602afe1b4db9d8c6a5a42391ee5e47bb1f2d212c67217e65368a` |
| `theorem.z3-solver.z3-built-wasm` | `node_modules/z3-solver/build/z3-built.wasm` | package-immutable | `a4bd752d13df6161d3cb9459d72031941285aaacca2e6f3a0becb7d2876f3695` |
| `zkp.snarkjs.wasmcurves-bn128` | `node_modules/wasmcurves/build/bn128.wasm` | package-immutable | `eea61e66b72d1c0eb49c91521a25a8fa09a4d9d51c2fe74cabf596f48eea8639` |
| `zkp.snarkjs.wasmcurves-bls12381` | `node_modules/wasmcurves/build/bls12381.wasm` | package-immutable | `a507a06b384e15098cb7d643a045b9faedc0b21a0a4d4c3064a703994f88ba45` |
| `nlp.pyodide.runtime-wasm` | `node_modules/pyodide/pyodide.asm.wasm` | package-immutable | `9eb14c8acccd08b778710dd961f52f3c475dad95ae512c4f35b53049ecf5032c` |
| `inference.onnxruntime-web` | not deployed | not-deployed | n/a |

## Cache Policy

Committed ZKP artifacts and package-owned WASM files are content-addressed by registry integrity and package lock state. Browser deployments must serve them with:

```text
Cache-Control: public, max-age=31536000, immutable
```

Inline module bytes use `module-immutable` and inherit the JavaScript bundle cache policy. Local development may use `no-store`, but production must not silently downgrade immutable assets unless the URL includes a build hash.

## Isolation And CSP

The baseline browser deployment must send:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://raw.githubusercontent.com; object-src 'none'; base-uri 'self'
```

Use `Cross-Origin-Embedder-Policy: require-corp` instead of `credentialless` for deployments that enable threaded inference runtimes or any future SharedArrayBuffer-backed WASM backend. `inference.onnxruntime-web` is already marked as requiring cross-origin isolation if it is added later.

## Simulated Proof Boundary

`src/services/zkp/zkp-simulated-prover.ts` is a deterministic hash-based test/development prover, not a browser WASM asset. Simulated or mock proof artifacts must live under `test/` and must not be added to `src/services/zkp/artifacts` or to this runtime registry.
