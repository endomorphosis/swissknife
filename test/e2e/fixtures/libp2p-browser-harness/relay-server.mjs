#!/usr/bin/env node
/**
 * Local, real Circuit Relay v2 used only by the browser interoperability
 * suite.  Browser pages never receive a host transport: they reach this
 * process through a TLS WebSocket multiaddr and use circuit-relay-v2 for the
 * browser-to-browser hop.
 */
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';

const port = Number(process.env.SWISSKNIFE_LIBP2P_RELAY_PORT ?? 0);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`Invalid SWISSKNIFE_LIBP2P_RELAY_PORT: ${process.env.SWISSKNIFE_LIBP2P_RELAY_PORT}`);
}

const node = await createLibp2p({
  addresses: { listen: [`/ip4/127.0.0.1/tcp/${port}/ws`] },
  transports: [webSockets()],
  connectionEncryption: [noise()],
  streamMuxers: [yamux()],
  services: {
    identify: identify(),
    circuitRelay: circuitRelayServer({ reservations: { maxReservations: 32 } }),
  },
});

const peerId = node.peerId.toString();
const listenAddr = node.getMultiaddrs()[0]?.toString();
if (!listenAddr) {
  await node.stop();
  throw new Error('Local libp2p relay did not expose a WebSocket listen address');
}

// This single line is deliberately machine-readable.  The test refuses to
// continue unless it sees this receipt from a live libp2p node.
process.stdout.write(`${JSON.stringify({
  type: 'swr-138-relay-ready',
  peerId,
  // Browser libp2p's connection gater deliberately rejects literal loopback
  // IPs. `localhost` resolves to the same isolated process while retaining a
  // browser-acceptable DNS/WebSocket multiaddr.
  multiaddr: (listenAddr.includes('/p2p/') ? listenAddr : `${listenAddr}/p2p/${peerId}`)
    .replace('/ip4/127.0.0.1', '/dns4/localhost'),
  encryption: '/noise',
  multiplexer: '/yamux/1.0.0',
})}\n`);

let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  try {
    await node.stop();
    process.stdout.write(`${JSON.stringify({ type: 'swr-138-relay-stopped', signal })}\n`);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

process.once('SIGINT', () => void stop('SIGINT'));
process.once('SIGTERM', () => void stop('SIGTERM'));
