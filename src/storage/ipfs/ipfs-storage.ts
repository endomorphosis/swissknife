import {
  StorageProvider,
  ListOptions,
  StorageItemMetadata,
} from '../../types/storage.js';
import { CID } from '../../types/common.js'; // Import CID directly from common
import { Task, TaskID } from '../../types/task.js'; 
import { MCPClient } from './mcp-client.js';
import { logger } from '../../utils/logger.js';

/**
 * StorageProvider implementation that uses an MCPClient to interact with an IPFS node.
 */
export class IPFSStorage implements StorageProvider {
  private client: MCPClient;

  constructor(client: MCPClient) {
    this.client = client;
    logger.info('IPFSStorage provider initialized.');
  }

  async add(content: string | Buffer): Promise<CID> {
    logger.debug('IPFSStorage: Calling MCPClient.addContent');
    const result = await this.client.addContent(content);
    return result.cid;
  }

  async get(cid: CID): Promise<Buffer> {
    logger.debug(`IPFSStorage: Calling MCPClient.getContent for CID: ${cid}`);
    return this.client.getContent(cid);
  }

  async list(options?: ListOptions): Promise<CID[]> {
    logger.debug('IPFSStorage: Fetching pin list from handsfree backend');
    try {
      const resp = await fetch('http://localhost:8080/v1/ipfs/list_pins', {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      const pins = data.pins || data.Keys || data || [];
      if (Array.isArray(pins)) return pins.map((p: any) => typeof p === 'string' ? p : p.cid || p.Hash || '');
      if (typeof pins === 'object') return Object.keys(pins);
      return [];
    } catch (e) {
      logger.warn('IPFSStorage: list() fallback - backend unavailable');
      return [];
    }
  }

  async delete(cid: CID): Promise<boolean> {
    logger.debug(`IPFSStorage: Unpinning CID: ${cid} via handsfree backend`);
    try {
      const resp = await fetch('http://localhost:8080/v1/ipfs/unpin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid }),
        signal: AbortSignal.timeout(8000),
      });
      return resp.ok;
    } catch (e) {
      logger.warn(`IPFSStorage: delete() failed for CID: ${cid}`);
      return false;
    }
  }

  async stat(cid: CID): Promise<StorageItemMetadata | null> {
    logger.debug(`IPFSStorage: Stat CID: ${cid} via handsfree backend`);
    try {
      const resp = await fetch(`http://localhost:8080/v1/ipfs/stat?cid=${encodeURIComponent(cid)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return {
        cid,
        size: data.CumulativeSize || data.size || 0,
        type: data.Type || 'unknown',
        ...data,
      } as StorageItemMetadata;
    } catch (e) {
      logger.warn(`IPFSStorage: stat() failed for CID: ${cid}`);
      return null;
    }
  }

  // --- Task Methods ---
  // These rely on how tasks are stored (e.g., as JSON objects added via addContent)
  // or if the MCP server has dedicated task endpoints. Assuming JSON objects for now.

  async storeTask(task: Task): Promise<void> {
     if (!task.id) throw new Error('Task must have an ID to be stored.');
     logger.debug(`IPFSStorage: Storing task ${task.id} by adding its JSON representation.`);
     // Store task object as JSON content. Use a predictable prefix/path convention if possible.
     // Consider using task.id as part of the storage key/identifier if not relying solely on CID.
     await this.add(JSON.stringify(task)); 
     // Note: This simple approach doesn't allow easy retrieval by TaskID without indexing.
     // A dedicated MCP endpoint or an indexing mechanism would be better.
  }

  async getTask(taskId: TaskID): Promise<Task | null> {
    logger.warn(`IPFSStorage: getTask(${taskId}) is not efficiently implemented. Requires searching/indexing or dedicated MCP endpoint.`);
    // This is inefficient: requires listing/getting all potential task CIDs and parsing.
    // Placeholder - needs a proper implementation strategy (e.g., index, dedicated endpoint).
    return null; 
  }

  async updateTask(task: Task): Promise<void> {
     if (!task.id) throw new Error('Task must have an ID to be updated.');
     logger.warn(`IPFSStorage: updateTask(${task.id}) requires deleting old CID and adding new. Inefficient.`);
     // This is also inefficient with simple CID storage. Requires finding the old CID, deleting, adding new.
     // Placeholder - needs a proper implementation strategy.
     await this.storeTask(task); // Overwrite/add new version (doesn't remove old one)
  }

  async listTasks(filter?: any): Promise<Task[]> {
    logger.warn('IPFSStorage: listTasks() is not efficiently implemented. Requires searching/indexing or dedicated MCP endpoint.');
    // Inefficient: requires listing/getting many CIDs and parsing.
    // Placeholder - needs a proper implementation strategy.
    return [];
  }
}
