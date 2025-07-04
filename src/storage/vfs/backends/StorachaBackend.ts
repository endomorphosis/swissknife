// src/storage/vfs/backends/StorachaBackend.ts
import { create } from '@web3-storage/w3up-client';
import { StorageBackend } from '../StorageBackend.js';

export class StorachaBackend extends StorageBackend {
  readonly name = 'storacha';
  readonly protocol = 'storacha://';
  private client: Client;

  async connect(config: StorachaConfig): Promise<void> {
    this.client = await create();
    
    if (config.email && config.password) {
      await this.client.login(config.email);
    } else if (config.privateKey) {
      await this.client.setCurrentSpace(config.spaceId);
    }
  }

  async write(path: string, data: Buffer): Promise<string> {
    const file = new File([data], path.split('/').pop() || 'file');
    const cid = await this.client.uploadFile(file);
    
    // Store path mapping
    await this.setPathMapping(path, cid.toString());
    return cid.toString();
  }

  async read(path: string): Promise<Buffer> {
    const cid = await this.getPathMapping(path);
    const response = await fetch(`https://${cid}.ipfs.w3s.link`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // Storacha-specific features
  async listSpaces(): Promise<SpaceInfo[]> {
    return await this.client.capability.space.list();
  }

  async getUsage(): Promise<StorageUsage> {
    return await this.client.usage.report();
  }
}