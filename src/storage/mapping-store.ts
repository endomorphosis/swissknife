// src/storage/mapping-store.ts

import { StorageError, StorageErrorType } from './backend.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Interface for storing path-to-CID mappings for IPFS backend
 */
export interface MappingStore {
  /**
   * Get mapping for a virtual path
   * @param virtualPath Path to get mapping for
   * @returns Mapping data or null if not found
   */
  get(virtualPath: string): Promise<{ cid: string; timestamp?: number } | null>;
  
  /**
   * Set mapping for a virtual path
   * @param virtualPath Path to set mapping for
   * @param mapping Mapping data
   */
  set(virtualPath: string, mapping: { cid: string; timestamp: number }): Promise<void>;
  
  /**
   * Delete mapping for a virtual path
   * @param virtualPath Path to delete mapping for
   * @returns True if mapping was deleted, false if not found
   */
  delete(virtualPath: string): Promise<boolean>;
  
  /**
   * List mappings under a given prefix
   * @param prefix Prefix to list under
   * @returns Array of path and CID pairs
   */
  list(prefix: string): Promise<Array<{ path: string; cid: string }>>;

  /**
   * Check if a mapping exists
   * @param virtualPath Path to check
   * @returns True if mapping exists
   */
  exists(virtualPath: string): Promise<boolean>;
}

/**
 * Options for the simple file-based mapping store
 */
export interface FileMappingStoreOptions {
  storageFile: string;
  createFile?: boolean;
  flushInterval?: number; // In milliseconds
}

/**
 * Simple file-based implementation of MappingStore
 * 
 * This implementation keeps mappings in memory and periodically writes them to a JSON file.
 * For Phase 2, this simple implementation is sufficient, but will be replaced with a more
 * robust implementation (SQLite or LevelDB) in a future phase.
 */
export class FileMappingStore implements MappingStore {
  private mappings: Map<string, { cid: string; timestamp: number }>;
  private storageFile: string;
  private flushTimer: NodeJS.Timeout | null = null;
  private lastSave: number = 0;
  private dirty: boolean = false;
  
  /**
   * Creates a new FileMappingStore instance
   * @param options Options for the mapping store
   */
  constructor(options: FileMappingStoreOptions) {
    this.mappings = new Map();
    this.storageFile = path.resolve(options.storageFile);
    
    // Load mappings from file
    this.load().catch(error => {
      logger.error(`Failed to load mappings from ${this.storageFile}: ${error.message}`);
      if (options.createFile) {
        logger.info(`Creating new mapping storage file: ${this.storageFile}`);
        this.save().catch(saveError => {
          logger.error(`Failed to create mapping storage file: ${saveError.message}`);
        });
      }
    });
    
    // Set up periodic flushing
    const flushInterval = options.flushInterval || 60000; // Default: 1 minute
    this.flushTimer = setInterval(() => this.flush(), flushInterval);
    
    logger.debug(`FileMappingStore initialized with storage file: ${this.storageFile}`);
  }
  
