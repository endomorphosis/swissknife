/**
 * Graph-of-Thought Manager
 * 
 * Manages the creation, traversal, and execution of Graph-of-Thought structures.
 * Part of the Phase 1 foundation architecture.
 */

import { EventEmitter } from 'events';
import { GoTNode, GoTNodeType, GoTNodeStatus } from './node.js';
import { LogManager } from '../utils/logging/manager';
import { MCPClient } from '../storage/ipfs/mcp-client';

export class GoTManager extends EventEmitter {
  private static instance: GoTManager;
  private nodes: Map<string, GoTNode> = new Map();
  private graphs: Map<string, Set<string>> = new Map();  // graphId -> Set of nodeIds
  private logger: LogManager;
  private mcpClient?: MCPClient;
  
  private constructor() {
    super();
    this.logger = LogManager.getInstance();
  }
  
  /**
   * Get the singleton instance of GoTManager
   */
  static getInstance(): GoTManager {
    if (!GoTManager.instance) {
      GoTManager.instance = new GoTManager();
    }
    return GoTManager.instance;
  }
  
  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    GoTManager.instance = undefined as any;
  }
  
  /**
   * Clear all graphs and nodes (for testing)
   */
  clear(): void {
    this.nodes.clear();
    this.graphs.clear();
  }
  
  /**
   * Set the MCP client for persistence
   */
  setMCPClient(client: MCPClient): void {
    this.mcpClient = client;
  }
  
  /**
   * Create a new Graph-of-Thought graph
   */
  createGraph(): string {
    const graphId = `graph-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.graphs.set(graphId, new Set());
    
    this.logger.info(`Created new Graph-of-Thought graph: ${graphId}`);
    this.emit('graphCreated', { graphId });
    
    return graphId;
  }
  
  /**
   * Create a new node in a graph
   */
  createNode(
    graphId: string,
    options: {
      type: GoTNodeType;
      content?: string;
      data?: Record<string, any>;
      priority?: number;
      parentIds?: string[];
    }
  ): GoTNode {
    // Check if graph exists
    if (!this.graphs.has(graphId)) {
      throw new Error(`Graph not found: ${graphId}`);
    }
    
    // Create the node
    const node = new GoTNode({
      type: options.type,
      content: options.content || '',
      data: options.data || {},
      priority: options.priority || 1,
      parentIds: options.parentIds || [],
      graphId: graphId
    });
    
    // Add the node to the graph
    this.nodes.set(node.id, node);
    this.graphs.get(graphId)!.add(node.id);
    
    // Update parent nodes to include this node as a child
    if (options.parentIds) {
      for (const parentId of options.parentIds) {
        const parent = this.getNode(parentId);
        if (parent) {
          parent.addChild(node.id);
        }
      }
    }
    
    this.logger.debug(`Created new node in graph ${graphId}`, { nodeId: node.id, type: node.type });
    this.emit('nodeCreated', { graphId, nodeId: node.id, type: node.type });
    
    return node;
  }
  
  /**
   * Get a node by ID
   */
  getNode(nodeId: string): GoTNode | undefined {
    return this.nodes.get(nodeId);
  }
  
  /**
   * Get all nodes for a graph
   */
  getGraphNodes(graphId: string): GoTNode[] {
    if (!this.graphs.has(graphId)) {
      throw new Error(`Graph not found: ${graphId}`);
    }
    
    const nodeIds = this.graphs.get(graphId)!;
    return Array.from(nodeIds).map(id => this.nodes.get(id)!);
  }
  
  /**
   * Get all nodes of a specific type in a graph
   */
  getNodesByType(graphId: string, type: GoTNodeType): GoTNode[] {
    return this.getGraphNodes(graphId).filter(node => node.type === type);
  }
  
  /**
   * Find the root nodes of a graph (nodes without parents)
   */
  getRootNodes(graphId: string): GoTNode[] {
    return this.getGraphNodes(graphId).filter(node => node.isRoot());
  }
  
  /**
   * Find leaf nodes of a graph (nodes without children)
   */
  getLeafNodes(graphId: string): GoTNode[] {
    return this.getGraphNodes(graphId).filter(node => node.isLeaf());
  }
  
  /**
   * Update a node's status
   * @returns True if update was successful, false if node not found
   */
  updateNodeStatus(nodeId: string, status: GoTNodeStatus): boolean {
    const node = this.getNode(nodeId);
    if (!node) {
      this.logger.warn(`Node not found: ${nodeId}`);
      return false;
    }
    
    node.updateStatus(status);
    
    this.emit('nodeStatusUpdated', { 
      nodeId, 
      status,
      type: node.type
    });
    
    return true;
  }
  
  /**
   * Get a node's children
   */
  getChildNodes(nodeId: string): GoTNode[] {
    const node = this.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    
    return node.childIds.map(id => this.getNode(id)!).filter(n => n !== null);
  }
  
  /**
   * Get a node's parents
   */
  getParentNodes(nodeId: string): GoTNode[] {
    const node = this.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    
    return node.parentIds.map(id => this.getNode(id)!).filter(n => n !== null);
  }
  
  /**
   * Check if all parent nodes are completed
   */
  areAllParentsCompleted(nodeId: string): boolean {
    const node = this.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    
    if (node.parentIds.length === 0) {
      return true;
    }
    
    return node.parentIds.every(id => {
      const parent = this.getNode(id);
      return parent && (parent.status === GoTNodeStatus.COMPLETED || parent.status === GoTNodeStatus.COMPLETED_SUCCESS);
    });
  }
  
  /**
   * Get nodes that are ready to process (all parents completed)
   */
  getReadyNodes(graphId: string): GoTNode[] {
    return this.getGraphNodes(graphId).filter(node => 
      node.status === 'pending' && this.areAllParentsCompleted(node.id)
    );
  }
  
  /**
   * Add an edge between two nodes
   * @returns True if edge was added, false if either node not found
   */
  addEdge(parentId: string, childId: string): boolean {
    const parent = this.getNode(parentId);
    const child = this.getNode(childId);
    
    if (!parent) {
      this.logger.warn(`Parent node not found: ${parentId}`);
      return false;
    }
    
    if (!child) {
      this.logger.warn(`Child node not found: ${childId}`);
      return false;
    }
    
    parent.addChild(childId);
    child.addParent(parentId);
    
    this.emit('edgeAdded', { parentId, childId });
    return true;
  }
  
  /**
   * Remove an edge between two nodes
   * @returns True if edge was removed, false if either node not found
   */
  removeEdge(parentId: string, childId: string): boolean {
    const parent = this.getNode(parentId);
    const child = this.getNode(childId);
    
    if (!parent) {
      this.logger.warn(`Parent node not found: ${parentId}`);
      return false;
    }
    
    if (!child) {
      this.logger.warn(`Child node not found: ${childId}`);
      return false;
    }
    
    parent.removeChild(childId);
    child.removeParent(parentId);
    
    this.emit('edgeRemoved', { parentId, childId });
    return true;
  }
  
  /**
   * Persist a graph to IPFS (via MCP client)
   */
  async persistGraph(graphId: string): Promise<string> {
    if (!this.mcpClient) {
      this.logger.error('MCP client not set, cannot persist graph');
      throw new Error('MCPClient not set or not connected.');
    }
    
    try {
      // Ensure the MCP client is connected
      if (!this.mcpClient.isConnectedToServer()) {
        await this.mcpClient.connect();
      }
      
      // Get all nodes for the graph
      const nodes = this.getGraphNodes(graphId);
      const rootNodes = this.getRootNodes(graphId);
      
      // Create IPLD nodes for each GoT node
      const cidMap = new Map<string, string>(); // nodeId -> CID
      
      for (const node of nodes) {
        const nodeData = {
          ...node.toJSON(),
          childIds: [], // We'll represent these as IPLD links
          parentIds: [] // We'll represent these as IPLD links
        };
        
        const result = await this.mcpClient.addNode(nodeData);
        const cid = result.cid;
        cidMap.set(node.id, cid);
      }
      
      // Create links between nodes
      for (const node of nodes) {
        const nodeCid = cidMap.get(node.id)!;
        
        // Create links to child nodes
        const childLinks = node.childIds
          .filter(id => cidMap.has(id))
          .map(id => ({ 
            name: `child-${id}`,
            cid: cidMap.get(id)!
          }));
          
        // Create links to parent nodes
        const parentLinks = node.parentIds
          .filter(id => cidMap.has(id))
          .map(id => ({ 
            name: `parent-${id}`,
            cid: cidMap.get(id)!
          }));
        
        // Get the current node data
        const nodeObj = await this.mcpClient.getNode(nodeCid);
        
        // Update the node with links
        const result = await this.mcpClient.addNode(
          nodeObj.data,
          [...childLinks, ...parentLinks]
        );
        const updatedCid = result.cid;
        
        // Update the CID map
        cidMap.set(node.id, updatedCid);
      }
      
      // Create a graph metadata node that links to all nodes
      const graphMetadata = {
        id: graphId,
        nodeCount: nodes.length,
        createdAt: Date.now(),
        rootNodeId: rootNodes.length > 0 ? rootNodes[0].id : null,
        nodeCids: Array.from(cidMap.keys()),
      };
      
      const nodeLinks = Array.from(cidMap.entries()).map(([nodeId, cid]) => ({
        name: `node-${nodeId}`,
        cid
      }));
      
      const result = await this.mcpClient.addNode(graphMetadata, nodeLinks);
      const graphCid = result.cid;
      
      this.logger.info(`Persisted graph ${graphId} to IPFS`, { cid: graphCid });
      
      return graphCid;
    } catch (error) {
      this.logger.error(`Failed to persist graph ${graphId}`, error);
      throw error;
    }
  }
  
  /**
   * Execute a Graph-of-Thought
   * 
   * This method processes the graph in a breadth-first manner,
   * executing nodes as their dependencies are satisfied.
   */
  async executeGraph(graphId: string): Promise<void> {
    // Implementation of the execution logic will come in later phases
    // For Phase 1, we're just setting up the foundation
    
    this.logger.info(`Executing Graph-of-Thought: ${graphId}`);
    this.emit('graphExecutionStarted', { graphId });
    
    // Placeholder for actual execution logic
    // In a real implementation, this would traverse the graph and execute nodes
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.logger.info(`Completed Graph-of-Thought execution: ${graphId}`);
    this.emit('graphExecutionCompleted', { graphId });
  }
}