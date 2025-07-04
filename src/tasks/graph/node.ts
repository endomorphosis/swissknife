/**
 * Graph-of-Thought Node implementation
 * 
 * This module provides the node implementation for the Graph-of-Thought system,
 * which represents individual pieces of a reasoning process.
 */

import { v4 as uuidv4 } from 'uuid';

// Node type enum
export enum GoTNodeType {
  QUESTION = 'question',
  TASK = 'task',
  RESEARCH = 'research',
  ANALYSIS = 'analysis',
  ANSWER = 'answer',
  ERROR = 'error',
  INTERMEDIATE = 'intermediate',
  HYPOTHESIS = 'hypothesis',
  SYNTHESIS = 'synthesis',
  THOUGHT = 'thought',
  DECISION = 'decision',
  ACTION = 'action',
  RESULT = 'result'
}

// Node status enum
export enum GoTNodeStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BLOCKED = 'blocked',
  IN_PROGRESS = 'in_progress',
  COMPLETED_SUCCESS = 'completed_success'
}

// Node data interface
export interface GoTNodeData {
  source?: string;
  assignedTo?: string;
  timestamp?: number;
  priority?: number;
  requiresAllParents?: boolean;
  [key: string]: any;
}

// Node creation options
export interface GoTNodeOptions {
  id?: string;
  graphId?: string;
  type: GoTNodeType;
  content?: string;
  parentIds?: string[];
  childIds?: string[];
  data?: GoTNodeData;
  status?: GoTNodeStatus;
  priority?: number;
  createdAt?: number;
  updatedAt?: number;
  completedAt?: number;
}

/**
 * Graph-of-Thought Node
 * 
 * Represents a node in the reasoning graph, which can be a question, task,
 * analysis, or answer.
 */
export class GoTNode {
  // Core properties
  public id: string;
  public graphId?: string;
  public type: GoTNodeType;
  public content: string;
  public status: GoTNodeStatus;
  public data: GoTNodeData;
  public priority: number;
  
  // Timestamps
  public createdAt: number;
  public updatedAt: number;
  public completedAt?: number;
  
  // Relationships
  private _parentIds: Set<string>;
  private _childIds: Set<string>;
  
  // Results
  public result?: any;
  public error?: string;
  
  /**
   * Create a new GoT node
   * 
   * @param options Node creation options
   */
  constructor(options: GoTNodeOptions) {
    this.id = options.id || uuidv4();
    this.graphId = options.graphId;
    this.type = options.type;
    this.content = options.content || '';
    this.status = options.status || GoTNodeStatus.PENDING;
    this.data = options.data || {};
    this.priority = options.priority || 1;
    
    // Initialize timestamps
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || this.createdAt;
    this.completedAt = options.completedAt;
    
    // Initialize relationships
    this._parentIds = new Set(options.parentIds || []);
    this._childIds = new Set(options.childIds || []);
  }

  // Getters for parentIds and childIds as arrays to match test expectations
  get parentIds(): string[] {
    return Array.from(this._parentIds);
  }

  get childIds(): string[] {
    return Array.from(this._childIds);
  }
  
  /**
   * Update the status of the node
   * 
   * @param status New status
   * @param error Optional error message for failed status
   */
  updateStatus(status: GoTNodeStatus, error?: string): void {
    // Don't update timestamps if status hasn't changed
    if (this.status === status) {
      return;
    }
    
    this.status = status;
    this.updatedAt = Date.now();
    
    if (status === GoTNodeStatus.COMPLETED || status === GoTNodeStatus.COMPLETED_SUCCESS) {
      this.completedAt = this.updatedAt;
    } else if (status === GoTNodeStatus.FAILED && error) {
      this.error = error;
    }
  }
  
  /**
   * Update the content of the node
   * 
   * @param content New content
   */
  updateContent(content: string): void {
    this.content = content;
    this.updatedAt = Date.now();
  }
  
