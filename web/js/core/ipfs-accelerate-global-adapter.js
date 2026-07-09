/**
 * IPFS Accelerate global-only capability adapter (SWR-042 / SWR-036-FU-005).
 *
 * `web/js/apps/neural-network-designer.js` and `web/js/apps/training-manager.js`
 * both offer an *optional* local IPFS Accelerate acceleration backend. Prior
 * to SWR-042 each app duplicated a `loadLocalIPFSAccelerateClass()` helper
 * that, when a runtime flag (`window.__SWISSKNIFE_ENABLE_LOCAL_IPFS_ACCELERATE_IMPORT__`)
 * was set, dynamically imported the raw host-oriented
 * `ipfs_accelerate_js/src/index.js` module directly into the browser bundle
 * graph through a computed, non-literal dynamic import expression. That made
 * the browser compatibility inventory unable to prove the browser bundle
 * never pulls a host-only IPFS Accelerate implementation (see
 * `docs/browser-compatibility-inventory.md`).
 *
 * This adapter replaces that pattern with a strictly **global-only**
 * capability: it only ever reads `window.IPFSAccelerate`. There is no
 * dynamic `import()` of `ipfs_accelerate_js/src` anywhere in the browser
 * bundle graph. Host embedders (Electron shell, desktop preload script, or
 * an operator-controlled `<script>` tag) that want to offer the local IPFS
 * Accelerate backend must set `window.IPFSAccelerate` themselves before the
 * app initializes it — the browser build never fetches or evaluates that
 * host-oriented source on its own.
 */

/**
 * Returns the host-provided IPFS Accelerate class, if any.
 *
 * @returns {Function|null} The `IPFSAccelerate` constructor exposed by a
 *   host embedder via `window.IPFSAccelerate`, or `null` when unavailable
 *   (including in non-browser environments).
 */
export function loadLocalIPFSAccelerateClass() {
  if (typeof window !== 'undefined' && window.IPFSAccelerate) {
    return window.IPFSAccelerate;
  }
  return null;
}

/** True when a host-provided IPFS Accelerate global is currently available. */
export function isLocalIPFSAccelerateAvailable() {
  return typeof window !== 'undefined' && Boolean(window.IPFSAccelerate);
}
