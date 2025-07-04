// src/ai/thinking/graph.ts
import { v4 as uuidv4 } from 'uuid'; // Assuming uuid is installed
import { GoTNodeType, GoTNodeStatus } from '../tasks/graph/node'; // Unified enums

// NodeType and NodeStatus enums are now imported from types/task.js

export interface ThoughtNode {
  id: string;
  content: string;
  type: GoTNodeType; // Unified
  children: string[];
  parents: string[]; // Added for Phase 3 (DAGs, explicit parent tracking)
  status: GoTNodeStatus; // Unified
  result?: any;
  contentCid?: string; // For IPFS/IPLD integration (Phase 3)
  resultCid?: string;  // For IPFS/IPLD integration (Phase 3)
  error?: string; // For FAILED status
  metadata?: Record<string, any>; // Added for Phase 3
  createdAt: number; // Added for tracking
  updatedAt: number; // Added for tracking
}

export interface SerializedThoughtGraph {
  nodes: ThoughtNode[];
  rootId: string | null;
}

export class ThoughtGraph {
  private nodes: Map<string, ThoughtNode> = new Map();
  private rootId: string | null = null;

  constructor(rootId?: string, nodes?: ThoughtNode[]) {
    if (nodes) {
      nodes.forEach(node => this.nodes.set(node.id, { ...node }));
    }
    if (rootId) {
      this.rootId = rootId;
    }
  }

  addNode(
    content: string,
    type: GoTNodeType, // Unified
    metadata?: Record<string, any>,
    id?: string
  ): ThoughtNode {
    const nodeId = id || uuidv4();
    const now = Date.now(); // Fixed typo
    const node: ThoughtNode = {
      id: nodeId,
      content,
      type,
      children: [],
          parents: [],
          status: GoTNodeStatus.PENDING, // Unified
          // contentCid and resultCid will be set if/when content/result is stored in IPFS
          metadata: metadata || {},
          createdAt: now,
          updatedAt: now,
    };

    if (this.nodes.has(nodeId)) {
      throw new Error(`Node with id ${nodeId} already exists.`);
    }
    this.nodes.set(nodeId, node);

    if (!this.rootId && this.nodes.size === 1) {
      this.rootId = nodeId;
    }
    return { ...node };
  }

  getNode(id: string): ThoughtNode | undefined {
    const node = this.nodes.get(id);
    return node ? { ...node } : undefined;
  }

  updateNode(id: string, updates: Partial<Omit<ThoughtNode, 'id' | 'createdAt'>>): ThoughtNode | undefined {
    const node = this.nodes.get(id);
    if (!node) {
      return undefined;
    }
    const updatedNode = { ...node, ...updates, updatedAt: Date.now() };
    this.nodes.set(id, updatedNode);
    return { ...updatedNode };
  }

  getRoot(): ThoughtNode | null {
    return this.rootId ? this.getNode(this.rootId) || null : null;
  }

  setRoot(nodeId: string): boolean {
    if (!this.nodes.has(nodeId)) {
      return false;
    }
    this.rootId = nodeId;
    return true;
  }

  addChild(parentId: string, childId: string): boolean {
    const parentNode = this.nodes.get(parentId);
    const childNode = this.nodes.get(childId);

    if (!parentNode || !childNode) {
      return false; // Or throw error
    }

    if (!parentNode.children.includes(childId)) {
      parentNode.children.push(childId);
      parentNode.updatedAt = Date.now();
    }
    if (!childNode.parents.includes(parentId)) {
      childNode.parents.push(parentId);
      childNode.updatedAt = Date.now();
    }
    // Note: Cycle detection could be added here for proactive DAG maintenance
    return true;
  }

  removeChild(parentId: string, childId: string): boolean {
    const parentNode = this.nodes.get(parentId);
    const childNode = this.nodes.get(childId);
    let changed = false;

    if (parentNode && parentNode.children.includes(childId)) {
      parentNode.children = parentNode.children.filter(c => c !== childId);
      parentNode.updatedAt = Date.now();
      changed = true;
    }
    if (childNode && childNode.parents.includes(parentId)) {
      childNode.parents = childNode.parents.filter(p => p !== parentId);
      childNode.updatedAt = Date.now();
      changed = true;
    }
    return changed;
  }

  removeNode(nodeId: string): boolean {
    const nodeToRemove = this.nodes.get(nodeId);
    if (!nodeToRemove) {
      return false;
    }

    // Remove edges connecting to this node
    nodeToRemove.parents.forEach(parentId => {
      const parentNode = this.nodes.get(parentId);
      if (parentNode) {
        parentNode.children = parentNode.children.filter(c => c !== nodeId);
        parentNode.updatedAt = Date.now();
      }
    });
    nodeToRemove.children.forEach(childId => {
      const childNode = this.nodes.get(childId);
      if (childNode) {
        childNode.parents = childNode.parents.filter(p => p !== nodeId);
        childNode.updatedAt = Date.now();
      }
    });

    this.nodes.delete(nodeId);

    if (this.rootId === nodeId) {
      this.rootId = this.nodes.size > 0 ? (this.nodes.keys().next().value || null) : null;
    }
    return true;
  }
  
