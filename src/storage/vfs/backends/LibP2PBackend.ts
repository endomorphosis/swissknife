// src/storage/vfs/backends/LibP2PBackend.ts
import { createLibp2p } from 'libp2p';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { kadDht } from '@libp2p/kad-dht';
import { StorageBackend } from '../StorageBackend.js';

export class LibP2PBackend extends StorageBackend {
  readonly name = 'libp2p';
  readonly protocol = 'p2p://';
  private libp2p: Libp2p;

  async connect(config: LibP2PConfig): Promise<void> {
    this.libp2p = await createLibp2p({
      transports: config.transports,
      connectionEncryption: config.encryption,
      streamMuxers: config.muxers,
      services: {
        dht: kadDht(),
        pubsub: gossipsub()
      }
    });

    await this.libp2p.start();
  }

  async write(path: string, data: Buffer): Promise<string> {
    // Publish data through libp2p pubsub
    const hash = await this.hashData(data);
    await this.libp2p.services.pubsub.publish(`vfs:${path}`, data);
    
    // Store in DHT for discovery
    await this.libp2p.services.dht.put(`/vfs/${path}`, data);
    return hash;
  }

  async read(path: string): Promise<Buffer> {
    // Retrieve from DHT
    const data = await this.libp2p.services.dht.get(`/vfs/${path}`);
    return Buffer.from(data);
  }

  // P2P-specific networking methods
  async broadcast(message: any): Promise<void> {
    await this.libp2p.services.pubsub.publish('vfs:broadcast', 
      new TextEncoder().encode(JSON.stringify(message)));
  }

  async subscribe(topic: string, handler: (data: Buffer) => void): Promise<void> {
    this.libp2p.services.pubsub.subscribe(topic);
    this.libp2p.services.pubsub.addEventListener('message', (evt) => {
      if (evt.detail.topic === topic) {
        handler(Buffer.from(evt.detail.data));
      }
    });
  }
}