# Browser Distribution Policy

SwissKnife publishes a host CLI and a browser-safe package surface from the
same repository. Browser consumers must resolve the `browser` condition or one
of the documented browser subpath exports below. They must not import the host
CLI root, root service compatibility files, subprocess adapters, Python
wrappers, filesystem backends, native prover shims, or Node worker runtimes.

## Package Entrypoints

The package root uses conditional exports:

- `swissknife` resolves to `./src/browser.ts` when the bundler honors the
  `browser` condition.
- `swissknife/browser` resolves to the same browser facade in every condition.
- The legacy `browser` field also points to `./src/browser.ts` for bundlers
  that still consult that field before `exports`.

The browser subpaths are:

| Import | Browser target | Purpose |
| --- | --- | --- |
| `swissknife/browser` | `src/browser.ts` | Aggregated browser facade for platform, AI/model browser adapters, MCP, IPFS, storage, workers, logic-language, deontic NLP, and ZKP APIs. |
| `swissknife/mcp` | `src/services/mcp/browser-mcp.ts` | Browser-safe MCP descriptor canonicalization, CID helpers, and in-memory interface repository. |
| `swissknife/mcp/libp2p` | `src/services/mcp/libp2p-browser-runtime.ts` | Browser libp2p runtime assembly using optional real libp2p modules. |
| `swissknife/libp2p` | `src/services/mcp/libp2p-browser-runtime.ts` | Convenience alias for the browser libp2p runtime. |
| `swissknife/ipfs` | `src/services/ipfs/browser.ts` | Browser IPFS gateway, HTTP API, and libp2p transport adapter. |
| `swissknife/storage` | `src/storage/browser.ts` | IndexedDB, OPFS, Cache Storage, and injected browser-IPFS storage provider. |
| `swissknife/workers` | `src/workers/browser.ts` | Web Worker client and pool APIs. |
| `swissknife/logic-language` | `src/services/logic/api/reasoning-normalization-pipeline.ts` | Browser-safe logic language preprocessing, normalization, and conversion helpers. |
| `swissknife/deontic-nlp` | `src/services/logic/deontic/browser-nlp.ts` | Regex/deontic natural-language extraction and conflict analysis. |
| `swissknife/proof-engine` | `src/services/proof-engine/proof-engine-browser.ts` | Browser proof facade and worker-verifier orchestration. |
| `swissknife/provers` | `src/services/provers/provers-browser.ts` | Bounded browser-safe TypeScript theorem prover. |
| `swissknife/zkp` | `src/services/zkp/browser-zkp.ts` | Browser Groth16 artifact metadata/backend, default Schnorr/WASM backend, and browser crypto helpers. See `docs/browser-wasm-zkp-policy.md`. |

Browser-facing adapters share contract types through
`src/shared/service-contracts`. Those files are type-only, runtime-neutral, and
contain no filesystem, subprocess, Python, native prover, Electron, daemon, or
Node worker imports. Browser modules should import shared contracts or browser
implementations only; host adapters are never type barrels for browser code.

## Forbidden Browser Package Reachability

Browser exports must not statically or dynamically pull:

- Node builtins such as `fs`, `path`, `child_process`, `worker_threads`,
  `net`, `tls`, `readline`, or `node:*` equivalents.
- Host adapters such as `src/services/ipfs/host.ts`, `src/storage/host.ts`,
  and `src/workers/host.ts`.
- Python wrappers or default Pyodide loaders. Browser Python remains an
  explicit opt-in sandbox only, documented in `docs/browser-python-policy.md`.
- Subprocess, native prover, or host prover adapter files such as external
  prover wrappers, ProveKit cache/setup artifacts, or installer shims.
- Root duplicate service files removed by the service-boundary cleanup:
  `src/services/nlp-predicate-extractor.ts`,
  `src/services/spacy-wasm-nlp.ts`, and
  `src/services/zkp-ucan-bridge.ts`.

## MCP Browser Policy

The generic MCP-IDL implementation uses Node `crypto` and `Buffer`, so browser
package exports use `src/services/mcp/browser-mcp.ts` instead. That facade provides
the same browser-facing descriptor operations using dependency-free UTF-8
encoding and browser-safe SHA-256 helpers.

Browser libp2p remains separate at `swissknife/mcp/libp2p` and
`swissknife/libp2p`. It loads real libp2p modules lazily and reports missing
optional packages as capability gaps instead of substituting local stand-ins.

## Validation

Run the browser distribution gate before release:

```sh
npm run test:browser-compat
npm run build:web
```

`test/browser-compat/browser-entrypoints.test.js` locks the export map, confirms
each browser target exists, and walks local runtime import graphs for forbidden
host modules and quarantined adapter paths. `build:web` then verifies the
production bundle and host-leakage budget.
