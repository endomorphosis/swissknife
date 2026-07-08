# Browser Python Policy

SwissKnife web builds must not treat Pyodide or any in-browser Python runtime as a default dependency. Browser Python is an optional sandbox capability for user-selected features only.

## Default Runtime

- Default browser NLP uses `regexFallbackExtract` from `src/services/integrations/spacy-wasm-nlp.ts`.
- `new SpacyWasmNlp()` and `extractPredicatesNlp()` do not load Pyodide.
- Service barrels, browser platform entrypoints, and ordinary web chunks must not statically import `pyodide` or expose `loadPyodide` calls.
- The legacy `src/services/spacy-wasm-nlp.ts` file is a compatibility re-export and must stay browser-safe.

## Optional Sandbox Activation

Browser Python may be enabled only by code that is already behind a user-selected capability, such as an advanced NLP sandbox setting:

```ts
import {
  SpacyWasmNlp,
} from '../services/integrations/spacy-wasm-nlp.js';

const nlp = new SpacyWasmNlp({
  enablePythonSandbox: true,
  pyodideLoader: () => import('pyodide'),
  sandbox: {
    requireSecureContext: true,
    allowNetworkPackageInstall: true,
    maxInputChars: 20_000,
  },
});
```

The sandbox contract is intentionally explicit:

- A caller must set `enablePythonSandbox: true` or `sandbox.enabled: true`.
- Secure browser contexts are required by default.
- Package installation is allowed only when the sandbox is enabled or when a caller explicitly sets `allowNetworkPackageInstall`.
- Python runtime loading is lazy and happens during `initialize()`, not during module import.
- Bundled apps should place the literal `import('pyodide')` loader inside the user-selected feature module so Vite emits it as an optional lazy chunk.
- The runtime is held inside the integration instance and is not written to `window` or another global.

## Audit Gate

Run this gate after `npm run build:web`:

```sh
node scripts/audit-web-bundle.mjs --fail-on-default-pyodide
```

The gate fails when Pyodide package modules or Pyodide execution APIs are statically reachable from default web entry chunks or loaded directly by default HTML. General Python language references in editor demos are reported as exposure findings, but they do not fail this gate.

Optional lazy chunks may contain browser Python only when they are reachable through an explicit user-selected sandbox feature and remain outside the default static entry graph.