  getAllNodes(): ThoughtNode[] {
    return Array.from(this.nodes.values()).map(node => ({ ...node }));
  }

  isAcyclic(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const childId of node.children) {
          if (!visited.has(childId)) {
            if (!dfs(childId)) return false; // Cycle detected
          } else if (recursionStack.has(childId)) {
            return false; // Cycle detected
          }
        }
      }

      recursionStack.delete(nodeId);
      return true;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (!dfs(nodeId)) return false;
      }
    }
    return true;
  }

  topologicalSort(): ThoughtNode[] | null {
    if (!this.isAcyclic()) {
      return null; // Cannot sort a cyclic graph
    }

    const sorted: ThoughtNode[] = [];
    const inDegree = new Map<string, number>();
    const queue: string[] = [];

    this.nodes.forEach(node => {
      inDegree.set(node.id, node.parents.length);
      if (node.parents.length === 0) {
        queue.push(node.id);
      }
    });

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = this.nodes.get(nodeId);
      if (node) {
        sorted.push({ ...node });
        node.children.forEach(childId => {
          const currentInDegree = (inDegree.get(childId) || 0) - 1;
          inDegree.set(childId, currentInDegree);
          if (currentInDegree === 0) {
            queue.push(childId);
          }
        });
      }
    }
    
    // If sorted.length !== this.nodes.size, there was a cycle,
    // but isAcyclic() should have caught it. This is a safeguard.
    return sorted.length === this.nodes.size ? sorted : null;
  }

  // Basic DFS traversal from a given start node or root
  traverse(
    visitor: (node: ThoughtNode, depth: number) => void,
    startNodeId?: string
  ): void {
    const root = startNodeId || this.rootId;
    if (!root) return;

    const visited = new Set<string>();
    const visit = (nodeId: string, depth: number) => {
      if (visited.has(nodeId)) return;
      const node = this.nodes.get(nodeId);
      if (!node) return;

      visited.add(nodeId);
      visitor({ ...node }, depth);

      for (const childId of node.children) {
        visit(childId, depth + 1);
      }
    };
    visit(root, 0);
  }

  setNodeResult(nodeId: string, result: any): ThoughtNode | undefined {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return undefined;
    }
    node.result = result;
    node.status = GoTNodeStatus.COMPLETED; // Unified
    node.error = undefined; // Clear error on successful completion
    node.updatedAt = Date.now();
    return { ...node };
  }

  setNodeStatus(nodeId: string, status: GoTNodeStatus, error?: string): ThoughtNode | undefined { // Unified
    const node = this.nodes.get(nodeId);
    if (!node) {
      return undefined;
    }
    node.status = status; // Unified
    node.updatedAt = Date.now();
    if (status === GoTNodeStatus.FAILED) { // Unified
      node.error = error;
    } else if (status === GoTNodeStatus.COMPLETED) { // Unified
      node.error = undefined; // Clear error if manually set to completed
    }
    return { ...node };
  }

  // --- IPLD-related representation methods ---

  /**
   * Returns a plain JavaScript object representation of the graph,
   * suitable for serialization (e.g., to JSON, or as a step before IPLD encoding).
   */
  toIpldRepresentation(): SerializedThoughtGraph {
    return {
      nodes: Array.from(this.nodes.values()), // Stores copies
      rootId: this.rootId,
    };
  }

  /**
   * Creates a ThoughtGraph instance from a plain JavaScript object representation.
   */
  static fromIpldRepresentation(data: SerializedThoughtGraph): ThoughtGraph {
    const graph = new ThoughtGraph();
    if (data.nodes) {
      data.nodes.forEach(nodeData => {
        // Ensure all fields are present, providing defaults if necessary
        const node: ThoughtNode = {
          id: nodeData.id,
          content: nodeData.content,
          type: nodeData.type as GoTNodeType, // Cast to GoTNodeType
          children: nodeData.children || [],
          parents: nodeData.parents || [],
          status: nodeData.status as GoTNodeStatus || GoTNodeStatus.PENDING, // Unified
          result: nodeData.result,
          contentCid: nodeData.contentCid,
          resultCid: nodeData.resultCid,
          error: nodeData.error,
          metadata: nodeData.metadata || {},
          createdAt: nodeData.createdAt || Date.now(),
          updatedAt: nodeData.updatedAt || Date.now(),
        };
        graph.nodes.set(node.id, node);
      });
    }
    graph.rootId = data.rootId || null;
    // Validate rootId exists if provided
    if (graph.rootId && !graph.nodes.has(graph.rootId)) {
        console.warn(`Root ID ${graph.rootId} not found in nodes. Resetting rootId.`);
        graph.rootId = graph.nodes.size > 0 ? (graph.nodes.keys().next().value || null) : null;
    } else if (!graph.rootId && graph.nodes.size > 0) {
        // If no rootId but nodes exist, pick the first one.
        graph.rootId = graph.nodes.keys().next().value || null;
    }
    return graph;
  }
}
