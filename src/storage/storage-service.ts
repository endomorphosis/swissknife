// src/storage/storage-service.ts

import { StorageBackend, DirEntry, FileStat } from './backend.js';
import { FilesystemBackend } from './backends/filesystem.ts';
import { IPFSBackend } from './backends/ipfs-backend.js';
import { ConfigurationManager } from '../config/manager';
import { logger } from '../utils/logger';

/**
 * Backend types supported by the storage service
 */
export enum BackendType {
  LOCAL = 'local',
  IPFS = 'ipfs',
}

/**
 * Storage service that provides a unified interface to multiple storage backends
 */
export class StorageService {
  private static instance: StorageService;
  private backends: Map<BackendType, StorageBackend> = new Map();
  private defaultBackend: BackendType = BackendType.LOCAL;
  private initialized = false;

  /**
   * Create a new storage service
   */
  private constructor() {
    // Load configuration
    const config = ConfigurationManager.getInstance();
    
    // Set default backend from config if available
    const configuredDefault = config.get<string>('storage.defaultBackend');
    if (configuredDefault && Object.values(BackendType).includes(configuredDefault as BackendType)) {
      this.defaultBackend = configuredDefault as BackendType;
    }
    
    // Register available backends
    this.backends.set(BackendType.LOCAL, new FilesystemBackend());
    this.backends.set(BackendType.IPFS, new IPFSBackend());
  }

  /**
   * Get the storage service instance
   * @returns The storage service instance
   */
  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /**
   * Initialize the storage service
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    logger.info('Initializing storage service...');
    
    try {
      // Initialize all backends
      const initPromises: Promise<void>[] = [];
      
      for (const [type, backend] of this.backends.entries()) {
        // Skip backends that are disabled in config
        const configPath = `storage.backends.${type}.enabled`;
        const config = ConfigurationManager.getInstance();
        
        if (config.get<boolean>(configPath) === false) {
          logger.info(`Backend ${type} is disabled in config, skipping initialization`);
          continue;
        }
        
        logger.info(`Initializing ${type} backend...`);
        initPromises.push(
          backend.init()
            .then(() => {
              logger.info(`${type} backend initialized successfully`);
            })
            .catch((error) => {
              logger.error(`Failed to initialize ${type} backend: ${error instanceof Error ? error.message : String(error)}`);
              
              // If the default backend fails to initialize, we need to change the default
              if (type === this.defaultBackend) {
                // Find a working backend to use as fallback
                for (const [fallbackType, fallbackBackend] of this.backends.entries()) {
                  if (fallbackType !== type && fallbackBackend.isInitialized()) {
                    logger.warn(`Switching default backend from ${type} to ${fallbackType}`);
                    this.defaultBackend = fallbackType;
                    break;
                  }
                }
              }
              
              // Don't propagate the error, just log it
            })
        );
      }
      
      // Wait for all backends to initialize
      await Promise.all(initPromises);
      
      // Check if the default backend is initialized
      if (!this.getBackend(this.defaultBackend).isInitialized()) {
        logger.error(`Default backend ${this.defaultBackend} is not initialized`);
        throw new Error(`Default backend ${this.defaultBackend} is not initialized`);
      }
      
      this.initialized = true;
      logger.info('Storage service initialized successfully');
    } catch (error) {
      logger.error(`Storage service initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Check if the storage service is initialized
   * @returns True if initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get a storage backend by type
   * @param type Backend type
   * @returns The storage backend
   */
  public getBackend(type: BackendType): StorageBackend {
    const backend = this.backends.get(type);
    
    if (!backend) {
      throw new Error(`Backend ${type} not found`);
    }
    
    return backend;
  }
  
  /**
   * Get the default storage backend
   * @returns The default storage backend
   */
  public getDefaultBackend(): StorageBackend {
    return this.getBackend(this.defaultBackend);
  }
  
  /**
   * Get the type of the default backend
   * @returns The default backend type
   */
  public getDefaultBackendType(): BackendType {
    return this.defaultBackend;
  }
  
  /**
   * Set the default backend type
   * @param type The new default backend type
   */
  public setDefaultBackendType(type: BackendType): void {
    if (!this.backends.has(type)) {
      throw new Error(`Backend ${type} not found`);
    }
    
    if (!this.backends.get(type)!.isInitialized()) {
      throw new Error(`Backend ${type} is not initialized`);
    }
    
    this.defaultBackend = type;
    logger.info(`Default backend set to ${type}`);
  }
  
  /**
   * Check if a path exists using the default backend
   * @param path Path to check
   * @returns True if exists
   */
  public async exists(path: string): Promise<boolean> {
    return await this.getDefaultBackend().exists(path);
  }
  
  /**

   * Check if a path exists in a specific backend
   * @param path Path to check
   * @param backend Backend to use
   * @returns True if exists
   */
  public async existsIn(path: string, backend: BackendType): Promise<boolean> {
    return await this.getBackend(backend).exists(path);
  }
  
  /**
   * Get file stats using the default backend
   * @param path Path to get stats for
   * @returns File stats
   */
  public async stat(path: string): Promise<FileStat> {
    return await this.getDefaultBackend().stat(path);
  }
  
  /**
   * Get file stats from a specific backend
   * @param path Path to get stats for
   * @param backend Backend to use
   * @returns File stats
   */
  public async statFrom(path: string, backend: BackendType): Promise<FileStat> {
    return await this.getBackend(backend).stat(path);
  }
  
