// src/storage/path-resolver.ts

import { StorageRegistry, ResolvedPath } from './registry.js';
import { StorageError, StorageErrorType } from './backend.js';
import path from 'path';
import { logger } from '../utils/logger';

/**
 * Service for resolving virtual paths to their appropriate backend and relative paths
 */
export class PathResolver {
  private static instance: PathResolver;
  private registry: StorageRegistry;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.registry = StorageRegistry.getInstance();
    logger.debug('PathResolver initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): PathResolver {
    if (!PathResolver.instance) {
      PathResolver.instance = new PathResolver();
    }
    return PathResolver.instance;
  }

  /**
   * Resolve a virtual path to its backend and relative path
   * @param virtualPath Virtual path to resolve
   * @returns Resolved path details
   * @throws StorageError if the path cannot be resolved
   */
  public resolvePath(virtualPath: string): ResolvedPath {
    if (!virtualPath) {
      throw new StorageError(
        'Path cannot be empty',
        StorageErrorType.INVALID_ARGUMENT
      );
    }

    // Normalize the virtual path
    virtualPath = this.normalizePath(virtualPath);

    try {
      return this.registry.getBackendForPath(virtualPath);
    } catch (error) {
      // Add more context to the error if needed
      if (error instanceof StorageError) {
        throw error;
      }
      
      throw new StorageError(
        `Failed to resolve path ${virtualPath}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.NOT_FOUND,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Joins path segments and resolves to a backend
   * @param segments Path segments to join
   * @returns Resolved path details
   * @throws StorageError if the path cannot be resolved
   */
  public resolvePathSegments(...segments: string[]): ResolvedPath {
    const joined = segments.join('/');
    return this.resolvePath(joined);
  }

  /**
   * Ensures that parent directories exist for a given path
   * @param virtualPath Virtual path to ensure parents for
   * @throws StorageError if parent directories cannot be created
   */
  public async ensureParentDirectories(virtualPath: string): Promise<void> {
    const parentPath = path.posix.dirname(this.normalizePath(virtualPath));
    
    // Root path does not need parent directories
    if (parentPath === '/') {
      return;
    }
    
    const resolved = this.resolvePath(parentPath);
    
    // Check if directory exists
    try {
      const stats = await resolved.backend.stat(resolved.relativePath);
      if (!stats.isDirectory) {
        throw new StorageError(
          `Parent path exists but is not a directory: ${parentPath}`,
          StorageErrorType.NOT_A_DIRECTORY
        );
      }
      // Directory exists, no need to create
    } catch (error) {
      if (error instanceof StorageError && error.type === StorageErrorType.NOT_FOUND) {
        // If not found, try to create recursively
        await resolved.backend.mkdir(resolved.relativePath, { recursive: true });
      } else {
        // Propagate other errors
        throw error;
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