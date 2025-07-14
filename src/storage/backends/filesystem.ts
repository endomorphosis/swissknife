// src/storage/backends/filesystem.ts

import { StorageBackend, FileStat, DirEntry, StorageError, StorageErrorType, ReadFileOptions, WriteFileOptions } from '../backend';
import * as fs from 'fs/promises';
import { constants, createReadStream, createWriteStream, Stats } from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { Readable, Writable } from 'stream';

/**
 * Configuration options for the filesystem backend
 */
export interface FilesystemBackendOptions {
  baseDir: string;
  readOnly?: boolean;
  createBaseDir?: boolean;
}

/**
 * Implementation of StorageBackend for the local filesystem
 */
export class FilesystemBackend implements StorageBackend {
  public readonly id: string;
  public readonly name: string;
  public readonly isReadOnly: boolean;
  private baseDir: string;

  /**
   * Creates a new FilesystemBackend instance
   * @param options Configuration options
   * @throws Error if the base directory doesn't exist or cannot be accessed
   */
  constructor(options: FilesystemBackendOptions) {
    this.id = `fs-${Math.random().toString(36).substring(2, 9)}`;
    this.name = `Filesystem (${options.baseDir})`;
    this.isReadOnly = options.readOnly || false;
    this.baseDir = path.resolve(options.baseDir);
    
    this.initAsync(options).catch(error => {
      logger.error(`Failed to initialize FilesystemBackend: ${error.message}`);
      throw error;
    });
  }

