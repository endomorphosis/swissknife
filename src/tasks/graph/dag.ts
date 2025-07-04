import { logger } from '../utils/logger';

// Generic Node type constraint (must have an 'id' property)
type NodeWithId = { id: string };

/**
 * Represents a node within the DAG, storing the actual data
 * and adjacency information (outgoing edges).
 */
class DagNode<T extends NodeWithId> {
  id: string;
  data: T;
  successors = new Set<string>(); // IDs of nodes this node points to
  predecessors = new Set<string>(); // IDs of nodes pointing to this node

  constructor(data: T) {
    this.id = data.id;
    this.data = data;
  }
}

/**
 * Basic implementation of a Directed Acyclic Graph (DAG).
 * Stores nodes and their relationships.
 */
export class DirectedAcyclicGraph<T extends NodeWithId> {
  private nodes = new Map<string, DagNode<T>>();
  private edgeCount = 0;

  constructor() {
    logger.debug('Initializing DirectedAcyclicGraph...');
  }

  /**
   * Adds a node to the graph.
   * @param nodeData The data for the node (must include an 'id').
   * @returns True if the node was added, false if a node with the same ID already exists.
   */
  addNode(nodeData: T): boolean {
    if (this.nodes.has(nodeData.id)) {
      logger.warn(`[DAG] Node with ID ${nodeData.id} already exists.`);
      return false;
    }
    const newNode = new DagNode(nodeData);
    this.nodes.set(nodeData.id, newNode);
    logger.debug(`[DAG] Added node: ${nodeData.id}`);
    return true;
  }

  /**
   * Adds a directed edge between two nodes.
   * @param fromId The ID of the source node.
   * @param toId The ID of the target node.
   * @returns True if the edge was added, false if nodes don't exist or edge already exists.
   * @throws Error if adding the edge would create a cycle.
   */
  addEdge(fromId: string, toId: string): boolean {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);

    if (!fromNode || !toNode) {
      logger.error(`[DAG] Cannot add edge: Node ${!fromNode ? fromId : toId} not found.`);
      return false;
    }

    if (fromNode.successors.has(toId)) {
      logger.warn(`[DAG] Edge from ${fromId} to ${toId} already exists.`);
      return false; // Edge already exists
    }

    // Check for cycles before adding the edge
    if (this.wouldCreateCycle(fromId, toId)) {
      logger.error(`[DAG] Adding edge from ${fromId} to ${toId} would create a cycle.`);
      throw new Error(`Adding edge from ${fromId} to ${toId} would create a cycle in the DAG.`);
    }

