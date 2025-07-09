// src/ai/multi-agent/SharedWorkspace.ts
import { CollaborativeDocument, ResourceLock, ChangeEvent, MessageType } from '../../types/ai';
import { v4 as uuidv4 } from 'uuid';
import { CommunicationHub } from './Communication';

export class SharedWorkspace {
  private documents: Map<string, CollaborativeDocument> = new Map();
  private locks: Map<string, ResourceLock> = new Map();
  private changeLog: ChangeEvent[] = [];

  async createSharedDocument(id: string, content: any): Promise<CollaborativeDocument> {
    const doc = new CollaborativeDocument(id, content);
    
    // Set up real-time synchronization
    doc.onEdit(change => this.synchronizeChange(change));
    
    this.documents.set(id, doc);
    return doc;
  }

  async acquireResourceLock(resourceId: string, agentId: string): Promise<ResourceLock> {
    if (this.locks.has(resourceId)) {
      throw new Error(`Resource ${resourceId} is already locked`);
    }
    
    const lock = new ResourceLock(resourceId, agentId, Date.now());
    this.locks.set(resourceId, lock);
    
    // Auto-release lock after timeout
    setTimeout(() => this.releaseLock(resourceId), 30000);
    
    return lock;
  }

  private async synchronizeChange(change: ChangeEvent): Promise<void> {
    // Broadcast change to all participants
    await this.communicationHub.broadcastMessage({
      id: uuidv4(),
      from: 'workspace',
      type: MessageType.BROADCAST,
      channel: 'workspace_changes',
      content: change,
      priority: 1,
      timestamp: Date.now()
    });
    
    this.changeLog.push(change);
  }
}