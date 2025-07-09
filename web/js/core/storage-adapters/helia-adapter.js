/**
 * Helia Adapter for SwissKnife Virtual File System
 * Integrates Helia (IPFS in JS) as a storage backend
 */

import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';

export class HeliaAdapter {
  constructor() {
    this.name = 'helia';
    this.helia = null;
    this.fs = null;
  }

  async init() {
    if (this.helia) {
      console.log('Helia already initialized.');
      return;
    }
    try {
      this.helia = await createHelia();
      this.fs = unixfs(this.helia);
      console.log('✅ Helia (IPFS) initialized successfully.');
    } catch (error) {
      console.error('Failed to initialize Helia (IPFS):', error);
      throw error;
    }
  }

  async stop() {
    if (this.helia) {
      console.log('Stopping Helia (IPFS)...');
      await this.helia.stop();
      this.helia = null;
      this.fs = null;
      console.log('Helia (IPFS) stopped.');
    }
  }

  async store(path, content, options = {}) {
    if (!this.fs) throw new Error('Helia not initialized.');
    try {
      const { cid } = await this.fs.addBytes(new TextEncoder().encode(content), options);
      console.log(`Stored ${path} with CID: ${cid.toString()}`);
      return cid.toString();
    } catch (error) {
      console.error(`Failed to store content to Helia at ${path}:`, error);
      throw error;
    }
  }

  async retrieve(cid) {
    if (!this.fs) throw new Error('Helia not initialized.');
    try {
      const chunks = [];
      for await (const chunk of this.fs.cat(cid)) {
        chunks.push(chunk);
      }
      const content = new TextDecoder().decode(Uint8Array.from(chunks.flat()));
      console.log(`Retrieved content for CID: ${cid}`);
      return content;
    } catch (error) {
      console.error(`Failed to retrieve content from Helia for CID ${cid}:`, error);
      throw error;
    }
  }

  async list(path) {
    if (!this.fs) throw new Error('Helia not initialized.');
    try {
      const entries = [];
      for await (const entry of this.fs.ls(path)) {
        entries.push({
          name: entry.name,
          type: entry.type === 'dir' ? 'directory' : 'file',
          cid: entry.cid.toString(),
          size: entry.size || 0,
        });
      }
      console.log(`Listed entries for path ${path}:`, entries);
      return entries;
    } catch (error) {
      console.error(`Failed to list content from Helia for path ${path}:`, error);
      throw error;
    }
  }

  async remove(path) {
    // Helia unixfs does not directly support 'rm' by path.
    // This would typically involve re-adding the parent directory's DAG node
    // without the removed entry. For simplicity, we'll just log a warning.
    console.warn(`HeliaAdapter does not support direct removal of files by path: ${path}. Manual DAG manipulation would be required.`);
    return { success: false, message: 'Direct file removal not supported by Helia unixfs.' };
  }
}
