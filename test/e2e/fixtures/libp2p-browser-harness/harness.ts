/** SWR-138 real-browser libp2p harness.  No stream, peer, or response here is synthetic. */
import {
  buildBrowserLibp2pConfig,
  createBrowserLibp2pNode,
  type BrowserLibp2pImport,
} from '../../../../src/services/mcp/libp2p-browser-runtime';
import { multiaddr } from '@multiformats/multiaddr';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PROTOCOL = '/swissknife/swr-138/signed-request/1.0.0';
const TIMEOUT_PROTOCOL = '/swissknife/swr-138/deadline/1.0.0';

type Libp2pNode = {
  peerId: { toString(): string };
  start(): Promise<void>;
  stop(): Promise<void>;
  dial(address: unknown): Promise<unknown>;
  dialProtocol(address: unknown, protocol: string, options?: { runOnTransientConnection?: boolean }): Promise<Stream>;
  handle(protocol: string, handler: (input: { stream: Stream }) => Promise<void> | void, options?: { runOnTransientConnection?: boolean }): Promise<void>;
  getMultiaddrs(): Array<{ toString(): string }>;
  getConnections(peerId?: unknown): Array<{ encryption?: string; multiplexer?: string; status?: string }>;
};

type Stream = {
  source: AsyncIterable<{ subarray?: () => Uint8Array } | Uint8Array>;
  sink(source: AsyncIterable<Uint8Array>): Promise<void>;
  close(): Promise<void>;
};

type KeyPair = { algorithm: 'Ed25519' | 'ECDSA-P256'; privateKey: CryptoKey; publicKey: CryptoKey };
type NodeHandle = { node: Libp2pNode; peerId: string; relayEndpoint: string; keys: KeyPair };

export interface FailureReceipt {
  schema: 'swr-138.browser-libp2p.failure.v1';
  kind: 'missing-capability' | 'permission-blocked' | 'relay-lost' | 'timeout';
  code: string;
  phase: string;
  cause: string;
  at: string;
}

function canonical(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function toBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function createSigningKeys(): Promise<KeyPair> {
  try {
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    return { algorithm: 'Ed25519', privateKey: pair.privateKey, publicKey: pair.publicKey };
  } catch {
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
    );
    return { algorithm: 'ECDSA-P256', privateKey: pair.privateKey, publicKey: pair.publicKey };
  }
}

async function sign(keys: KeyPair, bytes: Uint8Array): Promise<string> {
  const algorithm: AlgorithmIdentifier | EcdsaParams = keys.algorithm === 'Ed25519'
    ? { name: 'Ed25519' }
    : { name: 'ECDSA', hash: 'SHA-256' };
  return toBase64(await crypto.subtle.sign(algorithm, keys.privateKey, bytes));
}

async function verify(algorithm: KeyPair['algorithm'], publicJwk: JsonWebKey, bytes: Uint8Array, signature: string): Promise<boolean> {
  const importAlgorithm: AlgorithmIdentifier | EcKeyImportParams = algorithm === 'Ed25519'
    ? { name: 'Ed25519' }
    : { name: 'ECDSA', namedCurve: 'P-256' };
  const verifyAlgorithm: AlgorithmIdentifier | EcdsaParams = algorithm === 'Ed25519'
    ? { name: 'Ed25519' }
    : { name: 'ECDSA', hash: 'SHA-256' };
  const publicKey = await crypto.subtle.importKey('jwk', publicJwk, importAlgorithm, false, ['verify']);
  return crypto.subtle.verify(verifyAlgorithm, publicKey, fromBase64(signature), bytes);
}

async function readStream(stream: Stream, deadlineMs = 10_000): Promise<unknown> {
  const read = (async () => {
    const chunks: Uint8Array[] = [];
    for await (const value of stream.source) chunks.push(value instanceof Uint8Array ? value : value.subarray!());
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(decoder.decode(combined));
  })();
  return Promise.race([
    read,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`stream deadline exceeded after ${deadlineMs}ms`)), deadlineMs)),
  ]);
}

async function writeJson(stream: Stream, value: unknown): Promise<void> {
  const bytes = canonical(value);
  await stream.sink((async function* () { yield bytes; })());
}

