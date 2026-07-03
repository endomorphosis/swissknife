// src/storage/local/file-storage.ts
import { StorageProvider, AddOptions, StorageItemMetadata } from '../../types/storage.js';
import { CID } from '../../types/common.js'; // Assuming CID is string
import * as fs from 'fs/promises.js';
import * as path from 'path.js';
import * as crypto from 'crypto.js';

export interface FileStorageOptions {
  basePath: string;
  createDir?: boolean; // Whether to create the base directory if it doesn't exist
}

export class FileStorage implements StorageProvider {
  private basePath: string;
  private metadataDir: string; // Store metadata in a separate .metadata subdirectory

  constructor(options: FileStorageOptions) {
    this.basePath = path.resolve(options.basePath); // Ensure absolute path
    this.metadataDir = path.join(this.basePath, '.metadata');

    if (options.createDir) {
      fs.mkdir(this.basePath, { recursive: true })
        .then(() => fs.mkdir(this.metadataDir, { recursive: true }))
        .catch(err => console.error('Error creating storage directory or metadata directory:', err));
    } else {
        // Ensure metadata directory exists if base path exists, or it will fail later
        fs.access(this.basePath)
            .then(() => fs.mkdir(this.metadataDir, { recursive: true }))
            .catch(() => { /* Base path doesn't exist, do nothing if createDir is false */});
    }
  }

  private contentPath(cid: CID): string {
    return path.join(this.basePath, cid);
  }

  private metadataPath(cid: CID): string {
    return path.join(this.metadataDir, `${cid}.json`);
  }

  private async readMetadata(cid: CID): Promise<StorageItemMetadata | null> {
    try {
      const metaContent = await fs.readFile(this.metadataPath(cid), 'utf-8');
      return JSON.parse(metaContent) as StorageItemMetadata;
    } catch (error: any) {
      if (error.code === 'ENOENT') return null; // File not found
      throw error;
    }
  }

  private async writeMetadata(cid: CID, metadata: StorageItemMetadata): Promise<void> {
    await fs.writeFile(this.metadataPath(cid), JSON.stringify(metadata, null, 2));
  }

  async add(content: Buffer | string, options?: AddOptions): Promise<CID> {
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    
    // Using SHA256 hash of content as CID for file storage.
    // For IPFS compatibility, a true IPFS CID would be generated if adding to IPFS.
    const hash = crypto.createHash('sha256').update(contentBuffer).digest('hex');
    const cid: CID = hash; // In a real IPFS context, this would be a proper CID.

    const filePath = this.contentPath(cid);
    await fs.writeFile(filePath, contentBuffer);

    const now = Date.now();
    const metadata: StorageItemMetadata = {
      contentType: options?.contentType,
      size: contentBuffer.length,
      createdAt: now,
      updatedAt: now,
      tags: options?.tags,
      ...(options?.metadata || {}),
      // Store original filename if provided in options
      originalFilename: options?.filename 
    };
    await this.writeMetadata(cid, metadata);
    
    console.log(`FileStorage: Added content ${cid} (size: ${metadata.size})`);
    return cid;
  }

  async get(cid: CID): Promise<Buffer> {
    try {
      const filePath = this.contentPath(cid);
      const content = await fs.readFile(filePath);
      console.log(`FileStorage: Retrieved content ${cid}`);
      return content;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Content not found with CID: ${cid}`);
      }
      throw error;
    }
  }

  async exists(cid: CID): Promise<boolean> {
    try {
      await fs.access(this.contentPath(cid));
      return true;
    } catch {
      return false;
    }
  }

  async delete(cid: CID): Promise<boolean> {
    try {
      await fs.unlink(this.contentPath(cid));
      // Attempt to delete metadata, ignore if it fails (e.g., already deleted)
      await fs.unlink(this.metadataPath(cid)).catch(() => {});
      console.log(`FileStorage: Deleted content ${cid}`);
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') return true; // Already deleted
      console.error(`FileStorage: Error deleting content ${cid}:`, error);
      return false;
    }
  }

  async getMetadata(cid: CID): Promise<StorageItemMetadata | undefined> {
    const metadata = await this.readMetadata(cid);
    return metadata || undefined;
  }

  async updateMetadata(cid: CID, metadataUpdate: Partial<StorageItemMetadata>): Promise<boolean> {
    const existingMetadata = await this.readMetadata(cid);
    if (!existingMetadata) {
      return false; // Cannot update metadata for non-existent content
    }
    const updatedMetadata: StorageItemMetadata = {
      ...existingMetadata,
      ...metadataUpdate,
      updatedAt: Date.now(), // Always update the updatedAt timestamp
    };
    await this.writeMetadata(cid, updatedMetadata);
    console.log(`FileStorage: Updated metadata for ${cid}`);
    return true;
  }
  
  async list(options?: import('../../types/storage.js').ListOptions): Promise<{ cids: CID[]; metadata?: StorageItemMetadata[] }> {
    // Basic implementation: lists all CIDs (filenames in base directory, excluding metadata dir)
    // Filtering/sorting would require reading all metadata files.
    try {
        const files = await fs.readdir(this.basePath);
        const cids = files.filter(file => {
            // A simple check: assume files that don't have a typical extension and are not the metadata dir
            // might be content files named by their hash/CID.
            // This is a naive check and depends on naming convention.
            return !path.extname(file) && file !== '.metadata';
        });
        // Apply options: limit, offset, sort by name
        const opts = options as Record<string, unknown> | undefined;
        let result = [...cids];
        if (opts?.['sortBy'] === 'name') result.sort();
        const offset = Number(opts?.['offset'] ?? 0);
        const limit  = opts?.['limit'] !== undefined ? Number(opts['limit']) : result.length;
        return { cids: result.slice(offset, offset + limit) };
    } catch (error) {
        console.error("FileStorage: Error listing files:", error);
        return { cids: [] };
    }
  }
  // Optional methods from StorageProvider can be implemented as needed
  // has?(id: string): Promise<boolean>;
  // addNode?(data: JSONValue, links?: IPLDLink[]): Promise<CID>;
  // getNode?(cid: CID): Promise<{ data: JSONValue, links: IPLDLink[] }>;
  // etc.
}
