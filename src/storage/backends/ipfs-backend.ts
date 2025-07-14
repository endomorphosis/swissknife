// src/storage/backends/ipfs-backend.ts

import { StorageBackend, DirEntry, FileStat } from '../backend';
import { IPFSKitClient } from '../../ipfs/client';
import { ConfigurationManager } from '../../config/manager';
import { logger } from '../../utils/logger';

/**
 * Storage backend for IPFS
 * 
 * This backend provides access to IPFS through a file system-like interface.
 * It maintains a mapping between virtual paths and IPFS CIDs.
 */
export class IPFSBackend implements StorageBackend {
  public readonly id: string;
  public readonly name: string;
  public readonly isReadOnly: boolean;
  private client: IPFSKitClient;
  private initialized = false;
  
  // Path to CID mapping - this is a simple in-memory storage
  // In a production environment, this would be persisted to disk
  private pathToCid: Map<string, string> = new Map();
  
  // CID to metadata mapping
  private cidMetadata: Map<string, {
    size: number;
    isDirectory: boolean;
    createdAt: Date;
    modifiedAt: Date;
  }> = new Map();

  /**
   * Create a new IPFS backend
   */
  constructor() {
    this.id = 'ipfs-backend';
    this.name = 'IPFS Backend';
    this.isReadOnly = false; // IPFS is generally writable
    const config = ConfigurationManager.getInstance();
    
    this.client = new IPFSKitClient({
      apiUrl: config.get<string>('ipfs.apiUrl'),
      apiKey: config.get<string>('ipfs.apiKey')
    });
  }

