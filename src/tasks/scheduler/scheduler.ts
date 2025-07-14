// src/tasks/scheduler/scheduler.ts
import { FibonacciHeap, FibHeapNode } from './fibonacci-heap.js';
import { GoTNode, TaskStatus } from '../../types/task';
import { GoTNodeID } from '../types/common';

// Define weights for priority calculation factors
// These can be tuned based on desired scheduling behavior
const PRIORITY_FACTORS_WEIGHTS = {
  BASE_PRIORITY: 1000, // Higher weight for explicit priority
  COMPUTATIONAL_COMPLEXITY: -10, // Higher complexity = lower priority score contribution
  DEPENDENT_COUNT: 5, // More dependents = higher priority
  WAITING_TIME_MS: 0.001, // Small factor for each ms waited
  CONFIDENCE: 50, // Higher confidence = higher priority (0-1 scale for confidence)
  RETRY_COUNT: -50, // More retries = lower priority
};

export class TaskScheduler {
  // Stores GoTNodeIDs, prioritized by their computed priority (lower number = higher priority)
  private taskHeap: FibonacciHeap<GoTNodeID>;
  // Holds the actual GoTNode objects
  private nodes: Map<GoTNodeID, GoTNode>;
  // Holds references to FibonacciHeap nodes for efficient decreaseKey operations
  private heapNodes: Map<GoTNodeID, FibHeapNode<GoTNodeID>>;

  constructor() {
    this.taskHeap = new FibonacciHeap<GoTNodeID>();
    this.nodes = new Map<GoTNodeID, GoTNode>();
    this.heapNodes = new Map<GoTNodeID, FibHeapNode<GoTNodeID>>();
  }

  private _calculateComputedPriority(nodeId: GoTNodeID): number {
    const node = this.nodes.get(nodeId);
    if (!node) return Infinity; // Should not happen if node is in scheduler

    let computedPriorityScore = 0;

    // 1. Base Priority (lower is better)
    // Assuming node.priority is the base, or use node.metadata.basePriority
    const basePriority = node.metadata.basePriority ?? node.priority ?? 0;
    computedPriorityScore += basePriority * PRIORITY_FACTORS_WEIGHTS.BASE_PRIORITY;

    // 2. Computational Complexity (higher complexity makes score higher, meaning lower priority)
    const complexity = node.metadata.computationalComplexity ?? 1; // Default to 1 if undefined
    computedPriorityScore += complexity * PRIORITY_FACTORS_WEIGHTS.COMPUTATIONAL_COMPLEXITY;

    // 3. Dependency Structure (more nodes depending on this one increases its priority)
    // This requires knowing the graph structure; for now, let's assume GoTNode.children are direct dependents.
    // A more advanced calculation might involve full graph analysis (e.g. critical path).
    const dependentCount = node.children?.length ?? 0;
    computedPriorityScore -= dependentCount * PRIORITY_FACTORS_WEIGHTS.DEPENDENT_COUNT; // Subtract to make priority higher

    // 4. Waiting Time (longer waiting time increases priority)
    const waitingTime = Date.now() - node.metadata.createdAt;
    computedPriorityScore -= waitingTime * PRIORITY_FACTORS_WEIGHTS.WAITING_TIME_MS; // Subtract to make priority higher

    // 5. Confidence Score (higher confidence increases priority)
    const confidence = node.metadata.confidence ?? 0.5; // Default to 0.5 if undefined
    computedPriorityScore -= confidence * PRIORITY_FACTORS_WEIGHTS.CONFIDENCE; // Subtract to make priority higher

    // 6. Retry History (more retries decreases priority)
    const retryCount = node.metadata.retryCount ?? 0;
    computedPriorityScore += retryCount * PRIORITY_FACTORS_WEIGHTS.RETRY_COUNT;
    
    return computedPriorityScore; // Lower score means higher priority for the heap
  }

  private _canSchedule(nodeId: GoTNodeID): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    if (node.status !== TaskStatus.PENDING && node.status !== TaskStatus.SCHEDULED) { // Allow re-scheduling of already scheduled
        return false; 
    }

