import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@libp2p/noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { kadDHT } from '@libp2p/kad-dht';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import * as multiformats from 'multiformats';
import * as dagcbor from '@ipld/dag-cbor';

let helia: any = null;
let libp2p: any = null;

export async function initIPFSNode() {
  if (helia) {
    console.log("IPFS node already running.");
    return helia;
  }

  try {
    libp2p = await createLibp2p({
      transports: [webSockets()],
      connectionEncryption: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery: [kadDHT({ protocol: '/ipfs/kad/1.0.0', clientMode: true })],
      services: {
        identify: identify(),
        dht: kadDHT({ protocol: '/ipfs/kad/1.0.0', clientMode: true }),
        pubsub: gossipsub({ emitSelf: true }),
      },
    });

    helia = await createHelia({
      libp2p,
      blockstore: new Map(), // In-memory blockstore for simplicity
      datastore: new Map(), // In-memory datastore for simplicity
      files: unixfs(),
    });

    console.log("IPFS node started with Peer ID:", helia.libp2p.peerId.toString());
    return helia;
  } catch (error) {
    console.error("Failed to start IPFS node:", error);
    helia = null;
    libp2p = null;
    throw error;
  }
}

export async function stopIPFSNode() {
  if (!helia) {
    console.log("IPFS node not running.");
    return;
  }

  try {
    await helia.stop();
    helia = null;
    libp2p = null;
    console.log("IPFS node stopped.");
  } catch (error) {
    console.error("Failed to stop IPFS node:", error);
    throw error;
  }
}

export async function addFile(content: string) {
  if (!helia) {
    throw new Error("IPFS node not running. Call initIPFSNode() first.");
  }
  const { cid } = await helia.addBytes(new TextEncoder().encode(content));
  return cid.toString();
}

export async function getFile(cid: string) {
  if (!helia) {
    throw new Error("IPFS node not running. Call initIPFSNode() first.");
  }
  const decoder = new TextDecoder();
  const chunks = [];
  for await (const chunk of helia.cat(multiformats.CID.parse(cid))) {
    chunks.push(decoder.decode(chunk, { stream: true }));
  }
  chunks.push(decoder.decode(undefined, { stream: false }));
  return chunks.join('');
}

export async function resolveCID(cid: string) {
  if (!helia) {
    throw new Error("IPFS node not running. Call initIPFSNode() first.");
  }
  // Helia's cat and get operations implicitly resolve CIDs
  // For explicit resolution, you might need to use a different API or a gateway
  console.log(`Resolving CID: ${cid} (direct cat/get will resolve)`);
  return cid; // Placeholder, as direct resolution is complex
}

export { multiformats, dagcbor };