  /**
   * Initialize the backend
   */
  public async init(): Promise<void> {
    try {
      // Check if the IPFS node is reachable
      const reachable = await this.client.isNodeReachable();
      
      if (!reachable) {
        throw new Error('IPFS node is not reachable');
      }
      
      // TODO: Load path to CID mapping from storage
      
      this.initialized = true;
      logger.info('IPFS backend initialized');
    } catch (error) {
      logger.error(`Failed to initialize IPFS backend: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Check if the backend is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Clean path by removing duplicate slashes and trailing slashes
   * @param path Path to clean
   * @returns Cleaned path
   */
  private cleanPath(path: string): string {
    // Ensure path starts with a slash
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    
    // Remove duplicate slashes and trailing slashes
    return path.replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
  }

  /**
   * Get parent directory path
   * @param path Path to get parent of
   * @returns Parent directory path
   */
  private getParentPath(path: string): string {
    const cleanedPath = this.cleanPath(path);
    
    if (cleanedPath === '/') {
      return '/';
    }
    
    const parts = cleanedPath.split('/');
    return parts.slice(0, -1).join('/') || '/';
  }

  /**
   * Check if a file or directory exists
   * @param path Path to check
   * @returns True if the path exists
   */
  public async exists(path: string): Promise<boolean> {
    const cleanedPath = this.cleanPath(path);
    
    // Check if we have a CID for this path
    return this.pathToCid.has(cleanedPath);
  }

  /**
   * Get file or directory stats
   * @param path Path to get stats for
   * @returns File stats
   */
  public async stat(path: string): Promise<FileStat> {
    const cleanedPath = this.cleanPath(path);
    
    // Check if path exists
    if (!this.pathToCid.has(cleanedPath)) {
      throw new Error(`Path ${cleanedPath} does not exist`);
    }
    
    const cid = this.pathToCid.get(cleanedPath)!;
    const metadata = this.cidMetadata.get(cid);
    
    if (!metadata) {
      throw new Error(`Metadata not found for CID ${cid}`);
    }
    
    return {
      isFile: !metadata.isDirectory,
      isDirectory: metadata.isDirectory,
      size: metadata.size,
      createdAt: metadata.createdAt,
      modifiedAt: metadata.modifiedAt
    };
  }

  /**
   * Read a file
   * @param path Path to read
   * @returns File content as a Buffer
   */
  public async readFile(path: string): Promise<Buffer> {
    const cleanedPath = this.cleanPath(path);
    
    // Check if path exists
    if (!this.pathToCid.has(cleanedPath)) {
      throw new Error(`Path ${cleanedPath} does not exist`);
    }
    
    const cid = this.pathToCid.get(cleanedPath)!;
    
    // Get metadata
    const metadata = this.cidMetadata.get(cid);
    
    if (!metadata) {
      throw new Error(`Metadata not found for CID ${cid}`);
    }
    
    if (metadata.isDirectory) {
      throw new Error(`Cannot read directory ${cleanedPath} as a file`);
    }
    
    // Get file content from IPFS
    return await this.client.getContent(cid);
  }

  /**
   * Write a file
   * @param path Path to write
   * @param data Data to write
   */
  public async writeFile(path: string, data: Buffer | string): Promise<void> {
    const cleanedPath = this.cleanPath(path);
    
    // Ensure parent directory exists
    const parentPath = this.getParentPath(cleanedPath);
    
    if (parentPath !== '/' && !this.pathToCid.has(parentPath)) {
      throw new Error(`Parent directory ${parentPath} does not exist`);
    }
    
    // Add content to IPFS
    const result = await this.client.addContent(data, {
      pin: true
    });
    
    // Update mappings
    this.pathToCid.set(cleanedPath, result.cid);
    
    const now = new Date();
    this.cidMetadata.set(result.cid, {
      size: result.size,
      isDirectory: false,
      createdAt: now,
      modifiedAt: now
    });
    
    logger.debug(`Wrote file ${cleanedPath} with CID ${result.cid}`);
  }

  /**
   * Create a directory
   * @param path Path of directory to create
   * @param options Options for creating the directory
   */
  public async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const cleanedPath = this.cleanPath(path);
    
    // Check if path already exists
    if (this.pathToCid.has(cleanedPath)) {
      throw new Error(`Path ${cleanedPath} already exists`);
    }
    
    // Ensure parent directory exists
    const parentPath = this.getParentPath(cleanedPath);
    
    if (parentPath !== '/' && !this.pathToCid.has(parentPath)) {
      if (options?.recursive) {
        // Create parent directory recursively
        await this.mkdir(parentPath, { recursive: true });
      } else {
        throw new Error(`Parent directory ${parentPath} does not exist`);
      }
    }
    
    // Create a virtual directory by assigning a new CID
    // For IPFS directories, we use a special format `virtual-dir:<timestamp>`
    const virtualDirMarker = `virtual-dir:${Date.now()}`;
    
    // Add as a virtual directory
    this.pathToCid.set(cleanedPath, virtualDirMarker);
    
    const now = new Date();
    this.cidMetadata.set(virtualDirMarker, {
      size: 0,
      isDirectory: true,
      createdAt: now,
      modifiedAt: now
    });
    
    logger.debug(`Created directory ${cleanedPath}`);
  }

  /**
   * List directory contents
   * @param path Path of directory to list
   * @returns Array of directory entries
   */
  public async readdir(path: string): Promise<DirEntry[]> {
    const cleanedPath = this.cleanPath(path);
    
    // Check if path exists and is a directory
    if (!this.pathToCid.has(cleanedPath)) {
      throw new Error(`Path ${cleanedPath} does not exist`);
    }
    
    const cid = this.pathToCid.get(cleanedPath)!;
    const metadata = this.cidMetadata.get(cid);
    
    if (!metadata || !metadata.isDirectory) {
      throw new Error(`Path ${cleanedPath} is not a directory`);
    }
    
    // Find all paths that are children of this directory
    const directChildren: DirEntry[] = [];
    const prefix = cleanedPath === '/' ? '/' : cleanedPath + '/';
    
    for (const [entryPath, entryCid] of this.pathToCid.entries()) {
      // Skip if not a direct child
      if (!entryPath.startsWith(prefix)) {
        continue;
      }
      
      // Skip if not a direct child (has additional slashes after the prefix)
      const relativePath = entryPath.slice(prefix.length);
      if (relativePath.includes('/')) {
        continue;
      }
      
      const entryMetadata = this.cidMetadata.get(entryCid)!;
      
      directChildren.push({
        name: relativePath,
        path: entryPath,
        isFile: !entryMetadata.isDirectory,
        isDirectory: entryMetadata.isDirectory
      });
    }
    
    return directChildren;
  }

  /**
   * Remove a file or directory
   * @param path Path to remove
   * @param options Options for removal
   */
  public async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    const cleanedPath = this.cleanPath(path);
    
    // Check if path exists
    if (!this.pathToCid.has(cleanedPath)) {
      throw new Error(`Path ${cleanedPath} does not exist`);
    }
    
    const cid = this.pathToCid.get(cleanedPath)!;
    const metadata = this.cidMetadata.get(cid);
    
    if (!metadata) {
      throw new Error(`Metadata not found for CID ${cid}`);
    }
    
    // If it's a directory, check if it's empty
    if (metadata.isDirectory) {
      const contents = await this.readdir(cleanedPath);
      
      if (contents.length > 0 && !options?.recursive) {
        throw new Error(`Cannot remove non-empty directory ${cleanedPath} without recursive option`);
      }
      
      if (options?.recursive) {
        // Remove all children recursively
        for (const child of contents) {
          await this.rm(child.path, { recursive: true });
        }
      }
    }
    
    // Remove the path from our mappings
    this.pathToCid.delete(cleanedPath);
    
    // Note: We don't remove the CID metadata as other paths might reference the same CID
    
    logger.debug(`Removed ${metadata.isDirectory ? 'directory' : 'file'} ${cleanedPath}`);
  }

  /**
   * Copy a file
   * @param src Source path
   * @param dest Destination path
   */
  public async copyFile(src: string, dest: string): Promise<void> {
    const cleanedSrc = this.cleanPath(src);
    const cleanedDest = this.cleanPath(dest);
    
    // Check if source exists
    if (!this.pathToCid.has(cleanedSrc)) {
      throw new Error(`Source path ${cleanedSrc} does not exist`);
    }
    
    const srcCid = this.pathToCid.get(cleanedSrc)!;
    const srcMetadata = this.cidMetadata.get(srcCid);
    
    if (!srcMetadata) {
      throw new Error(`Metadata not found for CID ${srcCid}`);
    }
    
    if (srcMetadata.isDirectory) {
      throw new Error(`Cannot copy directory ${cleanedSrc} with copyFile`);
    }
    
    // Ensure parent directory of destination exists
    const destParent = this.getParentPath(cleanedDest);
    
    if (destParent !== '/' && !this.pathToCid.has(destParent)) {
      throw new Error(`Parent directory of destination ${destParent} does not exist`);
    }
    
    // In IPFS, we can just reuse the same CID since the content is immutable
    this.pathToCid.set(cleanedDest, srcCid);
    
    logger.debug(`Copied file from ${cleanedSrc} to ${cleanedDest}`);
  }

  /**
   * Move or rename a file or directory
   * @param src Source path
   * @param dest Destination path
   */
  public async rename(src: string, dest: string): Promise<void> {
    const cleanedSrc = this.cleanPath(src);
    const cleanedDest = this.cleanPath(dest);
    
    // Check if source exists
    if (!this.pathToCid.has(cleanedSrc)) {
      throw new Error(`Source path ${cleanedSrc} does not exist`);
    }
    
    // Ensure parent directory of destination exists
    const destParent = this.getParentPath(cleanedDest);
    
    if (destParent !== '/' && !this.pathToCid.has(destParent)) {
      throw new Error(`Parent directory of destination ${destParent} does not exist`);
    }
    
    const srcCid = this.pathToCid.get(cleanedSrc)!;
    
    // Copy the mapping to the new path
    this.pathToCid.set(cleanedDest, srcCid);
    
    // If source is a directory, recursively update all child paths
    const srcMetadata = this.cidMetadata.get(srcCid);
    
    if (srcMetadata && srcMetadata.isDirectory) {
      const srcPrefix = cleanedSrc === '/' ? '/' : cleanedSrc + '/';
      const destPrefix = cleanedDest === '/' ? '/' : cleanedDest + '/';
      
      // Find all paths that are descendants of the source
      const pathsToRename: [string, string][] = [];
      
      for (const [path, cid] of this.pathToCid.entries()) {
        if (path !== cleanedSrc && path.startsWith(srcPrefix)) {
          const relativePath = path.slice(srcPrefix.length);
          const newPath = destPrefix + relativePath;
          pathsToRename.push([path, newPath]);
        }
      }
      
      // Update all paths
      for (const [oldPath, newPath] of pathsToRename) {
        this.pathToCid.set(newPath, this.pathToCid.get(oldPath)!);
      }
      
      // Delete old paths
      for (const [oldPath] of pathsToRename) {
        this.pathToCid.delete(oldPath);
      }
    }
    
    // Remove the old path
    this.pathToCid.delete(cleanedSrc);
    
    logger.debug(`Renamed ${cleanedSrc} to ${cleanedDest}`);
  }

  /**
   * Get file stats with direct CID - useful for IPFS integrations
   * @param cid Content identifier
   * @returns File stats
   */
  public async statByCid(cid: string): Promise<FileStat | null> {
    // Check if we have metadata for this CID
    if (!this.cidMetadata.has(cid)) {
      return null;
    }
    
    const metadata = this.cidMetadata.get(cid)!;
    
    // Find a path for this CID
    let path = null;
    for (const [p, c] of this.pathToCid.entries()) {
      if (c === cid) {
        path = p;
        break;
      }
    }
    
    return {
      path: path || '',
      size: metadata.size,
      isDirectory: metadata.isDirectory,
      createdAt: metadata.createdAt,
      modifiedAt: metadata.modifiedAt
    };
  }
  
  /**
   * Read a file directly by CID
   * @param cid Content identifier
   * @returns File content as a Buffer
   */
  public async readFileByCid(cid: string): Promise<Buffer> {
    return await this.client.getContent(cid);
  }
  
  /**
   * Get the CID for a path
   * @param path Path to get CID for
   * @returns CID if found, null otherwise
   */
  public getCidForPath(path: string): string | null {
    const cleanedPath = this.cleanPath(path);
    return this.pathToCid.get(cleanedPath) || null;
  }
  
  /**
   * Find paths for a CID
   * @param cid Content identifier
   * @returns Array of paths that reference this CID
   */
  public getPathsForCid(cid: string): string[] {
    const paths: string[] = [];
    
    for (const [path, c] of this.pathToCid.entries()) {
      if (c === cid) {
        paths.push(path);
      }
    }
    
    return paths;
  }
}
