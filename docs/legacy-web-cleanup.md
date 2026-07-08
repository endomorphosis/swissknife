# Legacy Web JavaScript Cleanup (SWR-026)

This document tracks the broken/backup/corrupt web JavaScript and
TypeScript files that were removed from `web/js` and `web/src` and archived
under `web/legacy-archive/`, why each one was archived, and who owns the
decision to restore or permanently delete them.

## Why this cleanup happened

`web/js/apps/*.js` and `web/src/*.ts` mixed actively maintained,
production-shipped browser code with a long tail of duplicate, superseded,
and outright corrupted files left over from earlier rewrites (`-old`,
`-broken`, `-fixed`, `-simple`, `-offline`, `-real`, `-functions`, `-ui`,
`-backup` variants, plus a few unsuffixed casualties of failed merges).

`src/services/apps/app-manifest-registry.ts` (SWR-011) already listed the
`web/js/apps/*.js` subset of these files in `EXCLUDED_LEGACY_APP_IDS` so
they could never be shipped as app manifests, but the files themselves
still lived inside the active `web/js`/`web/src` trees. That meant:

- `web/tsconfig.json` (`npm run typecheck:legacy:web`) globbed `**/*.ts` and
  `js/**/*.js` with `allowJs: true`, so it parsed corrupted files (some with
  hard syntax errors, some silently "commented out" by a broken doc-comment)
  as if they were production source.
- Any tool that walks `web/js` or `web/src` by directory instead of via the
  app manifest registry (an IDE-wide "compile the project" pass, a future
  bundler, a documentation/audit generator) could pick up broken code by
  accident.

The maintained browser lanes (`npm run typecheck:browser` via
`tsconfig.browser.json`, and `npm run build:web` via `vite.web.config.ts`)
already used explicit file lists / reachability from `web/index.html`, so
they never actually shipped or type-checked these files — but their
presence in the source tree was still a foot-gun and a documentation gap.
This cleanup physically separates them out.

## What moved where

All files below were moved with `git mv` (history preserved) from their
original path to the mirrored path under `web/legacy-archive/`. None of them
are imported by `web/js/main-simple.js`, `web/index.html`,
`tsconfig.browser.json`'s file list, or `web/webpack.browser.config.js`'s
entry graph (`web/src/browser-main-working.ts`) — i.e. none of this is
reachable from any active build or typecheck lane, before or after the move.

### `web/js/apps/` → `web/legacy-archive/js/apps/`

Matches `EXCLUDED_LEGACY_APP_IDS` in `src/services/apps/app-manifest-registry.ts`.

| File | Reason archived |
|---|---|
| `neural-network-designer-old.js` | Superseded by `neural-network-designer.js`; `-old` duplicate, has TS parse errors under `allowJs`. |
| `p2p-chat-offline.js` | Superseded by `p2p-chat-unified.js`; unreferenced. |
| `p2p-chat-real.js` | Superseded by `p2p-chat-unified.js`; unreferenced. |
| `p2p-network-functions.js` | Superseded by `p2p-network.js`; unreferenced. |
| `p2p-network-ui.js` | Superseded by `p2p-network.js`; unreferenced. |
| `settings-backup.js` | Backup copy of `settings.js`; has TS parse errors under `allowJs`. |
| `strudel.js` | Superseded by `strudel-ai-daw.js`/`strudel-grandma.js`; unreferenced. |
| `strudel-broken.js` | Named/known-broken; has TS parse errors under `allowJs`. |
| `strudel-grandma-broken.js` | Named/known-broken; has TS parse errors under `allowJs`. |
| `strudel-grandma-fixed.js` | Intermediate duplicate of `strudel-grandma.js` (the version actually imported by `main-simple.js`); unreferenced. |
| `strudel-simple.js` | Superseded by `strudel-ai-daw.js`; unreferenced. |
| `vibecode-broken.js` | Named/known-broken; ~1,700 TS parse errors (malformed JSX-like template text) under `allowJs`. |

### `web/js/adapters/` → `web/legacy-archive/js/adapters/`

| File | Reason archived |
|---|---|
| `enhanced-cli-adapter.js` | Unreferenced by any app/entry; uses TypeScript-only syntax (`as` assertions) inside a `.js` file, which fails under `allowJs`. |

### `web/src/` → `web/legacy-archive/src/`

