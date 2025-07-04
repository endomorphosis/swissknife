// src/storage/registry.ts

import { StorageBackend, StorageError, StorageErrorType } from './backend.js';
import { ConfigurationManager } from '../config/manager';
import { logger } from '../utils/logger';
import path from 'path';

/**
 * Mount point configuration
 */
export interface MountPointConfig {
  path: string;
  backendId: string;
  options?: Record<string, any>;
}

/**
 * Result of resolving a path to its backend
 */
export interface ResolvedPath {
  backend: StorageBackend;
  relativePath: string;
  mountPoint: string;
}

/**
 * Service responsible for managing storage backends and their mount points
 */
export class StorageRegistry {
  private static instance: StorageRegistry;
  private backends: Map<string, StorageBackend> = new Map();
  private mounts: Map<string, string> = new Map(); // mountPoint -> backendId
  private config: ConfigurationManager;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.config = ConfigurationManager.getInstance();
    logger.debug('StorageRegistry initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): StorageRegistry {
    if (!StorageRegistry.instance) {
      StorageRegistry.instance = new StorageRegistry();
    }
    return StorageRegistry.instance;
  }

  /**
   * Register a storage backend
   * @param backend Backend to register
   */
  public registerBackend(backend: StorageBackend): void {
    if (this.backends.has(backend.id)) {
      logger.warn(`Backend with ID ${backend.id} already registered, overwriting`);
    }
    this.backends.set(backend.id, backend);
    logger.debug(`Backend registered: ${backend.id} (${backend.name})`);
  }

  /**
   * Get a registered backend by ID
   * @param backendId ID of the backend to retrieve
   * @returns The backend instance or undefined if not found
   */
  public getBackend(backendId: string): StorageBackend | undefined {
    return this.backends.get(backendId);
  }

  /**
   * Mount a backend at a specific path
   * @param mountPoint Virtual path to mount the backend
   * @param backendId ID of the backend to mount
   * @throws Error if the backend isn't registered or the path is already mounted
   */
  public mount(mountPoint: string, backendId: string): void {
    // Normalize the mount point
    mountPoint = this.normalizePath(mountPoint);
    
    // Check if backend exists
    const backend = this.getBackend(backendId);
    if (!backend) {
      throw new Error(`Cannot mount: Backend '${backendId}' is not registered`);
    }
    
    // Check if path is already mounted
    if (this.mounts.has(mountPoint)) {
      throw new Error(`Cannot mount: Path '${mountPoint}' is already mounted`);
    }
    
    // Register the mount
    this.mounts.set(mountPoint, backendId);
    logger.debug(`Mounted backend '${backendId}' at '${mountPoint}'`);
  }

  /**
   * Unmount a backend from a path
   * @param mountPoint Path to unmount
   * @returns True if unmounted, false if not found
   */
  public unmount(mountPoint: string): boolean {
    mountPoint = this.normalizePath(mountPoint);
    const result = this.mounts.delete(mountPoint);
    
    if (result) {
      logger.debug(`Unmounted '${mountPoint}'`);
    } else {
      logger.debug(`Cannot unmount: '${mountPoint}' is not mounted`);
    }
    
    return result;
  }

  /**
   * Get all mount points and their backend IDs
   * @returns Map of mount points to backend IDs
   */
  public getMounts(): Map<string, string> {
    return new Map(this.mounts);
  }

  /**
   * Get all registered backends
   * @returns Array of backend instances
   */
  public getBackends(): StorageBackend[] {
    return Array.from(this.backends.values());
  }

  /**
   * Find the backend responsible for a virtual path
   * @param virtualPath Virtual path to resolve
   * @returns Backend, relative path, and mount point
   * @throws StorageError if no backend is mounted for the path
   */
  public getBackendForPath(virtualPath: string): ResolvedPath {
    virtualPath = this.normalizePath(virtualPath);
    
    // Sort mount points by length (longest first) to find the most specific match
    const mountPoints = Array.from(this.mounts.keys()).sort((a, b) => b.length - a.length);
    
    for (const mountPoint of mountPoints) {
      if (virtualPath === mountPoint || virtualPath.startsWith(`${mountPoint}/`)) {
        const backendId = this.mounts.get(mountPoint)!;
        const backend = this.backends.get(backendId);
        
        if (!backend) {
          logger.error(`Inconsistent state: Mount point ${mountPoint} refers to non-existent backend ${backendId}`);
          continue;
        }
        
        // Calculate the relative path by removing the mount point prefix
        let relativePath = virtualPath.slice(mountPoint.length);
        // Remove leading slash if present
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1);
        }
        // Empty relative path means root directory
        if (relativePath === '') {
          relativePath = '.';
        }
        
        return { backend, relativePath, mountPoint };
      }
    }
    
    throw new StorageError(
      `No backend mounted for path: ${virtualPath}`,
      StorageErrorType.NOT_FOUND
    );
  }

  /**
   * Load initial mount configuration from config
   */
  public loadMountConfig(): void {
    try {
      const mountConfig = this.config.get<MountPointConfig[]>('storage.mounts', []);
      
      for (const mount of mountConfig) {
        try {
          if (mount.path && mount.backendId) {
            this.mount(mount.path, mount.backendId);
          }
        } catch (error) {
          logger.error(`Failed to mount ${mount.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      logger.info(`Loaded ${mountConfig.length} mount points from configuration`);
    } catch (error) {
      logger.error(`Failed to load mount configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save current mounts to configuration
   */
  public saveMountConfig(): void {
    try {
      const mountConfig: MountPointConfig[] = Array.from(this.mounts.entries())
        .map(([path, backendId]) => ({
          path,
          backendId
        }));
      
      this.config.set('storage.mounts', mountConfig);
      logger.debug(`Saved ${mountConfig.length} mount points to configuration`);
    } catch (error) {
      logger.error(`Failed to save mount configuration: ${error instanceof Error ? error.message : String(error)}`);
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