  /**
   * Read a file using the default backend
   * @param path Path to read
   * @returns File content as Buffer
   */
  public async readFile(path: string): Promise<Buffer> {
    return await this.getDefaultBackend().readFile(path);
  }
  
  /**
   * Read a file from a specific backend
   * @param path Path to read
   * @param backend Backend to use
   * @returns File content as Buffer
   */
  public async readFileFrom(path: string, backend: BackendType): Promise<Buffer> {
    return await this.getBackend(backend).readFile(path);
  }
  
  /**
   * Write a file using the default backend
   * @param path Path to write
   * @param data Data to write
   */
  public async writeFile(path: string, data: Buffer | string): Promise<void> {
    await this.getDefaultBackend().writeFile(path, data);
  }
  
  /**
   * Write a file to a specific backend
   * @param path Path to write
   * @param data Data to write
   * @param backend Backend to use
   */
  public async writeFileTo(path: string, data: Buffer | string, backend: BackendType): Promise<void> {
    await this.getBackend(backend).writeFile(path, data);
  }
  
  /**
   * Create a directory using the default backend
   * @param path Path to create
   * @param options Options for directory creation
   */
  public async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.getDefaultBackend().mkdir(path, options);
  }
  
  /**
   * Create a directory in a specific backend
   * @param path Path to create
   * @param options Options for directory creation
   * @param backend Backend to use
   */
  public async mkdirIn(path: string, options: { recursive?: boolean } | undefined, backend: BackendType): Promise<void> {
    await this.getBackend(backend).mkdir(path, options);
  }
  
  /**
   * Read a directory using the default backend
   * @param path Path to read
   * @returns Directory entries
   */
  public async readdir(path: string): Promise<DirEntry[]> {
    return await this.getDefaultBackend().readdir(path);
  }
  
  /**
   * Read a directory from a specific backend
   * @param path Path to read
   * @param backend Backend to use
   * @returns Directory entries
   */
  public async readdirFrom(path: string, backend: BackendType): Promise<DirEntry[]> {
    return await this.getBackend(backend).readdir(path);
  }
  
  /**
   * Remove a file or directory using the default backend
   * @param path Path to remove
   * @param options Options for removal
   */
  public async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.getDefaultBackend().rm(path, options);
  }
  
  /**
   * Remove a file or directory from a specific backend
   * @param path Path to remove
   * @param options Options for removal
   * @param backend Backend to use
   */
  public async rmFrom(path: string, options: { recursive?: boolean } | undefined, backend: BackendType): Promise<void> {
    await this.getBackend(backend).rm(path, options);
  }
  
  /**
   * Copy a file using the default backend
   * @param src Source path
   * @param dest Destination path
   */
  public async copyFile(src: string, dest: string): Promise<void> {
    await this.getDefaultBackend().copyFile(src, dest);
  }
  
  /**
   * Copy a file in a specific backend
   * @param src Source path
   * @param dest Destination path
   * @param backend Backend to use
   */
  public async copyFileIn(src: string, dest: string, backend: BackendType): Promise<void> {
    await this.getBackend(backend).copyFile(src, dest);
  }
  
  /**
   * Rename or move a file or directory using the default backend
   * @param src Source path
   * @param dest Destination path
   * @returns 
   */
  public async rename(src: string, dest: string): Promise<void> {
    await this.getDefaultBackend().rename(src, dest);
  }
  
  /**
   * Rename or move a file or directory in a specific backend
   * @param src Source path
   * @param dest Destination path
   * @param backend Backend to use
   * @returns 
   */
  public async renameIn(src: string, dest: string, backend: BackendType): Promise<void> {
    await this.getBackend(backend).rename(src, dest);
  }
  
  /**
   * Copy a file or directory between backends
   * @param srcPath Source path
   * @param srcBackend Source backend
   * @param destPath Destination path
   * @param destBackend Destination backend
   * @param options Options for copy operation
   */
  public async copyBetweenBackends(
    srcPath: string,
    srcBackend: BackendType,
    destPath: string,
    destBackend: BackendType,
    options: { recursive?: boolean } = { recursive: false }
  ): Promise<void> {
    // Get source and destination backends
    const sourceBackend = this.getBackend(srcBackend);
    const destinationBackend = this.getBackend(destBackend);
    
    // Check if source exists
    if (!(await sourceBackend.exists(srcPath))) {
      throw new Error(`Source path ${srcPath} does not exist in ${srcBackend} backend`);
    }
    
    // Get source stats
    const stats = await sourceBackend.stat(srcPath);
    
    if (stats.isDirectory) {
      // Handle directory copy
      if (!options.recursive) {
        throw new Error(`Cannot copy directory ${srcPath} without recursive option`);
      }
      
      // Create destination directory
      await destinationBackend.mkdir(destPath, { recursive: true });
      
      // Copy all children
      const entries = await sourceBackend.readdir(srcPath);
      
      for (const entry of entries) {
        const srcChildPath = `${srcPath === '/' ? '' : srcPath}/${entry.name}`;
        const destChildPath = `${destPath === '/' ? '' : destPath}/${entry.name}`;
        
        await this.copyBetweenBackends(
          srcChildPath,
          srcBackend,
          destChildPath,
          destBackend,
          options
        );
      }
    } else {
      // Handle file copy
      const content = await sourceBackend.readFile(srcPath);
      await destinationBackend.writeFile(destPath, content);
    }
  }
  
  /**
   * Get an IPFS-specific backend for advanced operations
   * @returns The IPFS backend
   */
  public getIPFSBackend(): IPFSBackend {
    return this.getBackend(BackendType.IPFS) as IPFSBackend;
  }
}
