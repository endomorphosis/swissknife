import { GoTNode } from '../types/task'; // Keep GoTNode from here
import { GoTNodeStatus } from '../graph/node'; // Import GoTNodeStatus directly
import { StorageProvider } from '../types/storage';
import { logger } from '../utils/logger';
import { DirectedAcyclicGraph } from '../graph/dag'; // Import DAG
import { FibonacciHeap, FibHeapNode } from './fibonacci-heap.js'; // Import external FibonacciHeap

// --- Fibonacci Heap Scheduler ---

interface SchedulerOptions {
  dag: DirectedAcyclicGraph<GoTNode>; // Require DAG instance
  storage?: StorageProvider; // Optional storage
}

/**
 * Manages task scheduling using a Fibonacci Heap for efficient prioritization.
 */
export class FibonacciHeapScheduler {
  private heap: FibonacciHeap<GoTNode>;
  private nodeMap = new Map<string, FibHeapNode<GoTNode>>(); // Use FibHeapNode from external heap
  private pendingNodes = new Set<string>(); // Track IDs of nodes pending dependencies
  private dag: DirectedAcyclicGraph<GoTNode>; // Store DAG instance

  constructor(options: SchedulerOptions) {
    logger.debug('FibonacciHeapScheduler initialized');
    this.dag = options.dag; 
    this.heap = new FibonacciHeap<GoTNode>(); 
    logger.debug('FibonacciHeapScheduler initialized');
  }

  /**
   * Adds a GoTNode to the scheduler.
   */
  addTask(node: GoTNode): void {
    logger.debug(`Scheduler: Attempting to add task/node ${node.id}`);
    if (this.nodeMap.has(node.id)) {
      logger.warn(`Scheduler: Node ${node.id} is already tracked.`);
      return;
    }

    if (this.areDependenciesMet(node)) {
      logger.info(`Scheduler: Adding node ${node.id} to heap (dependencies met).`);
      // Use the external FibonacciHeap's insert method which takes key and value
      const heapNode = this.heap.insert(node.priority, node); 
      this.nodeMap.set(node.id, heapNode);
      node.status = GoTNodeStatus.RUNNING; 
      this.pendingNodes.delete(node.id); 
    } else {
      logger.debug(`Scheduler: Node ${node.id} dependencies not met yet. Adding to pending set.`);
      node.status = GoTNodeStatus.PENDING; 
      this.pendingNodes.add(node.id); 
    }
  }

  /**
   * Retrieves and removes the highest priority task from the heap.
   */
  async getNextTask(): Promise<GoTNode | null> {
    if (this.heap.isEmpty()) {
      logger.debug('Scheduler: Heap is empty, no tasks to execute.');
      return null;
    }

    // extractMin now returns T | null, which is GoTNode | null
    const node = this.heap.extractMin(); 
    if (!node) return null; 

    this.nodeMap.delete(node.id);
    logger.info(`Scheduler: Extracted node ${node.id} for execution.`);
    node.status = GoTNodeStatus.IN_PROGRESS; 
    return node;
  }

  /**
   * Updates the priority of a task already in the scheduler.
   */
  updatePriority(nodeId: string, newPriority: number): void {
    const heapNode = this.nodeMap.get(nodeId);
    if (!heapNode) {
      logger.warn(`Scheduler: Cannot update priority for unknown node ${nodeId}`);
      return;
    }
    
    // Use heapNode.key for the priority
    if (newPriority < heapNode.key) {
       logger.debug(`Scheduler: Decreasing priority for node ${nodeId} to ${newPriority}`);
       this.heap.decreaseKey(heapNode, newPriority);
    } else if (newPriority > heapNode.key) {
       logger.warn(`Scheduler: Increasing priority for node ${nodeId} requires remove & re-insert (not implemented).`);
    }
  }

  /**
   * Checks if all dependencies for a given node are completed using the DAG.
   */
  private areDependenciesMet(node: GoTNode): boolean {
    if (!this.dag) {
        logger.error("Scheduler: DAG not available for dependency check.");
        return false; 
    }
    // Assuming node.dependencies is an array of strings (node IDs)
    if (!node.dependencies || node.dependencies.length === 0) {
        return true; 
    }

    for (const depId of node.dependencies) {
       const depNodeData = this.dag.getNode(depId); 
       if (!depNodeData || depNodeData.status !== GoTNodeStatus.COMPLETED) {
          logger.debug(`Scheduler: Dependency ${depId} for node ${node.id} not met (Status: ${depNodeData?.status ?? 'Not Found'}).`);
          return false; 
       }
    }
    logger.debug(`Scheduler: All dependencies met for node ${node.id}.`);
    return true; 
  }

  hasNext(): boolean {
    return !this.heap.isEmpty();
  }
  
  /**
   * Re-evaluates pending nodes to see if their dependencies are now met.
   */
  reschedulePending(): void {
     logger.debug(`Scheduler: Rescheduling pending nodes (count: ${this.pendingNodes.size})...`);
     if (this.pendingNodes.size === 0) {
        return; 
     }

     // Iterate over a copy of the IDs to avoid issues with modifying the set during iteration
     const pendingIdsToCheck = Array.from(this.pendingNodes); 
     
     for (const nodeId of pendingIdsToCheck) {
        const nodeData = this.dag.getNode(nodeId);
        if (!nodeData) {
           logger.error(`Scheduler: Pending node ${nodeId} not found in DAG during reschedule.`);
           this.pendingNodes.delete(nodeId); // Remove missing node ID
           continue;
        }
        
        // Only re-check if still PENDING (might have been scheduled by another path)
        if (nodeData.status === GoTNodeStatus.PENDING) {
            if (this.areDependenciesMet(nodeData)) {
               logger.info(`Scheduler: Pending node ${nodeId} now has dependencies met. Re-adding.`);
               // addTask will handle adding to heap and removing from pendingNodes set
               this.addTask(nodeData); 
            }
        } else {
            // If status is no longer PENDING, remove it from the set
            this.pendingNodes.delete(nodeId);
        }
     }
     logger.debug(`Scheduler: Finished rescheduling pending nodes.`);
  }
}