| File | Reason archived |
|---|---|
| `browser-main.ts` | Corrupt: unterminated string/regex literal (`TS1002`/`TS1161`) partway through the file. Only referenced by the also-archived `webpack.enhanced.config.js`. |
| `browser-main-enhanced.ts` | Corrupt: dozens of parse errors from unbalanced braces/JSX-like markup. Fully unreferenced (not used by any build config). |
| `browser-minimal.ts` / `browser-minimal.js` | Unreferenced duplicate demo pair — the `.js` file is a stale, manually-forked plain-JS copy of the `.ts` file (compares near-identically except for export style). Neither is imported anywhere. |
| `adapters/task-adapter-old.ts` | Silently corrupted: an unclosed `/**` doc comment swallows the entire `export class SwissKnifeTaskAdapter { ... }` body into a comment, so the "real" implementation never executes even though the file has no hard syntax error. `-old` duplicate of `adapters/task-adapter.ts`; unreferenced. |
| `swissknife-browser-bridge.ts` | Unreferenced; API has drifted from the adapters it imports (`SwissKnifeAIAdapter`/`SwissKnifeTaskAdapter` no longer expose the methods it calls — `setCurrentProvider`, `setApiKey`, `createTaskGraph`, etc.), so it no longer type-checks once parsed as production source. |
| `swissknife-browser-core-simple.ts` | Unreferenced `-simple` duplicate of the maintained `swissknife-browser-core.ts`; API has drifted from the browser adapters it imports in the same way as the bridge file above. |

### `web/` root → `web/legacy-archive/`

| File | Reason archived |
|---|---|
| `main.ts` | Explicitly marked `// FILE INTENTIONALLY TRUNCATED` / `// CLEAN REBUILD AFTER CORRUPTION` in its own header comment, and was already special-cased out of `web/tsconfig.json`'s `exclude` list with a `// temporarily excluded due to corruption cleanup in progress` comment pointing at this exact cleanup. Unreferenced by any build entry. |
| `test-compilation.ts` | Manual scratch file for probing whether individual `src/*` modules compile in isolation; not production code, imports `src/*` paths that violate `web/tsconfig.json`'s `rootDir`, and was only ever wired into the also-archived `webpack.test.config.js`. |
| `webpack.enhanced.config.js` | Dead build config (not referenced by any `package.json` script in `swissknife/` or `web/`); its only entry point (`browser-main-enhanced.ts`) is corrupt and is archived above. |
| `webpack.test.config.js` | Dead build config (not referenced by any `package.json` script); its only entry point (`test-compilation.ts`) is archived above. |

## What did *not* move (explicitly out of scope)

- `web/webpack.browser.config.js` + `web/src/browser-main-working.ts` +
  `web/tsconfig.web.json` — this is a second, currently-working browser
  build lane (`npm run web:build` / `web:dev` / `web:serve`), called out as
  an "active browser build input" in `docs/browser-compatibility-inventory.md`.
  Not touched other than the config hygiene fix described below.
- `web/webpack.minimal.config.js`, `web/webpack.simple.config.js`,
  `web/webpack.working.config.js`, `web/webpack.config.js` — orphaned (no
  `package.json` script references them) but their entry points
  (`js/test.js`, `js/main.js`, `js/main-working.js`,
  `js/swissknife-browser.js`) are not corrupt or named as backups, so they
  were left in place to avoid removing code that may still be used for
  manual/local debugging. These remain a candidate for a future,
  separately-scoped cleanup.
- `web/src/orb-dynamic-app-renderer.ts` — unreferenced today but not
  corrupt, broken, or named as a backup/duplicate; left in place as a
  plausible in-progress feature rather than legacy debt.
- The many standalone demo/debug HTML files at the `web/` root
  (`aero-test.html`, `debug.html`, `demo.html`, `index-enhanced.html`,
  `index-simple.html`, `index.html.original`, `swissknife-working.html`,
  `template.html`, `test-*.html`, ...) — not JavaScript/TypeScript source
  parsed by any typecheck lane, and out of scope for this task.

## Type/build lane changes

