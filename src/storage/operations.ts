// src/storage/operations.ts

import { PathResolver } from './path-resolver.js';
import { StorageError, StorageErrorType, ReadFileOptions, WriteFileOptions, FileStat, DirEntry, StorageBackend } from './backend.js';
import { ResolvedPath } from './registry.js';
import { Readable, Writable } from 'stream';
import { logger } from '../utils/logger';
import path from 'path';

/**
 * Service providing high-level operations for the Virtual File System
 */
export class StorageOperations {
  private static instance: StorageOperations;
  private pathResolver: PathResolver;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.pathResolver = PathResolver.getInstance();
    logger.debug('StorageOperations initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): StorageOperations {
    if (!StorageOperations.instance) {
      StorageOperations.instance = new StorageOperations();
    }
    return StorageOperations.instance;
  }

  /**
   * Read the contents of a file
   * @param virtualPath Virtual path to the file
   * @param options Read options
   * @returns File content as a Buffer
   * @throws StorageError if the file doesn't exist or cannot be read
   */
  public async readFile(virtualPath: string, options?: ReadFileOptions): Promise<Buffer> {
    const resolved = this.pathResolver.resolvePath(virtualPath);
    
    try {
      return await resolved.backend.readFile(resolved.relativePath, options);
    } catch (error) {
      if (error instanceof StorageError) {
        // Add context to the error
        error.message = `Error reading ${virtualPath}: ${error.message}`;
        throw error;
      }
      
      throw new StorageError(
        `Error reading ${virtualPath}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Write content to a file
   * @param virtualPath Virtual path to the file
   * @param data Content to write
   * @param options Write options
   * @throws StorageError if the file cannot be written
   */
  public async writeFile(virtualPath: string, data: Buffer | string, options?: WriteFileOptions): Promise<void> {
    const resolved = this.pathResolver.resolvePath(virtualPath);
    
    // Check if backend is read-only
    if (resolved.backend.isReadOnly) {
      throw new StorageError(
        `Cannot write to ${virtualPath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    try {
      // Ensure parent directories exist
      await this.pathResolver.ensureParentDirectories(virtualPath);
      
      // Write the file
      await resolved.backend.writeFile(resolved.relativePath, data, options);
    } catch (error) {
      if (error instanceof StorageError) {
        // Add context to the error
        error.message = `Error writing ${virtualPath}: ${error.message}`;
        throw error;
      }
      
      throw new StorageError(
        `Error writing ${virtualPath}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if a path exists
   * @param virtualPath Virtual path to check
   * @returns True if the path exists, false otherwise
   */
  public async exists(virtualPath: string): Promise<boolean> {
    try {
      const resolved = this.pathResolver.resolvePath(virtualPath);
      return await resolved.backend.exists(resolved.relativePath);
    } catch (error) {
      // If path resolution fails, the path doesn't exist
      if (error instanceof StorageError && error.type === StorageErrorType.NOT_FOUND) {
        return false;
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get file or directory statistics
   * @param virtualPath Virtual path to get stats for
   * @returns File statistics
   * @throws StorageError if the path doesn't exist or stats cannot be retrieved
   */
  public async stat(virtualPath: string): Promise<FileStat> {
    const resolved = this.pathResolver.resolvePath(virtualPath);
    
    try {
      return await resolved.backend.stat(resolved.relativePath);
    } catch (error) {
      if (error instanceof StorageError) {
        // Add context to the error
        error.message = `Error getting stats for ${virtualPath}: ${error.message}`;
        throw error;
      }
      
      throw new StorageError(
        `Error getting stats for ${virtualPath}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * List directory contents
   * @param virtualPath Virtual path to the directory
   * @returns Array of directory entries
   * @throws StorageError if the path doesn't exist or is not a directory
   */
  public async readdir(virtualPath: string): Promise<DirEntry[]> {
    const resolved = this.pathResolver.resolvePath(virtualPath);
    
    try {
      return await resolved.backend.readdir(resolved.relativePath);
    } catch (error) {
      if (error instanceof StorageError) {
        // Add context to the error
        error.message = `Error reading directory ${virtualPath}: ${error.message}`;
        throw error;
      }
      
      throw new StorageError(
        `Error reading directory ${virtualPath}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create a directory
   * @param virtualPath Virtual path to the directory
   * @param options Options for directory creation
   * @throws StorageError if the directory cannot be created
   */
  public async mkdir(virtualPath: string, options?: { recursive?: boolean }): Promise<void> {
    const resolved = this.pathResolver.resolvePath(virtualPath);
    
    // Check if backend is read-only
    if (resolved.backend.isReadOnly) {
      throw new StorageError(
        `Cannot create directory ${virtualPath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    try {
      await resolved.backend.mkdir(resolved.relativePath, options);
    } catch (error) {
      if (error instanceof StorageError) {
        // Add context to the error
        error.message = `Error creating directory ${virtualPath}: ${error.message}`;
        throw error;
      }
      
      throw new StorageError(
        `Error creating directory ${virtualPath}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Delete a file
   * @param virtualPath Virtual path to the file
   * @throws StorageError if the file cannot be deleted
   */
  public async unlink(virtualPath: string): Promise<void> {
    const resolved = this.pathResolver.resolvePath(virtualPath);
    
    // Check if backend is read-only
    if (resolved.backend.isReadOnly) {
      throw new StorageError(
        `Cannot delete file ${virtualPath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    try {
      await resolved.backend.unlink(resolved.relativePath);
    } catch (error) {
      if (error instanceof StorageError) {
        // Add context to the error
        error.message = `Error deleting file ${virtualPath}: ${error.message}`;
        throw error;
      }
      
      throw new StorageError(
        `Error deleting file ${virtualPath}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Delete a directory
   * @param virtualPath Virtual path to the directory
   * @param options Options for directory removal
   * @throws StorageError if the directory cannot be deleted
   */
  public async rmdir(virtualPath: string, options?: { recursive?: boolean }): Promise<void> {
    const resolved = this.pathResolver.resolvePath(virtualPath);
    
    // Check if backend is read-only
    if (resolved.backend.isReadOnly) {
      throw new StorageError(
        `Cannot delete directory ${virtualPath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    try {
      await resolved.backend.rmdir(resolved.relativePath, options);
    } catch (error) {
      if (error instanceof StorageError) {
        // Add context to the error
        error.message = `Error deleting directory ${virtualPath}: ${error.message}`;
        throw error;
      }
      
      throw new StorageError(
        `Error deleting directory ${virtualPath}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Rename a file or directory
   * @param oldVirtualPath Current virtual path
   * @param newVirtualPath New virtual path
   * @throws StorageError if the rename operation fails
   */
  public async rename(oldVirtualPath: string, newVirtualPath: string): Promise<void> {
    const oldResolved = this.pathResolver.resolvePath(oldVirtualPath);
    const newResolved = this.pathResolver.resolvePath(newVirtualPath);
    
    // Check if backends are read-only
    if (oldResolved.backend.isReadOnly || newResolved.backend.isReadOnly) {
      throw new StorageError(
        `Cannot rename ${oldVirtualPath} to ${newVirtualPath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    // If both paths are on the same backend, use the backend's rename if available
    if (oldResolved.backend.id === newResolved.backend.id && oldResolved.backend.rename) {
      try {
        await oldResolved.backend.rename(oldResolved.relativePath, newResolved.relativePath);
        return;
      } catch (error) {
        if (error instanceof StorageError) {
          // Add context to the error
          error.message = `Error renaming ${oldVirtualPath} to ${newVirtualPath}: ${error.message}`;
          throw error;
        }
        
        throw new StorageError(
          `Error renaming ${oldVirtualPath} to ${newVirtualPath}: ${error instanceof Error ? error.message : String(error)}`,
          StorageErrorType.BACKEND_SPECIFIC,
          error instanceof Error ? error : undefined
        );
      }
    }
    
    // If different backends or rename not supported, do a copy + delete
    await this.copy(oldVirtualPath, newVirtualPath);
    await this.unlink(oldVirtualPath);
  }

  /**
   * Copy a file or directory
   * @param sourceVirtualPath Source virtual path
   * @param destVirtualPath Destination virtual path
   * @param options Copy options
   * @throws StorageError if the copy operation fails
   */
  public async copy(
    sourceVirtualPath: string, 
    destVirtualPath: string, 
    options?: { recursive?: boolean }
  ): Promise<void> {
    const sourceResolved = this.pathResolver.resolvePath(sourceVirtualPath);
    const destResolved = this.pathResolver.resolvePath(destVirtualPath);
    
    // Check if destination backend is read-only
    if (destResolved.backend.isReadOnly) {
      throw new StorageError(
        `Cannot copy to ${destVirtualPath}: Destination backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    // Ensure destination parent directories exist
    await this.pathResolver.ensureParentDirectories(destVirtualPath);
    
    try {
      // Get source stats to determine if it's a file or directory
      const stats = await sourceResolved.backend.stat(sourceResolved.relativePath);
      
      if (stats.isFile) {
        // Copy file
        
        // If both paths are on the same backend, use the backend's copyFile if available
        if (sourceResolved.backend.id === destResolved.backend.id && sourceResolved.backend.copyFile) {
          await sourceResolved.backend.copyFile(
            sourceResolved.relativePath, 
            destResolved.relativePath
          );
        } else {
          // Otherwise, read + write
          const data = await sourceResolved.backend.readFile(sourceResolved.relativePath);
          await destResolved.backend.writeFile(destResolved.relativePath, data);
        }
      } else if (stats.isDirectory) {
        // Copy directory
        if (!options?.recursive) {
          throw new StorageError(
            `Cannot copy directory ${sourceVirtualPath} without recursive option`,
            StorageErrorType.INVALID_ARGUMENT
          );
        }
        
        // Create destination directory
        await destResolved.backend.mkdir(destResolved.relativePath, { recursive: true });
        
        // Copy directory contents
        const entries = await sourceResolved.backend.readdir(sourceResolved.relativePath);
        
        for (const entry of entries) {
          const sourcePath = path.posix.join(sourceVirtualPath, entry.name);
          const destPath = path.posix.join(destVirtualPath, entry.name);
          
          await this.copy(sourcePath, destPath, { recursive: true });
        }
      } else {
        throw new StorageError(
          `Unsupported file type at ${sourceVirtualPath}`,
          StorageErrorType.OPERATION_NOT_SUPPORTED
        );
      }
    } catch (error) {
      if (error instanceof StorageError) {
        // Add context to the error
        error.message = `Error copying ${sourceVirtualPath} to ${destVirtualPath}: ${error.message}`;
        throw error;
      }
      
      throw new StorageError(
        `Error copying ${sourceVirtualPath} to ${destVirtualPath}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create a readable stream for a file
   * @param virtualPath Virtual path to the file
   * @param options Stream options
   * @returns A readable stream
   * @throws StorageError if the stream cannot be created
   */
  public async createReadStream(virtualPath: string, options?: any): Promise<NodeJS.ReadableStream> {
    const resolved = this.pathResolver.resolvePath(virtualPath);
    
    if (!resolved.backend.createReadStream) {
      throw new StorageError(
        `Backend does not support streaming for ${virtualPath}`,
        StorageErrorType.OPERATION_NOT_SUPPORTED
      );
    }
    
    try {
      return await resolved.backend.createReadStream(resolved.relativePath, options);
    } catch (error) {
      if (error instanceof StorageError) {
        // Add context to the error
        error.message = `Error creating read stream for ${virtualPath}: ${error.message}`;
        throw error;
      }
      
      throw new StorageError(
        `Error creating read stream for ${virtualPath}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create a writable stream for a file
   * @param virtualPath Virtual path to the file
   * @param options Stream options
   * @returns A writable stream
   * @throws StorageError if the stream cannot be created
   */
  public async createWriteStream(virtualPath: string, options?: any): Promise<NodeJS.WritableStream> {
    const resolved = this.pathResolver.resolvePath(virtualPath);
    
    // Check if backend is read-only
    if (resolved.backend.isReadOnly) {
      throw new StorageError(
        `Cannot write to ${virtualPath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    if (!resolved.backend.createWriteStream) {
      throw new StorageError(
        `Backend does not support streaming for ${virtualPath}`,
        StorageErrorType.OPERATION_NOT_SUPPORTED
      );
    }
    
    try {
      // Ensure parent directories exist
      await this.pathResolver.ensureParentDirectories(virtualPath);
      
      return await resolved.backend.createWriteStream(resolved.relativePath, options);
    } catch (error) {
      if (error instanceof StorageError) {
        // Add context to the error
        error.message = `Error creating write stream for ${virtualPath}: ${error.message}`;
        throw error;
      }
      
      throw new StorageError(
        `Error creating write stream for ${virtualPath}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Resolve a virtual path to its backend and relative path
   * @param virtualPath Virtual path to resolve
   * @returns Resolved path details
   */
  public resolve(virtualPath: string): ResolvedPath {
    return this.pathResolver.resolvePath(virtualPath);
  }
}