  /**
   * Set the result of the node
   * 
   * @param result Node result
   */
  setResult(result: any): void {
    this.result = result;
    this.updatedAt = Date.now();
    
    // Automatically update status to completed if not already
    if (this.status !== GoTNodeStatus.COMPLETED && this.status !== GoTNodeStatus.COMPLETED_SUCCESS) {
      this.status = GoTNodeStatus.COMPLETED;
      this.completedAt = this.updatedAt;
    }
  }
  
  /**
   * Add a parent node ID
   * 
   * @param parentId Parent node ID
   */
  addParent(parentId: string): void {
    this._parentIds.add(parentId);
    this.updatedAt = Date.now();
  }
  
  /**
   * Remove a parent node ID
   * 
   * @param parentId Parent node ID
   */
  removeParent(parentId: string): void {
    this._parentIds.delete(parentId);
    this.updatedAt = Date.now();
  }
  
  /**
   * Add a child node ID
   * 
   * @param childId Child node ID
   */
  addChild(childId: string): void {
    this._childIds.add(childId);
    this.updatedAt = Date.now();
  }
  
  /**
   * Remove a child node ID
   * 
   * @param childId Child node ID
   */
  removeChild(childId: string): void {
    this._childIds.delete(childId);
    this.updatedAt = Date.now();
  }
  
  /**
   * Check if the node is blocked by any parents
   * 
   * @returns True if blocked, false otherwise
   */
  isBlocked(): boolean {
    return this.status === GoTNodeStatus.BLOCKED;
  }
  
  /**
   * Check if the node is completed
   * 
   * @returns True if completed, false otherwise
   */
  isCompleted(): boolean {
    return this.status === GoTNodeStatus.COMPLETED || this.status === GoTNodeStatus.COMPLETED_SUCCESS;
  }
  
  /**
   * Check if the node is a root node (has no parents)
   * 
   * @returns True if root, false otherwise
   */
  isRoot(): boolean {
    return this._parentIds.size === 0;
  }
  
  /**
   * Check if the node is a leaf node (has no children)
   * 
   * @returns True if leaf, false otherwise
   */
  isLeaf(): boolean {
    return this._childIds.size === 0;
  }
  
  /**
   * Update node data
   * 
   * @param data New data to merge
   */
  updateData(data: Partial<GoTNodeData>): void {
    this.data = {
      ...this.data,
      ...data
    };
    this.updatedAt = Date.now();
  }
  
  /**
   * Serialize the node to a plain object
   * 
   * @returns Serialized node
   */
  serialize(): Record<string, any> {
    return {
      id: this.id,
      graphId: this.graphId,
      type: this.type,
      content: this.content,
      status: this.status,
      data: this.data,
      priority: this.priority,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      parentIds: this.parentIds,
      childIds: this.childIds,
      result: this.result,
      error: this.error
    };
  }
  
  /**
   * Convert the node to JSON (alias for serialize)
   * 
   * @returns JSON representation of the node
   */
  toJSON(): Record<string, any> {
    return this.serialize();
  }
  
  /**
   * Create a node from a serialized object
   * 
   * @param obj Serialized node
   * @returns Deserialized node
   */
  static deserialize(obj: Record<string, any>): GoTNode {
    const node = new GoTNode({
      id: obj.id,
      graphId: obj.graphId,
      type: obj.type as GoTNodeType,
      content: obj.content,
      status: obj.status as GoTNodeStatus,
      data: obj.data,
      priority: obj.priority,
      parentIds: obj.parentIds,
      childIds: obj.childIds,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      completedAt: obj.completedAt
    });
    
    node.result = obj.result;
    node.error = obj.error;
    
    return node;
  }
  
  /**
   * Create a node from JSON (alias for deserialize)
   * 
   * @param json JSON representation of the node
   * @returns Deserialized node
   */
  static fromJSON(json: Record<string, any>): GoTNode {
    return GoTNode.deserialize(json);
  }
}