    fromNode.successors.add(toId);
    toNode.predecessors.add(fromId);
    logger.debug(`[DAG] Added edge from ${fromId} to ${toId}`);
    return true;
  }

  /**
   * Retrieves a node's data by its ID.
   * @param nodeId The ID of the node to retrieve.
   * @returns The node data, or undefined if not found.
   */
  getNode(nodeId: string): T | undefined {
    return this.nodes.get(nodeId)?.data;
  }
  
  /**
   * Checks if a node exists in the graph.
   * @param nodeId The ID of the node to check.
   * @returns True if the node exists, false otherwise.
   */
  hasNode(nodeId: string): boolean {
    return this.nodes.has(nodeId);
  }

  /**
   * Gets the IDs of the successor nodes for a given node.
   * @param nodeId The ID of the node.
   * @returns A Set of successor node IDs, or undefined if the node doesn't exist.
   */
  getSuccessors(nodeId: string): Set<string> | undefined {
     return this.nodes.get(nodeId)?.successors;
  }

  /**
   * Gets the IDs of the predecessor nodes for a given node.
   * @param nodeId The ID of the node.
   * @returns A Set of predecessor node IDs, or undefined if the node doesn't exist.
   */
  getPredecessors(nodeId: string): Set<string> | undefined {
     return this.nodes.get(nodeId)?.predecessors;
  }

  /**
   * Returns the total number of nodes in the graph.
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Returns the total number of edges in the graph.
   */
  getEdgeCount(): number {
    let count = 0;
    for (const node of this.nodes.values()) {
      count += node.successors.size;
    }
    return count;
  }

  /**
   * Removes a node from the graph along with its associated edges.
   * @param nodeId The ID of the node to remove.
   * @returns True if the node was removed, false if it didn't exist.
   */
  removeNode(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) {
      logger.warn(`[DAG] Cannot remove node: ${nodeId} not found.`);
      return false;
    }

    // Remove edges pointing to this node
    for (const predecessorId of node.predecessors) {
      const predecessor = this.nodes.get(predecessorId);
      if (predecessor) {
        predecessor.successors.delete(nodeId);
      }
    }

    // Remove edges from this node
    for (const successorId of node.successors) {
      const successor = this.nodes.get(successorId);
      if (successor) {
        successor.predecessors.delete(nodeId);
      }
    }

    // Remove the node itself
    this.nodes.delete(nodeId);
    logger.debug(`[DAG] Removed node: ${nodeId}`);
    return true;
  }

  /**
   * Removes an edge from the graph.
   * @param fromId The ID of the source node.
   * @param toId The ID of the target node.
   * @returns True if the edge was removed, false if it didn't exist.
   */
  removeEdge(fromId: string, toId: string): boolean {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);

    if (!fromNode || !toNode) {
      logger.warn(`[DAG] Cannot remove edge: Node ${!fromNode ? fromId : toId} not found.`);
      return false;
    }

    const removed = fromNode.successors.delete(toId);
    if (removed) {
      toNode.predecessors.delete(fromId);
      logger.debug(`[DAG] Removed edge from ${fromId} to ${toId}`);
    } else {
      logger.warn(`[DAG] Edge from ${fromId} to ${toId} doesn't exist.`);
    }

    return removed;
  }

  /**
   * Gets all nodes in the graph.
   * @returns An array of all node data.
   */
  getAllNodes(): T[] {
    return Array.from(this.nodes.values()).map(node => node.data);
  }

  /**
   * Checks if an edge exists between two nodes.
   * @param fromId The ID of the source node.
   * @param toId The ID of the target node.
   * @returns True if the edge exists, false otherwise.
   */
  hasEdge(fromId: string, toId: string): boolean {
    const fromNode = this.nodes.get(fromId);
    return fromNode ? fromNode.successors.has(toId) : false;
  }

  /**
   * Gets the IDs of the children of a node (direct successors).
   * @param nodeId The ID of the node.
   * @returns An array of child node IDs.
   */
  getChildren(nodeId: string): string[] {
    const node = this.nodes.get(nodeId);
    return node ? Array.from(node.successors) : [];
  }

  /**
   * Gets the IDs of the parents of a node (direct predecessors).
   * @param nodeId The ID of the node.
   * @returns An array of parent node IDs.
   */
  getParents(nodeId: string): string[] {
    const node = this.nodes.get(nodeId);
    return node ? Array.from(node.predecessors) : [];
  }

  /**
   * Gets all descendant node IDs of a node (direct and indirect successors).
   * @param nodeId The ID of the node.
   * @returns An array of descendant node IDs.
   */
  getDescendants(nodeId: string): string[] {
    const descendants = new Set<string>();
    const visited = new Set<string>();
    
    const visit = (currentId: string) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (!node) return;

      for (const successorId of node.successors) {
        descendants.add(successorId);
        visit(successorId);
      }
    };

    visit(nodeId);
    return Array.from(descendants);
  }

  /**
   * Gets all ancestor node IDs of a node (direct and indirect predecessors).
   * @param nodeId The ID of the node.
   * @returns An array of ancestor node IDs.
   */
  getAncestors(nodeId: string): string[] {
    const ancestors = new Set<string>();
    const visited = new Set<string>();
    
    const visit = (currentId: string) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (!node) return;

      for (const predecessorId of node.predecessors) {
        ancestors.add(predecessorId);
        visit(predecessorId);
      }
    };

    visit(nodeId);
    return Array.from(ancestors);
  }

  /**
   * Gets the root nodes (nodes without predecessors).
   * @returns An array of root node data.
   */
  getRootNodes(): T[] {
    return Array.from(this.nodes.values())
      .filter(node => node.predecessors.size === 0)
      .map(node => node.data);
  }

  /**
   * Gets the leaf nodes (nodes without successors).
   * @returns An array of leaf node data.
   */
  getLeafNodes(): T[] {
    return Array.from(this.nodes.values())
      .filter(node => node.successors.size === 0)
      .map(node => node.data);
  }

  /**
   * Detects if adding an edge would create a cycle in the graph.
   * @param fromId The ID of the source node.
   * @param toId The ID of the target node.
   * @returns True if adding the edge would create a cycle, false otherwise.
   */
  wouldCreateCycle(fromId: string, toId: string): boolean {
    // Self-loop is an immediate cycle
    if (fromId === toId) return true;

    // If toId can reach fromId, then adding this edge would create a cycle
    return this.getDescendants(toId).includes(fromId);
  }

  /**
   * Serializes the graph to a JSON representation.
   * @returns A JSON-serializable object representing the graph.
   */
  toJSON() {
    const nodes = Array.from(this.nodes.values()).map(node => {
      // Create a copy of the data to avoid modifying the original
      const nodeData = { ...node.data };
      
      // Ensure we don't have duplicate ID field
      if ('id' in nodeData && nodeData.id !== node.id) {
        logger.warn(`Node data contains id property different from node.id, using node.id: ${node.id}`);
      }
      
      // Set the id property to node.id
      nodeData.id = node.id;
      
      return nodeData;
    });
    
    const edges = Array.from(this.nodes.entries()).flatMap(([fromId, node]) => {
      return Array.from(node.successors).map(toId => ({
        from: fromId,
        to: toId
      }));
    });
    
    return {
      nodes,
      edges
    };
  }

  /**
   * Creates a DirectedAcyclicGraph from a JSON representation.
   * @param json The JSON representation of the graph.
   * @returns A new DirectedAcyclicGraph instance.
   */
  static fromJSON<U extends NodeWithId>(json: { nodes: U[], edges: { from: string, to: string }[] }): DirectedAcyclicGraph<U> {
    const dag = new DirectedAcyclicGraph<U>();
    
    // Add all nodes first
    for (const nodeData of json.nodes) {
      dag.addNode(nodeData);
    }
    
    // Then add edges
    for (const edge of json.edges) {
      dag.addEdge(edge.from, edge.to);
    }
    
    return dag;
  }
  // private detectCycle(fromId: string, toId: string): boolean { ... }

  // TODO: Implement graph traversal methods (DFS, BFS, topological sort)
}
