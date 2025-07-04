import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  StorageProvider,
  ListOptions,
  StorageItemMetadata,
} from '../types/storage';
import { CID, TaskID } from '../types/common'; // Import TaskID from common.js
import { Task } from '../types/task'; // Keep Task import
import { ConfigManager } from '../config/manager';
import { logger } from '../utils/logger';

/**
 * StorageProvider implementation using the local filesystem.
 * Note: Uses file paths as pseudo-CIDs for simplicity in this example.
 * A more robust implementation might use content hashing for CIDs.
 */
export class LocalStorage implements StorageProvider {
  private storagePath: string;
  private taskStoragePath: string; // Separate directory for tasks

  constructor() {
    const config = ConfigManager.getInstance();
    // Default to ~/.swissknife/storage if not specified in config
    this.storagePath = config.get('storage.localPath') || path.join(os.homedir(), '.swissknife', 'storage', 'data');
    this.taskStoragePath = path.join(os.homedir(), '.swissknife', 'storage', 'tasks');
    
    logger.info(`LocalStorage provider initialized. Data path: ${this.storagePath}, Task path: ${this.taskStoragePath}`);
    this.ensureDirExists(this.storagePath);
    this.ensureDirExists(this.taskStoragePath);
  }

  private async ensureDirExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error: any) {
      // Ignore EEXIST error (directory already exists)
      if (error.code !== 'EEXIST') {
        logger.error(`Failed to create storage directory: ${dirPath}`, error);
        throw error; // Rethrow other errors
      }
    }
  }

  // Simple pseudo-CID generation based on content hash (SHA256)
  private generatePseudoCid(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private getFilePath(cid: CID): string {
    // Basic path structure, could be nested for large numbers of files
    return path.join(this.storagePath, cid);
  }
  
  private getTaskFilePath(taskId: TaskID): string {
     return path.join(this.taskStoragePath, `${taskId}.json`);
  }

  async add(content: string | Buffer): Promise<CID> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const cid = this.generatePseudoCid(buffer);
    const filePath = this.getFilePath(cid);

    try {
      logger.debug(`LocalStorage: Writing content to ${filePath}`);
      await fs.writeFile(filePath, buffer);
      logger.info(`LocalStorage: Content added successfully. Pseudo-CID: ${cid}`);
      return cid;
    } catch (error: any) {
      logger.error(`LocalStorage: Error writing file ${filePath}`, error);
      throw new Error(`Failed to add content to local storage: ${error.message}`);
    }
  }

  async get(cid: CID): Promise<Buffer> {
    const filePath = this.getFilePath(cid);
    try {
      logger.debug(`LocalStorage: Reading content from ${filePath}`);
      const buffer = await fs.readFile(filePath);
      logger.info(`LocalStorage: Content retrieved successfully for pseudo-CID: ${cid}`);
      return buffer;
    } catch (error: any) {
      logger.error(`LocalStorage: Error reading file ${filePath}`, error);
      if (error.code === 'ENOENT') {
        throw new Error(`Content not found for pseudo-CID ${cid}`);
      }
      throw new Error(`Failed to get content from local storage: ${error.message}`);
    }
  }

  async list(options?: ListOptions): Promise<CID[]> {
     logger.debug('LocalStorage: Listing files (pseudo-CIDs)...', options);
     // Note: This lists filenames which are pseudo-CIDs in this implementation
     try {
        let files = await fs.readdir(this.storagePath);
        // Basic filtering (can be expanded)
        if (options?.prefix) {
            files = files.filter(f => f.startsWith(options.prefix!));
        }
        if (options?.limit) {
            files = files.slice(options.offset || 0, (options.offset || 0) + options.limit);
        }
        return files;
     } catch (error: any) {
        logger.error('LocalStorage: Error listing storage directory:', error);
        return [];
     }
  }

  async delete(cid: CID): Promise<boolean> {
    const filePath = this.getFilePath(cid);
    try {
      logger.debug(`LocalStorage: Deleting file ${filePath}`);
      await fs.unlink(filePath);
      logger.info(`LocalStorage: Deleted file successfully for pseudo-CID: ${cid}`);
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.warn(`LocalStorage: File not found for deletion, pseudo-CID: ${cid}`);
        return false; // File didn't exist, arguably not an error
      }
      logger.error(`LocalStorage: Error deleting file ${filePath}`, error);
      throw new Error(`Failed to delete content from local storage: ${error.message}`);
    }
  }

  async stat(cid: CID): Promise<StorageItemMetadata | null> {
     const filePath = this.getFilePath(cid);
     try {
        const stats = await fs.stat(filePath);
        return {
            cid: cid,
            size: stats.size,
            createdAt: stats.birthtime, // Use birthtime as creation time
        };
     } catch (error: any) {
        if (error.code === 'ENOENT') {
            return null; // File not found
        }
        logger.error(`LocalStorage: Error getting stats for file ${filePath}`, error);
        throw new Error(`Failed to get stats from local storage: ${error.message}`);
     }
  }

  // --- Task Methods ---

  async storeTask(task: Task): Promise<void> {
    if (!task.id) throw new Error('Task must have an ID to be stored.');
    const filePath = this.getTaskFilePath(task.id);
    try {
      logger.debug(`LocalStorage: Writing task ${task.id} to ${filePath}`);
      await fs.writeFile(filePath, JSON.stringify(task, null, 2)); // Pretty print JSON
      logger.info(`LocalStorage: Task ${task.id} stored successfully.`);
    } catch (error: any) {
      logger.error(`LocalStorage: Error writing task file ${filePath}`, error);
      throw new Error(`Failed to store task to local storage: ${error.message}`);
    }
  }

  async getTask(taskId: TaskID): Promise<Task | null> {
    const filePath = this.getTaskFilePath(taskId);
    try {
      logger.debug(`LocalStorage: Reading task ${taskId} from ${filePath}`);
      const buffer = await fs.readFile(filePath);
      const task = JSON.parse(buffer.toString('utf-8')) as Task;
      logger.info(`LocalStorage: Task ${taskId} retrieved successfully.`);
      return task;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.warn(`LocalStorage: Task file not found: ${filePath}`);
        return null;
      }
      logger.error(`LocalStorage: Error reading or parsing task file ${filePath}`, error);
      throw new Error(`Failed to get task from local storage: ${error.message}`);
    }
  }

  async updateTask(task: Task): Promise<void> {
     // For local storage, updating is the same as storing (overwriting)
     await this.storeTask(task);
  }

  async listTasks(filter?: any): Promise<Task[]> {
     logger.debug('LocalStorage: Listing task files...', filter);
     // Basic implementation, filtering can be added
     try {
        const files = await fs.readdir(this.taskStoragePath);
        const taskPromises = files
            .filter(f => f.endsWith('.json'))
            .map(f => this.getTask(path.basename(f, '.json'))); // Extract ID from filename
        
        const tasks = (await Promise.all(taskPromises)).filter(t => t !== null) as Task[];
        // TODO: Apply filter if provided
        return tasks;
     } catch (error: any) {
        logger.error('LocalStorage: Error listing task directory:', error);
        return [];
     }
  }
}
