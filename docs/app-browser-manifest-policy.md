# App Browser Manifest Policy

Every SwissKnife desktop/web application is described by a normalized **app
manifest** (`src/services/apps/app-manifest.ts`). A manifest declares the
app's runtime class, whether the browser build may run it, which
capabilities it depends on, and how a loader should obtain its module code
(or why it cannot). This policy exists so that web bundles ship only
browser-safe app code, and so that host-only functionality is always
represented as an explicit unavailable/remote capability instead of being
silently bundled, broken, or missing.

## Runtime Classes

Every manifest declares exactly one `runtime_class`:

| Class | Meaning | `browser.supported` | `lazy_import.kind` |
|---|---|---|---|
| `browser-safe` | Runs entirely in the browser. | `true` | `dynamic-import` |
| `hybrid` | Browser UI/logic runs fully in-browser; one or more optional features degrade or require an optional host bridge capability. | `true` (with `degraded`/`reason`) | `dynamic-import` |
| `host-only` | Can only run on a host runtime (Node, Electron main process, CLI). Must never enter a browser bundle. | `false` | `unavailable` |
| `remote-capability` | Functionality lives on a host reached only through a remote MCP connector/descriptor. No host module code enters the browser bundle. | `true` (degraded, via remote bridge) | `remote-descriptor` |

`src/services/apps/app-manifest.ts` exports `APP_RUNTIME_CLASSES` and
`validateAppManifest()`, which enforces the consistency rules in the table
above (e.g. a `host-only` manifest cannot declare a `dynamic-import`
`lazy_import.module`, and a `browser-safe`/`hybrid` manifest must declare
one).

## Manifest Shape

```ts
interface AppManifest {
  app_id: string;
  name: string;
  category?: string;
  runtime_class: 'browser-safe' | 'hybrid' | 'host-only' | 'remote-capability';
  browser: {
    supported: boolean;
    reason?: string;
    unavailable_capability_id?: string; // required for host-only/remote-capability
    degraded?: boolean;
  };
  required_capabilities: readonly string[];
  lazy_import: {
    kind: 'dynamic-import' | 'remote-descriptor' | 'unavailable';
    module?: string;        // relative specifier, dynamic-import only
    descriptor_ref?: string; // stable id, remote-descriptor only
  };
}
```

## Canonical Registry

`src/services/apps/app-manifest-registry.ts` is the canonical registry for
every application surfaced by the SwissKnife web desktop
(`web/index.html` -> `web/js/main-simple.js`):

- **38 `browser-safe`/`hybrid` apps** — one manifest per app file under
  `web/js/apps/*.js` that `main-simple.js` actually imports (e.g.
  `ai-chat`, `terminal`, `file-manager`, `p2p-network`). Each declares a
  `lazy_import.module` pointing at the same relative specifier
  `main-simple.js` already uses, so the manifest and the shipped loader
  never drift.
- **1 illustrative `host-only` app** (`swissknife-cli-console`) — represents
  the SwissKnife host CLI console, which uses `child_process` and local
  filesystem access (see `src/module-ownership.json`: `commands` and
  `entrypoints` are both `host-only`). `browser.supported` is `false` and
  `lazy_import.kind` is `unavailable`: no module reference exists for a web
  bundle to (mis)import.
- **1 illustrative `remote-capability` app** (`remote-cli-bridge`) — the same
  host capability, reachable from the browser only once a remote MCP host
  bridge connection is established. `lazy_import.kind` is
  `remote-descriptor`; the browser bundle never imports host module code,
  it resolves the capability by descriptor id through a live connector.

Legacy/backup app files that `main-simple.js` no longer imports (`-old`,
`-broken`, `-fixed`, `-simple`, `-offline`, `-real`, `-functions`, `-ui`,
`-backup` variants) are intentionally **excluded** from the registry
(`EXCLUDED_LEGACY_APP_IDS`) and have been physically archived out of
`web/js/apps/` into `web/legacy-archive/js/apps/` (SWR-026; see
`docs/legacy-web-cleanup.md` for the full inventory and ownership). They
must not be treated as shipped app manifests, restored into `web/js/apps/`,
or re-added to this registry without an explicit decision recorded in that
document.

## Deriving Manifests From the All-Tools Policy Pipeline

Two modules turn the all-tools MCP/MCP++ tool ledger into app manifests
automatically, so new tools/apps inherit correct runtime classification
without hand-authored manifests:

- `src/services/apps/all-tools-policy-classifier.ts` exports
  `classifyAppRuntimeClassFromPolicyRule(rule)`, which intrinsically
  classifies a single governed tool as `browser-safe` or `host-only` based
  on its category/policy_class/owner_module (filesystem, subprocess,
  native, hardware, device, ... keywords) or `high_risk` +
  `sensitive` + `side_effectful` combination — independent of the rule's
  current `app_visible` flag. `validateAppRuntimeClassificationExposure(matrix)`
  then fails when a rule classified `host-only` is (incorrectly) marked
  `app_visible`, catching ledger/matrix drift before it reaches a bundle.
- `src/services/apps/all-tools-app-binding-matrix.ts` exports
  `buildAppManifestsFromBindingMatrix(matrix)`, which groups every
  `app_visible` binding row by `app_id` and builds one normalized
  `AppManifest` per app: the union of bound `capability_id`s becomes
  `required_capabilities`, and the most-restrictive per-tool runtime class
  (`combineAppRuntimeClasses`) becomes the app's `runtime_class`.
  `validateAppManifestCoverage(matrix, manifests)` fails when any
  `app_visible` `app_id` in the matrix has no corresponding manifest.

## Web Bundle Loader

`web/src/apps/app-manifest-loader.ts` is the browser-side consumer of the
registry. `loadApp(appId)`:

1. Looks up the app's manifest. Unknown ids resolve to `not_found`.
2. When `browser.supported` is `false`, or `lazy_import.kind` is not
   `dynamic-import`, returns an `unavailable` (host-only) or `remote`
   (remote-capability) result — **no `import()` call is made**, so
   host-only module code (if it even exists) can never enter the browser
   bundle graph.
3. Otherwise resolves the module through a literal, statically-analyzable
   `import()` table (`BROWSER_APP_IMPORTERS`), one entry per browser-safe/
   hybrid app, so bundlers can code-split each app into its own lazily
   fetched chunk — the same per-app lazy-import pattern
   `web/js/main-simple.js` already uses, centralized and driven by manifest
   metadata instead of ad hoc per-app branches.

`assertAppRegistryConsistency()` verifies the importer table exactly
matches the registry's `dynamic-import` manifests in both directions and is
exercised by the SWR-023 test suite.

`web/desktop.ts` (loaded by `web/index.vite.html`, the Vite-native desktop
entry point) wires the loader into `MiniDesktop.launchManifestApp(appId)`:
loaded apps mount their module output, and unavailable/remote apps render
an explanatory panel naming the missing capability id or remote descriptor
ref instead of failing silently.

## Adding a New App

1. Add the app's UI module under `web/js/apps/<app_id>.js` (or the
   browser-safe location your app actually lives in).
2. Add a manifest entry to `SWISSKNIFE_WEB_APP_MANIFESTS` in
   `app-manifest-registry.ts`:
   - `runtime_class: 'browser-safe'` if the app has no host/optional
     dependency, or `'hybrid'` if part of it degrades without an optional
     host bridge capability (set `browser.degraded = true` and explain the
     degradation in `browser.reason`).
   - List every capability the app depends on in `required_capabilities`.
   - Set `lazy_import` to `{ kind: 'dynamic-import', module: '../../js/apps/<app_id>.js' }`.
3. Add a matching literal `import()` entry to `BROWSER_APP_IMPORTERS` in
   `web/src/apps/app-manifest-loader.ts`.
4. If the app (or a specific capability of an existing app) can genuinely
   never run in the browser, mark it `host-only` (`browser.supported:
   false`, `lazy_import.kind: 'unavailable'`) instead of shipping broken
   module code, or `remote-capability` if it can be reached through a
   remote MCP connector.

## Validation

```sh
cd swissknife
npm run test:run -- test/mcp-plus-plus/all-tools-app-binding-matrix.test.ts test/mcp-plus-plus/all-tools-policy-classifier.test.ts
npm run typecheck:browser
npm run build:web
```

`npm run build:web` also runs `node scripts/audit-web-bundle.mjs
--fail-on-host-leakage`, which fails the build if any host-only token
(`child_process`, `fs`, `worker_threads`, ...) is statically reachable from
the shipped bundle — the same gate that guarantees a `host-only` manifest's
"no module code" contract holds in practice, not just on paper.