    for (const depId of node.dependencies) {
      const depNode = this.nodes.get(depId);
      if (!depNode || depNode.status !== TaskStatus.COMPLETED) {
        return false; // All dependencies must be completed
      }
    }
    return true;
  }

  addNodeToSchedule(node: GoTNode): boolean {
    if (this.nodes.has(node.id) && this.heapNodes.has(node.id)) {
      // Node already in scheduler, potentially update its priority
      return this.updateNodePriority(node.id, node.metadata.basePriority ?? node.priority);
    }

    this.nodes.set(node.id, node);
    if (this._canSchedule(node.id)) {
      const computedPriority = this._calculateComputedPriority(node.id);
      node.priority = computedPriority; // Update the node's computed priority field
      const heapNodeRef = this.taskHeap.insert(computedPriority, node.id);
      this.heapNodes.set(node.id, heapNodeRef);
      // Update node status to SCHEDULED if it was PENDING
      if (node.status === TaskStatus.PENDING) {
        node.status = TaskStatus.SCHEDULED;
        node.metadata.updatedAt = Date.now();
      }
      return true;
    }
    // If not schedulable now, it remains in this.nodes and will be checked later
    // (e.g. when a dependency completes)
    return false;
  }

  getNextSchedulableNode(): GoTNode | null {
    if (this.taskHeap.isEmpty()) {
      return null;
    }

    const nodeId = this.taskHeap.extractMin();
    if (!nodeId) return null; // Should not happen if not empty

    this.heapNodes.delete(nodeId); // Remove from heap tracking
    const node = this.nodes.get(nodeId);

    if (!node) {
      // Node was in heap but not in our map, inconsistency.
      // Attempt to get next one.
      console.warn(`Node ${nodeId} found in heap but not in node map.`);
      return this.getNextSchedulableNode();
    }

    node.status = TaskStatus.PROCESSING;
    node.metadata.startedAt = Date.now();
    node.metadata.updatedAt = Date.now();
    return node;
  }

  updateNodePriority(
    nodeId: GoTNodeID,
    newBasePriority?: number,
    updatedMetadata?: Partial<GoTNode['metadata']>
  ): boolean {
    const node = this.nodes.get(nodeId);
    const heapNodeRef = this.heapNodes.get(nodeId);

    if (!node) return false; // Node not managed by scheduler

    if (newBasePriority !== undefined) {
      node.metadata.basePriority = newBasePriority; // Or node.priority if that's the source
    }
    if (updatedMetadata) {
      node.metadata = { ...node.metadata, ...updatedMetadata };
    }
    node.metadata.updatedAt = Date.now();

    const newComputedPriority = this._calculateComputedPriority(nodeId);
    node.priority = newComputedPriority; // Update the node's computed priority field

    if (heapNodeRef && newComputedPriority < heapNodeRef.key) {
      // Only use decreaseKey if priority improved (key decreased) and node is in heap
      this.taskHeap.decreaseKey(heapNodeRef, newComputedPriority);
      return true;
    } else if (heapNodeRef) {
      // Priority worsened or stayed same, or node not in heap but should be re-evaluated.
      // For simplicity, if it's in the heap and priority worsened, a full re-insert is safer
      // than implementing increaseKey (which is complex: remove and re-insert).
      // Here, we assume decreaseKey handles it or it's not significantly worse.
      // A more robust solution might re-add if priority worsened significantly.
      // For now, if it's in the heap, we've updated its key via decreaseKey or it's implicitly handled.
      // If it wasn't in the heap but now can be, addNodeToSchedule will handle it.
    }
    
    // If node was not in heap (e.g. PENDING and unschedulable) but now might be
    if (!heapNodeRef && this._canSchedule(nodeId)) {
        const hnRef = this.taskHeap.insert(newComputedPriority, nodeId);
        this.heapNodes.set(nodeId, hnRef);
        if (node.status === TaskStatus.PENDING) {
            node.status = TaskStatus.SCHEDULED;
        }
        return true;
    }
    return heapNodeRef ? true : false; // Return true if it was in heap, false otherwise
  }

  // Called when a node completes, to process its dependents
  processNodeCompletion(completedNodeId: GoTNodeID): void {
    const completedNode = this.nodes.get(completedNodeId);
    if (!completedNode || completedNode.status !== TaskStatus.COMPLETED) {
      return; // Not completed or not found
    }

    // Iterate over all nodes to find dependents.
    // In a large system, this could be optimized (e.g. if nodes store their children/dependents).
    // GoTNode.children can be used here.
    (completedNode.children || []).forEach(dependentId => {
        const dependentNode = this.nodes.get(dependentId);
        if (dependentNode && dependentNode.status === TaskStatus.PENDING) {
            if (this._canSchedule(dependentId)) {
                // Node is now schedulable, (re)calculate priority and add/update in heap
                this.updateNodePriority(dependentId); // This will add if not present and schedulable
                                                       // or update if already known but unscheduled.
            }
        }
    });
  }
  
  getNode(nodeId: GoTNodeID): GoTNode | undefined {
    return this.nodes.get(nodeId);
  }

  hasNode(nodeId: GoTNodeID): boolean {
    return this.nodes.has(nodeId);
  }

  // For monitoring or cleanup
  getAllNodes(): GoTNode[] {
    return Array.from(this.nodes.values());
  }

  getScheduledNodeCount(): number {
    return this.taskHeap.size();
  }
}