- `web/tsconfig.json` (`npm run typecheck:legacy:web`):
  - `exclude` now includes `legacy-archive` so the archived files (which
    still physically exist on disk) are never picked up by the `**/*.ts` /
    `js/**/*.js` globs again.
  - Removed the stale `"main.ts"` exclude entry (the file no longer lives at
    that path) and its "corruption cleanup in progress" comment — this
    cleanup is that fix.
  - Removed `"composite": true`. Nothing in the repo declares a TypeScript
    project reference to `web/tsconfig.json`, so `composite` was a
    vestigial setting; combined with the pre-existing `"declaration": false`
    it produces an unconditional `TS6304` config error ("Composite projects
    may not disable declaration emit") that was previously masked only
    because the archived files' syntax errors were reported first. Now that
    those files are gone, `composite` had to go too or the lane could never
    pass.
  - Removed `"rootDir": "."`. Several actively maintained files (e.g.
    `web/src/swissknife-browser-core.ts`) legitimately import across the
    `web/` boundary (`../../src/platform/browser.ts`); with an explicit
    `rootDir` these become `TS6059` errors once the corrupt files stop
    swallowing them. The script runs with `--noEmit`, so removing `rootDir`
    has no effect on any emitted output.
- `web/tsconfig.web.json` (used by `web/webpack.browser.config.js`'s
  `ts-loader`, the active webpack build lane): removed the same vestigial
  `"composite": true` for consistency; `rootDir` was left untouched here
  since the active entry graph never reaches the archived/rootDir-violating
  files, so it was lower risk to leave unless a future task needs it.
- `tsconfig.browser.json` / `npm run typecheck:browser` and
  `vite.web.config.ts` / `npm run build:web` were **not modified** — they
  already only referenced explicit maintained files / files reachable from
  `web/index.html`, and continue to pass unchanged.
- `src/services/apps/app-manifest-registry.ts` and
  `docs/app-browser-manifest-policy.md` were updated to point at the new
  `web/legacy-archive/js/apps/` location instead of describing the files as
  still living under `web/js/apps/*.js`.
- `docs/browser-compatibility-inventory.md` was regenerated via
  `node scripts/audit-browser-compat.mjs --report docs/browser-compatibility-inventory.md`
  so its file paths reflect the new archive location.

## Ownership and restoring an archived file

Default disposition: **archived files are not deleted** so their history
and content remain available for reference, but they must not be un-archived
without an explicit decision. Ownership follows the same module ownership
used for the app they belong to:

- Files under `web/legacy-archive/js/apps/` and
  `web/legacy-archive/js/adapters/` are owned by the **`service-apps`**
  module (see `src/services/apps/app-manifest-registry.ts`,
  `owner_module: 'service-apps'`).
- Files under `web/legacy-archive/src/` and `web/legacy-archive/` (root)
  are owned by the **`refactor/web-legacy`** track (this backlog track).

To restore a file:

1. Fix the underlying corruption/API drift documented in the table above.
2. Move it back with `git mv web/legacy-archive/<path> web/<path>`.
3. If it is an app under `web/js/apps/`, remove its `app_id` from
   `EXCLUDED_LEGACY_APP_IDS` and add a real manifest entry in
   `src/services/apps/app-manifest-registry.ts`.
4. Re-run `npm run typecheck:browser`, `npm run typecheck:legacy:web`, and
   `npm run build:web` to confirm the restored file doesn't regress any
   lane, and update this document to remove the entry.

To permanently delete an archived file instead of keeping it, get sign-off
from the module owner above and remove it in a follow-up change with its
own commit message explaining why it is safe to delete (e.g. fully
superseded, no historical value).

## Validation

- `cd swissknife && npm run typecheck:browser` — passes (unchanged from
  before this cleanup; this lane never referenced the archived files).
- `cd swissknife && npm run build:web` — passes (unchanged from before this
  cleanup; same 43 audited bundle files, 0 host leakage).
- `cd swissknife && npm run typecheck:legacy:web` — the corrupted/backup
  files no longer produce any diagnostics (they're excluded via
  `legacy-archive`); the two config bugs this cleanup exposed
  (`composite`/`declaration` conflict, `rootDir` false-positives on
  maintained cross-boundary imports) are fixed. Remaining diagnostics in
  this lane are pre-existing type debt in actively maintained files
  (`noUnusedLocals`/`noUnusedParameters` violations, Node `Buffer` vs
  browser `Uint8Array` type mismatches, etc.) — out of scope for this task
  per SWR-025, which intentionally isolates legacy host/type debt behind
  explicit `typecheck:legacy*` scripts instead of blocking
  `typecheck:browser`.
