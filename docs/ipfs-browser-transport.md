# IPFS Browser Transport Strategy

SWR-017 splits IPFS runtime imports by execution environment:

- Browser code imports `src/services/ipfs/browser.ts`.
- Host, CLI, daemon, filesystem, Python, and native IPFS code imports `src/services/ipfs/host.ts`.

The browser entrypoint is browser-safe by construction. It uses gateway reads, explicitly configured IPFS HTTP API endpoints, and the browser libp2p runtime from `src/services/mcp/libp2p-browser-runtime.ts`. It does not import Node filesystem, process, subprocess, Python, native modules, or the host IPFS client.

## Browser Runtime

`createBrowserIPFSTransport()` exposes:

- `cat()` and `catText()` through an explicit HTTP API endpoint when configured, otherwise through an HTTPS gateway.
- `add()`, `pin()`, `unpin()`, `listPins()`, `id()`, and `version()` through a configured browser-reachable IPFS HTTP API endpoint.
- `getLibp2pConfig()` and `createLibp2pNode()` through the browser libp2p assembly layer.
- `report`, which lists enabled adapters, disabled adapters, capability gaps, and host-only operations.

Default browser behavior:

- Gateway reads use `https://ipfs.io` unless `gateway.baseUrl` is supplied.
- HTTP API operations are disabled until `httpApi.baseUrl` is supplied. Browser code must not assume `localhost:5001`.
- libp2p is opt-in per transport options and reports missing optional packages as capability gaps.
- Host-only capabilities are always reported as unavailable in the browser report: daemon lifecycle, filesystem import/export, Python bridges, and native IPFS CLI calls.

Example:

```ts
import { createBrowserIPFSTransport } from './src/services/ipfs/browser.js';

const ipfs = createBrowserIPFSTransport({
  gateway: { baseUrl: 'https://w3s.link' },
  httpApi: { baseUrl: 'https://ipfs-api.example.com/api/v0' },
  libp2p: { enabled: true, pubsub: true },
});

const bytes = await ipfs.cat('bafy...');
const added = await ipfs.add('browser content', { pin: true });
console.log(ipfs.report.capabilities, added.cid, bytes.byteLength);
```

## Host Runtime

`createHostIPFSTransport()` owns host-only behavior:

- Existing `IPFSKitClient` HTTP API access.
- Filesystem import through `addFile()`.
- Local daemon lifecycle through `startDaemon()`.
- Native IPFS CLI calls through `runNativeIPFS()`.
- Python module bridges through `runPythonModule()`.

Host capability switches can disable daemon, filesystem, Python, or native CLI access for restricted host processes. Disabled host capabilities throw if invoked.

Example:

```ts
import { createHostIPFSTransport } from './src/services/ipfs/host.js';

const ipfs = createHostIPFSTransport({
  apiUrl: 'http://127.0.0.1:5001/api/v0',
  enableDaemon: true,
  enableFilesystem: true,
  enableNativeIpfs: true,
});

const daemon = await ipfs.startDaemon();
try {
  const result = await ipfs.addFile('/tmp/model.bin', { pin: true });
  console.log(result.cid);
} finally {
  await daemon.stop();
}
```

## Import Rules

Browser-facing modules must not import:

- `src/services/ipfs/host.ts`
- `src/ipfs/client.ts`
- `src/storage/backends/ipfs-backend.ts`
- `src/storage/local/*`
- Node modules such as `fs`, `child_process`, `stream`, or `node:*`

Host-facing modules may import the browser entrypoint only for type-compatible reporting or shared orchestration, but browser modules must never import host entrypoints.

## Capability Reporting

Both entrypoints expose a `report` object. Consumers should inspect the report before showing UI actions:

- Show read actions when `gateway-read` or `http-api-read` is enabled.
- Show add and publish actions when `http-api-write` is enabled.
- Show pin controls when `http-api-pin` is enabled.
- Show daemon/filesystem/Python/native controls only from host surfaces.
- Display capability gaps directly instead of substituting local fake transports.

This keeps browser bundles honest: browser IPFS features use browser-reachable adapters, while host-only IPFS operations remain explicit and auditable.