  /**
   * Clean up resources when the store is no longer needed
   */
  public async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Flush pending changes
    await this.flush();
  }
  
  /**
   * Get mapping for a virtual path
   * @inheritdoc
   */
  public async get(virtualPath: string): Promise<{ cid: string; timestamp?: number } | null> {
    const normalizedPath = this.normalizePath(virtualPath);
    const mapping = this.mappings.get(normalizedPath);
    return mapping || null;
  }
  
  /**
   * Set mapping for a virtual path
   * @inheritdoc
   */
  public async set(virtualPath: string, mapping: { cid: string; timestamp: number }): Promise<void> {
    const normalizedPath = this.normalizePath(virtualPath);
    this.mappings.set(normalizedPath, mapping);
    this.dirty = true;
    
    // If we haven't saved in the last 5 seconds, schedule a save
    const now = Date.now();
    if (now - this.lastSave > 5000) {
      setTimeout(() => this.flush(), 100);
    }
  }
  
  /**
   * Delete mapping for a virtual path
   * @inheritdoc
   */
  public async delete(virtualPath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(virtualPath);
    const result = this.mappings.delete(normalizedPath);
    
    if (result) {
      this.dirty = true;
    }
    
    return result;
  }
  
  /**
   * List mappings under a given prefix
   * @inheritdoc
   */
  public async list(prefix: string): Promise<Array<{ path: string; cid: string }>> {
    const normalizedPrefix = this.normalizePath(prefix);
    
    // We need to list both exact matches and child paths
    // For child paths, we should act like a directory listing
    
    const exactMatch = this.mappings.get(normalizedPrefix);
    const results: Array<{ path: string; cid: string }> = [];
    
    // Add exact match if it exists
    if (exactMatch) {
      results.push({
        path: normalizedPrefix,
        cid: exactMatch.cid
      });
    }
    
    // Find child paths
    for (const [path, mapping] of this.mappings.entries()) {
      // Skip the exact match we already added
      if (path === normalizedPrefix) {
        continue;
      }
      
      // Check if this is a child of the prefix
      if (path.startsWith(normalizedPrefix)) {
        // For proper directory listing, we only want direct children
        // We need to check if there are any path segments between prefix and entry
        
        const relativePath = path.slice(normalizedPrefix.length);
        
        // Skip if the relative path doesn't start with a slash
        if (!relativePath.startsWith('/')) {
          continue;
        }
        
        // Count slashes to determine directory depth
        const slashCount = (relativePath.match(/\//g) || []).length;
        
        // Only include direct children (one level down)
        if (slashCount === 1 || (slashCount === 2 && relativePath.endsWith('/'))) {
          results.push({
            path,
            cid: mapping.cid
          });
        }
      }
    }
    
    return results;
  }
  
  /**
   * Check if a mapping exists
   * @inheritdoc
   */
  public async exists(virtualPath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(virtualPath);
    return this.mappings.has(normalizedPath);
  }
  
  /**
   * Load mappings from storage file
   * @private
   */
  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.storageFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      if (!Array.isArray(parsed)) {
        throw new Error('Invalid mapping file format');
      }
      
      this.mappings.clear();
      
      for (const item of parsed) {
        if (typeof item === 'object' && item !== null && 
            typeof item.path === 'string' && 
            typeof item.cid === 'string' && 
            typeof item.timestamp === 'number') {
          this.mappings.set(item.path, {
            cid: item.cid,
            timestamp: item.timestamp
          });
        }
      }
      
      logger.debug(`Loaded ${this.mappings.size} mappings from ${this.storageFile}`);
      this.dirty = false;
      this.lastSave = Date.now();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn(`Mapping file not found: ${this.storageFile}`);
        this.mappings.clear();
        return;
      }
      throw error;
    }
  }
  
  /**
   * Save mappings to storage file
   * @private
   */
  private async save(): Promise<void> {
    try {
      // Create the parent directory if it doesn't exist
      const dir = path.dirname(this.storageFile);
      await fs.mkdir(dir, { recursive: true });
      
      // Convert the mappings to an array for serialization
      const mappingsArray = Array.from(this.mappings.entries())
        .map(([path, { cid, timestamp }]) => ({
          path,
          cid,
          timestamp
        }));
      
      // Write the mappings to the file
      await fs.writeFile(
        this.storageFile,
        JSON.stringify(mappingsArray, null, 2),
        'utf-8'
      );
      
      logger.debug(`Saved ${mappingsArray.length} mappings to ${this.storageFile}`);
      this.dirty = false;
      this.lastSave = Date.now();
    } catch (error) {
      logger.error(`Failed to save mappings to ${this.storageFile}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Flush pending changes to disk
   * @private
   */
  private async flush(): Promise<void> {
    if (this.dirty) {
      try {
        await this.save();
      } catch (error) {
        logger.error(`Failed to flush mappings to disk: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  /**
   * Normalize a path to ensure consistent format
   * @private
   */
  private normalizePath(p: string): string {
    // Convert to POSIX-style path (forward slashes)
    p = p.replace(/\\/g, '/');
    
    // Ensure path starts with a slash
    if (!p.startsWith('/')) {
      p = '/' + p;
    }
    
    // Normalize the path (resolve .., .)
    p = path.posix.normalize(p);
    
    // Remove trailing slash unless it's the root
    if (p.length > 1 && p.endsWith('/')) {
      p = p.slice(0, -1);
    }
    
    return p;
  }
}
