# Browser WASM ZKP Policy

SwissKnife browser ZKP exports must use real browser-capable proof paths by
default. The default package entrypoint is `swissknife/zkp`, backed by
`src/services/zkp/browser-zkp.ts`.

## Default Backend

The default browser backend is:

`browser-schnorr-wasm`

This backend is implemented by `src/services/zkp-browser-schnorr.ts`. It creates
and verifies Schnorr Fiat-Shamir proofs in TypeScript and instantiates the
committed WASM helper at `src/services/zkp/artifacts/schnorr-field.wasm.b64`
before proof generation or verification.

Use:

```ts
import { generateDefaultBrowserZkpProof, verifyDefaultBrowserZkpProof } from 'swissknife/zkp';
```

The default helpers reject simulated proof envelopes and return `false` for
simulated verification attempts.

## Groth16 Browser Path

The production Groth16 browser backend is:

`snarkjs-browser-groth16`

It is implemented by `src/services/zkp/browser-snarkjs-backend.ts` and uses the
committed SnarkJS artifacts documented in `docs/browser-zkp-artifacts.md`.
Artifact integrity is strict by default for bundled artifacts.

Use:

```ts
import { createDefaultBrowserZkpBackend } from 'swissknife/zkp';

const backend = createDefaultBrowserZkpBackend({
  backend: 'snarkjs-browser-groth16',
});
```

## Simulation Policy

Simulation is not a browser production fallback. These identifiers are rejected
by production browser backend selection and proof verification:

- `simulated`
- `simulated-zkp`
- `simulated-zkp-v0.1`
- `test-only-simulated-zkp`
- `groth16-simulated`
- `test-only`

The deterministic helper in `src/services/zkp/zkp-simulated-prover.ts` is kept
for legacy and offline tests only. Tests that need it must import through an
explicit fixture such as
`test/mcp-plus-plus/fixtures/explicit-simulated-zkp-fixture.ts`.

## Regression Gates

`test/mcp-plus-plus/wasm-prover-browser-purity.test.ts` enforces:

- browser-facing ZKP modules do not import Node host APIs
- browser-facing ZKP modules do not import `zkp-simulated-prover`
- default browser proof generation uses `browser-schnorr-wasm`
- simulated proof envelopes are rejected by default verification
- explicit simulation remains isolated to named test fixtures

The SWR-094 validation command is:

```bash
npm run test:browser-compat
npm run test:fast -- test/mcp-plus-plus/wasm-prover-browser-purity.test.ts
```