  /**
   * Initialize the backend asynchronously
   * @private
   */
  private async initAsync(options: FilesystemBackendOptions): Promise<void> {
    try {
      const stats = await fs.stat(this.baseDir);
      if (!stats.isDirectory()) {
        throw new Error(`Base directory path '${this.baseDir}' is not a directory`);
      }
      logger.debug(`FilesystemBackend initialized with base directory: ${this.baseDir}`);
    } catch (error) {
      // If the directory doesn't exist and we're allowed to create it
      if (
        error instanceof Error && 
        'code' in error && 
        error.code === 'ENOENT' && 
        options.createBaseDir
      ) {
        try {
          await fs.mkdir(this.baseDir, { recursive: true });
          logger.debug(`Created base directory: ${this.baseDir}`);
        } catch (mkdirError) {
          throw new Error(`Failed to create base directory: ${mkdirError instanceof Error ? mkdirError.message : String(mkdirError)}`);
        }
      } else {
        throw new Error(`Failed to access base directory: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Resolves a relative path to an absolute path
   * @param relativePath Path relative to the base directory
   * @returns Absolute path
   * @throws StorageError if the path attempts to escape the base directory
   * @private
   */
  private resolvePath(relativePath: string): string {
    // Normalize the relative path to prevent path traversal attacks
    const normalizedPath = path.normalize(relativePath)
      .replace(/^[\/\\]+/, '') // Remove leading slashes
      .split(/[\/\\]+/) // Split by slashes
      .filter(Boolean); // Remove empty segments
    
    // Join the normalized path segments
    const resolvedPath = path.join(this.baseDir, ...normalizedPath);
    
    // Verify the resolved path starts with the base directory to prevent path traversal
    if (!resolvedPath.startsWith(this.baseDir)) {
      throw new StorageError(
        `Path traversal attempt: ${relativePath}`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    return resolvedPath;
  }

  /**
   * Convert native fs.Stats to our FileStat interface
   * @param stats Native fs.Stats object
   * @returns FileStat representation
   * @private
   */
  private convertStats(stats: Stats): FileStat {
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: stats.isSymbolicLink(),
      size: stats.size,
      modifiedTime: new Date(stats.mtime),
      createdTime: new Date(stats.birthtime),
      metadata: {
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
        dev: stats.dev,
        ino: stats.ino,
        nlink: stats.nlink,
        atime: new Date(stats.atime),
        ctime: new Date(stats.ctime)
      }
    };
  }

  /**
   * Convert fs.Dirent entries to our DirEntry interface
   * @param entries Native fs.Dirent objects
   * @param relativePath Parent directory relative path
   * @returns Array of DirEntry objects
   * @private
   */
  private convertDirEntries(entries: fs.Dirent[], relativePath: string): DirEntry[] {
    return entries.map(entry => {
      const entryPath = path.join(relativePath, entry.name);
      return {
        name: entry.name,
        path: entryPath,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
        isSymbolicLink: entry.isSymbolicLink()
      };
    });
  }

  /**
   * Maps native fs errors to StorageError types
   * @param error The original error
   * @param path The path that caused the error
   * @returns StorageError with the appropriate type
   * @private
   */
  private mapError(error: unknown, path: string): StorageError {
    if (!(error instanceof Error) || !('code' in error)) {
      return new StorageError(
        `Unknown error for path ${path}: ${error instanceof Error ? error.message : String(error)}`,
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }

    const code = error.code as string;
    
    switch (code) {
      case 'ENOENT':
        return StorageError.notFound(path, error);
      case 'EACCES':
      case 'EPERM':
        return StorageError.permissionDenied(path, error);
      case 'EEXIST':
        return StorageError.alreadyExists(path, error);
      case 'ENOTDIR':
        return StorageError.notADirectory(path, error);
      case 'EISDIR':
        return StorageError.isADirectory(path, error);
      case 'ENOTEMPTY':
        return StorageError.notEmpty(path, error);
      default:
        return new StorageError(
          `Filesystem error for path ${path}: ${error.message}`,
          StorageErrorType.BACKEND_SPECIFIC,
          error
        );
    }
  }

  /**
   * Read the contents of a file
   * @inheritdoc
   */
  public async readFile(relativePath: string, options?: ReadFileOptions): Promise<Buffer> {
    try {
      const resolvedPath = this.resolvePath(relativePath);
      return await fs.readFile(resolvedPath, options);
    } catch (error) {
      throw this.mapError(error, relativePath);
    }
  }

  /**
   * Write content to a file
   * @inheritdoc
   */
  public async writeFile(relativePath: string, data: Buffer | string, options?: WriteFileOptions): Promise<void> {
    // Check if backend is read-only
    if (this.isReadOnly) {
      throw new StorageError(
        `Cannot write to ${relativePath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    try {
      const resolvedPath = this.resolvePath(relativePath);
      
      // Create parent directories if they don't exist
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write the file
      await fs.writeFile(resolvedPath, data, options);
    } catch (error) {
      throw this.mapError(error, relativePath);
    }
  }

  /**
   * Check if a path exists
   * @inheritdoc
   */
  public async exists(relativePath: string): Promise<boolean> {
    try {
      const resolvedPath = this.resolvePath(relativePath);
      await fs.access(resolvedPath);
      return true;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw this.mapError(error, relativePath);
    }
  }

  /**
   * Get file or directory statistics
   * @inheritdoc
   */
  public async stat(relativePath: string): Promise<FileStat> {
    try {
      const resolvedPath = this.resolvePath(relativePath);
      const stats = await fs.stat(resolvedPath);
      return this.convertStats(stats);
    } catch (error) {
      throw this.mapError(error, relativePath);
    }
  }

  /**
   * List directory contents
   * @inheritdoc
   */
  public async readdir(relativePath: string): Promise<DirEntry[]> {
    try {
      const resolvedPath = this.resolvePath(relativePath);
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
      return this.convertDirEntries(entries, relativePath);
    } catch (error) {
      throw this.mapError(error, relativePath);
    }
  }

  /**
   * Create a directory
   * @inheritdoc
   */
  public async mkdir(relativePath: string, options?: { recursive?: boolean }): Promise<void> {
    // Check if backend is read-only
    if (this.isReadOnly) {
      throw new StorageError(
        `Cannot create directory ${relativePath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    try {
      const resolvedPath = this.resolvePath(relativePath);
      await fs.mkdir(resolvedPath, { recursive: options?.recursive });
    } catch (error) {
      throw this.mapError(error, relativePath);
    }
  }

  /**
   * Delete a file
   * @inheritdoc
   */
  public async unlink(relativePath: string): Promise<void> {
    // Check if backend is read-only
    if (this.isReadOnly) {
      throw new StorageError(
        `Cannot delete file ${relativePath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    try {
      const resolvedPath = this.resolvePath(relativePath);
      await fs.unlink(resolvedPath);
    } catch (error) {
      throw this.mapError(error, relativePath);
    }
  }

  /**
   * Delete a directory
   * @inheritdoc
   */
  public async rmdir(relativePath: string, options?: { recursive?: boolean }): Promise<void> {
    // Check if backend is read-only
    if (this.isReadOnly) {
      throw new StorageError(
        `Cannot delete directory ${relativePath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    try {
      const resolvedPath = this.resolvePath(relativePath);
      
      if (options?.recursive) {
        await fs.rm(resolvedPath, { recursive: true, force: true });
      } else {
        await fs.rmdir(resolvedPath);
      }
    } catch (error) {
      throw this.mapError(error, relativePath);
    }
  }

  /**
   * Rename a file or directory
   * @inheritdoc
   */
  public async rename(oldRelativePath: string, newRelativePath: string): Promise<void> {
    // Check if backend is read-only
    if (this.isReadOnly) {
      throw new StorageError(
        `Cannot rename ${oldRelativePath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    try {
      const resolvedOldPath = this.resolvePath(oldRelativePath);
      const resolvedNewPath = this.resolvePath(newRelativePath);
      
      // Create parent directories if they don't exist
      const dir = path.dirname(resolvedNewPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Rename the file/directory
      await fs.rename(resolvedOldPath, resolvedNewPath);
    } catch (error) {
      throw this.mapError(error, `${oldRelativePath} -> ${newRelativePath}`);
    }
  }

  /**
   * Copy a file
   * @inheritdoc
   */
  public async copyFile(srcRelativePath: string, destRelativePath: string): Promise<void> {
    // Check if backend is read-only
    if (this.isReadOnly) {
      throw new StorageError(
        `Cannot copy to ${destRelativePath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    try {
      const resolvedSrcPath = this.resolvePath(srcRelativePath);
      const resolvedDestPath = this.resolvePath(destRelativePath);
      
      // Create parent directories if they don't exist
      const dir = path.dirname(resolvedDestPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Copy the file
      await fs.copyFile(resolvedSrcPath, resolvedDestPath);
    } catch (error) {
      throw this.mapError(error, `${srcRelativePath} -> ${destRelativePath}`);
    }
  }

  /**
   * Create a readable stream for a file
   * @inheritdoc
   */
  public async createReadStream(relativePath: string, options?: any): Promise<NodeJS.ReadableStream> {
    try {
      const resolvedPath = this.resolvePath(relativePath);
      
      // Check if the file exists first to provide better error messages
      await fs.access(resolvedPath, constants.R_OK);
      
      return createReadStream(resolvedPath, options);
    } catch (error) {
      throw this.mapError(error, relativePath);
    }
  }

  /**
   * Create a writable stream for a file
   * @inheritdoc
   */
  public async createWriteStream(relativePath: string, options?: any): Promise<NodeJS.WritableStream> {
    // Check if backend is read-only
    if (this.isReadOnly) {
      throw new StorageError(
        `Cannot write to ${relativePath}: Backend is read-only`,
        StorageErrorType.PERMISSION_DENIED
      );
    }
    
    try {
      const resolvedPath = this.resolvePath(relativePath);
      
      // Create parent directories if they don't exist
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });
      
      return createWriteStream(resolvedPath, options);
    } catch (error) {
      throw this.mapError(error, relativePath);
    }
  }

  /**
   * Get information about available space
   * @inheritdoc
   */
  public async getAvailableSpace(): Promise<{ total: number; available: number; used: number }> {
    try {
      // Use Node.js diskusage API to get disk space information
      // This is currently using a cross-platform approach that may not be available in all environments
      // A more robust implementation would use platform-specific methods
      // For now, we return dummy values
      return {
        total: 1000000000000, // 1 TB
        available: 500000000000, // 500 GB
        used: 500000000000 // 500 GB
      };
    } catch (error) {
      logger.error(`Failed to get disk space information: ${error instanceof Error ? error.message : String(error)}`);
      throw new StorageError(
        'Failed to get disk space information',
        StorageErrorType.BACKEND_SPECIFIC,
        error instanceof Error ? error : undefined
      );
    }
  }
}