function localRelayWebSocketFilter(addresses: unknown[]): unknown[] {
  // The local relay is TLS/WSS and the test contexts explicitly accept its
  // one-run self-signed certificate. Keeping this explicit makes the harness
  // independent of browser-specific address-filter implementation details.
  return addresses.filter(address => !String(address).includes('/p2p-circuit'));
}

async function literalBrowserImport(specifier: string): Promise<Record<string, unknown>> {
  switch (specifier) {
    case 'libp2p': return import('libp2p') as Promise<Record<string, unknown>>;
    case '@libp2p/webrtc': return import('@libp2p/webrtc') as Promise<Record<string, unknown>>;
    case '@libp2p/websockets': return import('@libp2p/websockets') as Promise<Record<string, unknown>>;
    case '@libp2p/circuit-relay-v2': return import('@libp2p/circuit-relay-v2') as Promise<Record<string, unknown>>;
    case '@chainsafe/libp2p-noise': return import('@chainsafe/libp2p-noise') as Promise<Record<string, unknown>>;
    case '@chainsafe/libp2p-yamux': return import('@chainsafe/libp2p-yamux') as Promise<Record<string, unknown>>;
    case '@libp2p/identify': return import('@libp2p/identify') as Promise<Record<string, unknown>>;
    case '@chainsafe/libp2p-gossipsub': return import('@chainsafe/libp2p-gossipsub') as Promise<Record<string, unknown>>;
    default: throw new Error(`Unexpected browser libp2p dependency: ${specifier}`);
  }
}

