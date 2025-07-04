// src/storage/vfs/backends/HeliaBackend.ts
import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { StorageBackend } from '../StorageBackend.js';

export class HeliaBackend extends StorageBackend {
  readonly name = 'helia';
  readonly protocol = 'ipfs://';
  private helia: Helia;
  private fs: UnixFS;

  async connect(config: HeliaConfig): Promise<void> {
    this.helia = await createHelia({
      ...config.heliaOptions
    });
    this.fs = unixfs(this.helia);
  }

  async write(path: string, data: Buffer): Promise<string> {
    const cid = await this.fs.addBytes(data);
    // Store path -> CID mapping in metadata
    await this.setPathMapping(path, cid.toString());
    return cid.toString();
  }

  async read(path: string): Promise<Buffer> {
    const cid = await this.getPathMapping(path);
    const chunks: Uint8Array[] = [];
    for await (const chunk of this.fs.cat(cid)) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  // Additional IPFS-specific methods
  async pin(cid: string): Promise<void> {
    await this.helia.pins.add(CID.parse(cid));
  }

  async getPeers(): Promise<PeerInfo[]> {
    return Array.from(this.helia.libp2p.getPeers());
  }
}