// src/tasks/graph/dag.js
/**
 * JavaScript implementation of Directed Acyclic Graph (DAG)
 * This is a JavaScript version of the TypeScript DAG implementation
 */
import { logger } from '../utils/logger';

/**
 * Represents a node within the DAG, storing the actual data
 * and adjacency information (outgoing and incoming edges).
 */
class DagNode {
  /**
   * Create a new DAG node
   * @param {Object} data - The node data (must have an 'id' property)
   */
  constructor(data) {
    this.id = data.id;
    this.data = data;
    this.successors = new Set(); // IDs of nodes this node points to
    this.predecessors = new Set(); // IDs of nodes pointing to this node
  }
}

/**
 * Basic implementation of a Directed Acyclic Graph (DAG).
 * Stores nodes and their relationships.
 */
export class DirectedAcyclicGraph {
  constructor() {
    this.nodes = new Map();
    this.edgeCount = 0;
    logger.debug('Initializing DirectedAcyclicGraph...');
  }

  /**
   * Adds a node to the graph.
   * @param {Object} nodeData - The data for the node (must include an 'id').
   * @returns {boolean} True if the node was added, false if a node with the same ID already exists.
   */
  addNode(nodeData) {
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
   * @param {string} fromId - ID of the source node.
   * @param {string} toId - ID of the target node.
   * @returns {boolean} True if the edge was added, false if one of the nodes doesn't exist or the edge would create a cycle.
   */
  addEdge(fromId, toId) {
    // Verify nodes exist
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    
    if (!fromNode || !toNode) {
      logger.warn(`[DAG] Cannot add edge: one or both nodes (${fromId} -> ${toId}) do not exist.`);
      return false;
    }
    
    // Check if the edge would create a cycle
    if (this.wouldCreateCycle(fromId, toId)) {
      logger.warn(`[DAG] Cannot add edge ${fromId} -> ${toId}: would create a cycle.`);
      return false;
    }
    
    // Add edge
    if (fromNode.successors.has(toId)) {
      logger.debug(`[DAG] Edge ${fromId} -> ${toId} already exists.`);
      return false;
    }
    
    fromNode.successors.add(toId);
    toNode.predecessors.add(fromId);
    this.edgeCount++;
    
    logger.debug(`[DAG] Added edge: ${fromId} -> ${toId}`);
    return true;
  }

  /**
   * Checks if adding an edge would create a cycle in the graph.
   * @private
   * @param {string} fromId - ID of the source node.
   * @param {string} toId - ID of the target node.
   * @returns {boolean} True if adding the edge would create a cycle.
   */
  wouldCreateCycle(fromId, toId) {
    // If trying to add a self-loop
    if (fromId === toId) {
      return true;
    }
    
    // Check if there's already a path from toId to fromId
    // (which would create a cycle if we add an edge from fromId to toId)
    const visited = new Set();
    const toVisit = [toId];
    
    while (toVisit.length > 0) {
      const currentId = toVisit.pop();
      
      if (currentId === fromId) {
        return true; // Found a path from toId to fromId
      }
      
      visited.add(currentId);
      
      const currentNode = this.nodes.get(currentId);
      if (currentNode) {
        for (const successorId of currentNode.successors) {
          if (!visited.has(successorId)) {
            toVisit.push(successorId);
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Removes a node from the graph.
   * @param {string} nodeId - ID of the node to remove.
   * @returns {boolean} True if the node was removed, false if it doesn't exist.
   */
  removeNode(nodeId) {
    const node = this.nodes.get(nodeId);
    
    if (!node) {
      logger.warn(`[DAG] Cannot remove node ${nodeId}: does not exist.`);
      return false;
    }
    
    // Remove all edges connected to this node
    // Remove incoming edges
    for (const predId of node.predecessors) {
      const predNode = this.nodes.get(predId);
      if (predNode) {
        predNode.successors.delete(nodeId);
        this.edgeCount--;
      }
    }
    
    // Remove outgoing edges
    for (const succId of node.successors) {
      const succNode = this.nodes.get(succId);
      if (succNode) {
        succNode.predecessors.delete(nodeId);
        this.edgeCount--;
      }
    }
    
    // Remove the node
    this.nodes.delete(nodeId);
    logger.debug(`[DAG] Removed node: ${nodeId}`);
    return true;
  }

  /**
   * Removes an edge from the graph.
   * @param {string} fromId - ID of the source node.
   * @param {string} toId - ID of the target node.
   * @returns {boolean} True if the edge was removed, false if it doesn't exist.
   */
  removeEdge(fromId, toId) {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    
    if (!fromNode || !toNode) {
      logger.warn(`[DAG] Cannot remove edge: one or both nodes (${fromId} -> ${toId}) do not exist.`);
      return false;
    }
    
    if (!fromNode.successors.has(toId)) {
      logger.warn(`[DAG] Edge ${fromId} -> ${toId} does not exist.`);
      return false;
    }
    
    fromNode.successors.delete(toId);
    toNode.predecessors.delete(fromId);
    this.edgeCount--;
    
    logger.debug(`[DAG] Removed edge: ${fromId} -> ${toId}`);
    return true;
  }

  /**
   * Checks if a node exists in the graph.
   * @param {string} nodeId - ID of the node to check.
   * @returns {boolean} True if the node exists.
   */
  hasNode(nodeId) {
    return this.nodes.has(nodeId);
  }

  /**
   * Checks if an edge exists in the graph.
   * @param {string} fromId - ID of the source node.
   * @param {string} toId - ID of the target node.
   * @returns {boolean} True if the edge exists.
   */
  hasEdge(fromId, toId) {
    const fromNode = this.nodes.get(fromId);
    return fromNode && fromNode.successors.has(toId);
  }

  /**
   * Gets a node from the graph.
   * @param {string} nodeId - ID of the node to get.
   * @returns {Object|undefined} The node data, or undefined if not found.
   */
  getNode(nodeId) {
    const node = this.nodes.get(nodeId);
    return node ? node.data : undefined;
  }

  /**
   * Gets the successors of a node.
   * @param {string} nodeId - ID of the node.
   * @returns {Set<string>|undefined} Set of successor node IDs, or undefined if the node doesn't exist.
   */
  getSuccessors(nodeId) {
    const node = this.nodes.get(nodeId);
    return node ? node.successors : undefined;
  }

  /**
   * Gets the predecessors of a node.
   * @param {string} nodeId - ID of the node.
   * @returns {Set<string>|undefined} Set of predecessor node IDs, or undefined if the node doesn't exist.
   */
  getPredecessors(nodeId) {
    const node = this.nodes.get(nodeId);
    return node ? node.predecessors : undefined;
  }

  /**
   * Gets all nodes from the graph.
   * @returns {Array<Object>} Array of all node data objects.
   */
  getNodes() {
    return Array.from(this.nodes.values()).map(node => node.data);
  }

  /**
   * Gets the IDs of all nodes in the graph.
   * @returns {Array<string>} Array of all node IDs.
   */
  getNodeIds() {
    return Array.from(this.nodes.keys());
  }

  /**
   * Gets the IDs of all successor nodes (children) of a node.
   * @param {string} nodeId - ID of the node to get successors for.
   * @returns {Set<string>} Set of successor node IDs.
   */
  getChildren(nodeId) {
    const node = this.nodes.get(nodeId);
    return node ? node.successors : new Set();
  }

  /**
   * Gets the IDs of all predecessor nodes (parents) of a node.
   * @param {string} nodeId - ID of the node to get predecessors for.
   * @returns {Set<string>} Set of predecessor node IDs.
   */
  getParents(nodeId) {
    const node = this.nodes.get(nodeId);
    return node ? node.predecessors : new Set();
  }

  /**
   * Checks if a node has any successors (children).
   * @param {string} nodeId - ID of the node to check.
   * @returns {boolean} True if the node has successors.
   */
  hasSuccessors(nodeId) {
    const node = this.nodes.get(nodeId);
    return node && node.successors.size > 0;
  }

  /**
   * Checks if a node has any predecessors (parents).
   * @param {string} nodeId - ID of the node to check.
   * @returns {boolean} True if the node has predecessors.
   */
  hasPredecessors(nodeId) {
    const node = this.nodes.get(nodeId);
    return node && node.predecessors.size > 0;
  }

  /**
   * Gets the number of nodes in the graph.
   * @returns {number} The node count.
   */
  getNodeCount() {
    return this.nodes.size;
  }

  /**
   * Gets the number of edges in the graph.
   * @returns {number} The edge count.
   */
  getEdgeCount() {
    return this.edgeCount;
  }

  /**
   * Performs a topological sort of the graph.
   * @returns {Array<string>} Array of node IDs in topological order.
   */
  topologicalSort() {
    const result = [];
    const visited = new Set();
    const temp = new Set(); // For cycle detection
    
    // Helper function for DFS
    const visit = (nodeId) => {
      if (temp.has(nodeId)) {
        throw new Error("Graph has a cycle");
      }
      
      if (!visited.has(nodeId)) {
        temp.add(nodeId);
        
        const node = this.nodes.get(nodeId);
        if (node) {
          for (const succId of node.successors) {
            visit(succId);
          }
        }
        
        temp.delete(nodeId);
        visited.add(nodeId);
        result.unshift(nodeId); // Add to the beginning
      }
    };
    
    // Visit all nodes
    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        visit(nodeId);
      }
    }
    
    return result;
  }

  /**
   * Gets source nodes (nodes with no predecessors).
   * @returns {Array<string>} Array of source node IDs.
   */
  getSources() {
    return Array.from(this.nodes.entries())
      .filter(([_, node]) => node.predecessors.size === 0)
      .map(([id, _]) => id);
  }

  /**
   * Gets sink nodes (nodes with no successors).
   * @returns {Array<string>} Array of sink node IDs.
   */
  getSinks() {
    return Array.from(this.nodes.entries())
      .filter(([_, node]) => node.successors.size === 0)
      .map(([id, _]) => id);
  }

  /**
   * Clears the graph, removing all nodes and edges.
   */
  clear() {
    this.nodes.clear();
    this.edgeCount = 0;
    logger.debug('[DAG] Graph cleared.');
  }
}

export default DirectedAcyclicGraph;