async function waitForReservation(node: Libp2pNode, relayMultiaddr: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  const peerId = node.peerId.toString();
  while (Date.now() < deadline) {
    const found = node.getMultiaddrs().map(address => address.toString()).find(address => address.includes('/p2p-circuit'));
    if (found) return `${relayMultiaddr}/p2p-circuit/p2p/${peerId}`;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Circuit relay reservation did not become available before deadline');
}

async function startNode(relayMultiaddr: string): Promise<NodeHandle> {
  const runtime = await createBrowserLibp2pNode({
    // All production browser capabilities remain default-enabled. The only
    // harness-specific input is the address filter accepting the local WSS
    // relay certificate that Playwright deliberately trusts for this run.
    webSocketsOptions: { filter: localRelayWebSocketFilter },
    // A circuit reservation needs an already-open relay connection. Start the
    // real node without listeners, dial the relay, then ask libp2p's actual
    // transport manager to listen on the circuit address.
    libp2pOptions: { start: false, addresses: { listen: [] } },
  });
  if (!runtime.report.enabled || runtime.report.gaps.length !== 0) {
    throw new Error(`Default browser libp2p capabilities unavailable: ${runtime.report.gaps.map(gap => gap.reason).join('; ')}`);
  }
  const node = runtime.node as Libp2pNode;
  await node.start();
  await node.dial(multiaddr(relayMultiaddr));
  await (node as unknown as { components: { transportManager: { listen(addresses: unknown[]): Promise<void> } } })
    .components.transportManager.listen([multiaddr(`${relayMultiaddr}/p2p-circuit`)]);
  const relayEndpoint = await waitForReservation(node, relayMultiaddr);
  return { node, peerId: node.peerId.toString(), relayEndpoint, keys: await createSigningKeys() };
}

async function registerSignedResponder(handle: NodeHandle): Promise<void> {
  await handle.node.handle(PROTOCOL, async ({ stream }) => {
    const request = await readStream(stream) as Record<string, unknown>;
    const requestBody = { nonce: request.nonce, protocol: request.protocol, from: request.from };
    const requestVerified = await verify(
      request.algorithm as KeyPair['algorithm'], request.publicKey as JsonWebKey, canonical(requestBody), request.signature as string,
    );
    if (!requestVerified) throw new Error('Incoming signed request failed WebCrypto verification');
    const responseBody = { nonce: request.nonce, protocol: PROTOCOL, from: handle.peerId, accepted: true };
    const publicKey = await crypto.subtle.exportKey('jwk', handle.keys.publicKey);
    await writeJson(stream, {
      ...responseBody,
      algorithm: handle.keys.algorithm,
      publicKey,
      signature: await sign(handle.keys, canonical(responseBody)),
      requestSignatureVerified: requestVerified,
    });
    await stream.close();
  }, { runOnTransientConnection: true });
  await handle.node.handle(TIMEOUT_PROTOCOL, async ({ stream }) => {
    // A real libp2p handler intentionally holds the stream open. The caller's
    // bounded read, not a canned response, produces the timeout receipt.
    await new Promise<void>(() => undefined);
    await stream.close();
  }, { runOnTransientConnection: true });
}

function connectionMetadata(node: Libp2pNode, peerId: string): { encryption: string; multiplexer: string } {
  const connection = node.getConnections().find(candidate =>
    String((candidate as { remotePeer?: { toString(): string } }).remotePeer?.toString?.() ?? '').includes(peerId),
  ) ?? node.getConnections()[0];
  if (!connection) throw new Error('No real libp2p connection available for negotiation assertion');
  const encryption = connection.encryption ?? '';
  const multiplexer = connection.multiplexer ?? '';
  if (!/noise/i.test(encryption) || !/yamux/i.test(multiplexer)) {
    throw new Error(`Expected Noise and Yamux, got encryption=${encryption || '(none)'} multiplexer=${multiplexer || '(none)'}`);
  }
  return { encryption, multiplexer };
}

async function exchange(sender: NodeHandle, receiver: NodeHandle): Promise<Record<string, unknown>> {
  const nonce = crypto.randomUUID();
  const body = { nonce, protocol: PROTOCOL, from: sender.peerId };
  const publicKey = await crypto.subtle.exportKey('jwk', sender.keys.publicKey);
  const stream = await sender.node.dialProtocol(multiaddr(receiver.relayEndpoint), PROTOCOL, { runOnTransientConnection: true });
  await writeJson(stream, { ...body, algorithm: sender.keys.algorithm, publicKey, signature: await sign(sender.keys, canonical(body)) });
  const response = await readStream(stream) as Record<string, unknown>;
  const responseBody = { nonce: response.nonce, protocol: response.protocol, from: response.from, accepted: response.accepted };
  const responseVerified = await verify(
    response.algorithm as KeyPair['algorithm'], response.publicKey as JsonWebKey, canonical(responseBody), response.signature as string,
  );
  await stream.close();
  if (response.nonce !== nonce || response.accepted !== true || response.requestSignatureVerified !== true || !responseVerified) {
    throw new Error('Signed libp2p response failed nonce, request-verification, or response-verification checks');
  }
  return {
    protocol: PROTOCOL,
    nonce,
    requestSignatureVerified: true,
    responseSignatureVerified: responseVerified,
    requestAlgorithm: sender.keys.algorithm,
    responseAlgorithm: response.algorithm,
    negotiation: connectionMetadata(sender.node, receiver.peerId),
  };
}

function failure(kind: FailureReceipt['kind'], code: string, phase: string, error: unknown): FailureReceipt {
  return { schema: 'swr-138.browser-libp2p.failure.v1', kind, code, phase, cause: error instanceof Error ? error.message : String(error), at: new Date().toISOString() };
}

async function captureMissingCapability(): Promise<FailureReceipt> {
  const importModule: BrowserLibp2pImport = async specifier => {
    if (specifier === '@libp2p/websockets') throw new Error('module intentionally absent from browser capability set');
    return literalBrowserImport(specifier);
  };
  const runtime = await buildBrowserLibp2pConfig({ transportMode: 'relay-only', importModule });
  const gap = runtime.report.gaps.find(item => item.name === 'websockets');
  if (!gap) throw new Error('Missing WebSocket capability did not retain a typed runtime gap');
  return failure('missing-capability', gap.code, 'capability-assembly', gap.reason);
}

async function capturePermissionBlocked(): Promise<FailureReceipt> {
  // Headless Chromium and WebKit auto-deny an ungranted geolocation prompt
  // (PositionError.PERMISSION_DENIED). Headless Firefox instead leaves the
  // prompt permanently pending with no UI to answer it, so
  // getCurrentPosition never settles. Both are real, engine-native ways a
  // browser blocks an unauthorized capability; race a bounded deadline so
  // the never-settling Firefox prompt itself becomes the typed receipt
  // instead of exhausting the outer test timeout.
  const PROMPT_DEADLINE_MS = 4_000;
  const outcome = await Promise.race<{ mode: 'denied' | 'unresolved'; error: unknown }>([
    new Promise(resolve => navigator.geolocation.getCurrentPosition(
      () => resolve({ mode: 'unresolved', error: new Error('Geolocation unexpectedly succeeded without a granted browser permission') }),
      error => resolve({ mode: 'denied', error }),
      { timeout: 1_000, maximumAge: 0 },
    )),
    new Promise(resolve => setTimeout(
      () => resolve({ mode: 'unresolved', error: new Error(`Geolocation permission prompt received no browser response within ${PROMPT_DEADLINE_MS}ms`) }),
      PROMPT_DEADLINE_MS,
    )),
  ]);
  if (outcome.mode === 'denied') {
    const code = typeof outcome.error === 'object' && outcome.error !== null && 'code' in outcome.error
      ? Number((outcome.error as { code: unknown }).code)
      : 0;
    if (code !== 1) throw outcome.error;
    return failure('permission-blocked', 'permission-denied', 'browser-permission', outcome.error);
  }
  return failure('permission-blocked', 'permission-prompt-unresolved', 'browser-permission', outcome.error);
}

async function captureTimeout(sender: NodeHandle, receiver: NodeHandle): Promise<FailureReceipt> {
  try {
    const stream = await sender.node.dialProtocol(multiaddr(receiver.relayEndpoint), TIMEOUT_PROTOCOL, { runOnTransientConnection: true });
    await writeJson(stream, { nonce: crypto.randomUUID() });
    await readStream(stream, 750);
    throw new Error('Deadline protocol unexpectedly produced a response');
  } catch (error) {
    return failure('timeout', 'stream-deadline-exceeded', 'protocol-response', error);
  }
}

async function captureRelayLoss(sender: NodeHandle, receiver: NodeHandle): Promise<FailureReceipt> {
  try {
    await sender.node.dialProtocol(multiaddr(receiver.relayEndpoint), PROTOCOL, { runOnTransientConnection: true });
    throw new Error('Circuit route unexpectedly remained usable after relay shutdown');
  } catch (error) {
    return failure('relay-lost', 'relay-route-unavailable', 'relay-dial', error);
  }
}

async function stopNode(handle: NodeHandle): Promise<{ peerId: string; stopped: boolean; connections: number }> {
  await handle.node.stop();
  return { peerId: handle.peerId, stopped: true, connections: handle.node.getConnections().length };
}

declare global {
  interface Window {
    swr138Libp2p: {
      protocol: string;
      start(relayMultiaddr: string): Promise<{ peerId: string; relayEndpoint: string }>;
      registerResponder(): Promise<void>;
      exchange(receiverEndpoint: string, receiverPeerId: string): Promise<Record<string, unknown>>;
      captureTimeout(receiverEndpoint: string): Promise<FailureReceipt>;
      captureRelayLoss(receiverEndpoint: string): Promise<FailureReceipt>;
      stop(): Promise<{ peerId: string; stopped: boolean; connections: number }>;
      captureMissingCapability(): Promise<FailureReceipt>;
      capturePermissionBlocked(): Promise<FailureReceipt>;
    };
  }
}

let localNode: NodeHandle | undefined;
async function local(): Promise<NodeHandle> {
  if (!localNode) throw new Error('No local browser libp2p node has been started');
  return localNode;
}

window.swr138Libp2p = {
  protocol: PROTOCOL,
  async start(relayMultiaddr) {
    localNode = await startNode(relayMultiaddr);
    return { peerId: localNode.peerId, relayEndpoint: localNode.relayEndpoint };
  },
  async registerResponder() { await registerSignedResponder(await local()); },
  async exchange(receiverEndpoint, receiverPeerId) {
    const sender = await local();
    return exchange(sender, { ...sender, peerId: receiverPeerId, relayEndpoint: receiverEndpoint });
  },
  async captureTimeout(receiverEndpoint) {
    const sender = await local();
    return captureTimeout(sender, { ...sender, relayEndpoint: receiverEndpoint });
  },
  async captureRelayLoss(receiverEndpoint) {
    const sender = await local();
    return captureRelayLoss(sender, { ...sender, relayEndpoint: receiverEndpoint });
  },
  async stop() {
    const handle = await local();
    const result = await stopNode(handle);
    localNode = undefined;
    return result;
  },
  captureMissingCapability,
  capturePermissionBlocked,
};

document.body.dataset.ready = 'true';
