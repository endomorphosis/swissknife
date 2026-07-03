// src/tasks/delegation/delegator.ts
import { GoTNode } from '../../types/task.js'; // Using GoTNode as the schedulable/delegable unit
import { GoTNodeID } from '../../types/common.js'; // Corrected import
import { MerkleClock } from '@src/tasks/coordination/merkle_clock'; // For worker clocks

export interface Worker {
  id: string; // Peer ID, used for Hamming distance
  capabilities: string[];
  currentLoad: number;
  maxLoad: number;
  status: 'online' | 'busy' | 'offline';
  merkleClock?: MerkleClock; // Each worker maintains its own clock
  // lastHeardFrom?: number; // For heartbeat mechanism
}

export interface TaskAssignment {
  nodeId: GoTNodeID;
  workerId: string;
  assignedAt: number;
}

// Utility for Hamming Distance
function calculateHammingDistance(str1: string, str2: string): number {
  let distance = 0;
  const len1 = str1.length;
  const len2 = str2.length;
  const maxLength = Math.max(len1, len2);

  // Normalize by padding shorter string (e.g., with a non-participating char or by conceptual alignment)
  // For simplicity, we'll compare up to minLength and add difference for maxLength.
  // A more robust approach might involve hashing to fixed-length bitstrings.
  const minLength = Math.min(len1, len2);
  for (let i = 0; i < minLength; i++) {
    if (str1[i] !== str2[i]) {
      distance++;
    }
  }
  distance += maxLength - minLength; // Add difference in lengths
  return distance;
}


export class TaskDelegator {
  private workers: Map<string, Worker>; // Keyed by Worker ID (Peer ID)
  private assignments: Map<GoTNodeID, TaskAssignment>; // Keyed by GoTNodeID

  // LibP2P PubSub instance would be injected or managed here for P2P communication
  // private libp2pPubSub: any; 

  constructor(/* libp2pPubSub?: any */) {
    this.workers = new Map<string, Worker>();
    this.assignments = new Map<GoTNodeID, TaskAssignment>();
    // this.libp2pPubSub = libp2pPubSub;
  }

  registerWorker(worker: Worker): void {
    console.log(`Registering worker: ${worker.id}`);
    this.workers.set(worker.id, worker);
    // Announce to any network listeners (pubsub stub — wire to libp2p when available)
    this.announceWorkerJoined(worker.id);
  }

  unregisterWorker(workerId: string): void {
    console.log(`Unregistering worker: ${workerId}`);
    // Re-delegate any tasks currently assigned to this worker
    for (const [nodeId, assignment] of this.assignments) {
      if (assignment.workerId === workerId) {
        this.assignments.delete(nodeId);
        console.log(`Task ${nodeId} unassigned from departing worker ${workerId}; needs re-delegation.`);
      }
    }
    this.workers.delete(workerId);
  }
  
  updateWorkerStatus(workerId: string, status: 'online' | 'busy' | 'offline', clock?: MerkleClock): boolean {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return false;
    }
    worker.status = status;
    if (clock) {
        worker.merkleClock = clock; // Update worker's clock on status update/heartbeat
    }
    // worker.lastHeardFrom = Date.now();
    console.log(`Worker ${workerId} status updated to ${status}. Clock head: ${(clock as any)?.getHead()}`); // Cast to any
    return true;
  }

  /**
   * Finds the most suitable worker for a given GoTNode based on Hamming distance
   * to the node's ID (or a target clock head associated with the task).
   * @param node The GoTNode to find a worker for.
   * @param targetIdentifier Typically the GoTNodeID or a relevant MerkleClock head.
   */
  findWorkerForTask(node: GoTNode, targetIdentifier: string): Worker | null {
    let bestWorker: Worker | null = null;
    let minDistance = Infinity;

    const availableWorkers = Array.from(this.workers.values()).filter(
      w => w.status === 'online' && w.currentLoad < w.maxLoad && this.hasRequiredCapabilities(w, node)
    );

    if (availableWorkers.length === 0) {
      console.log(`No available workers for node ${node.id}`);
      return null;
    }

    for (const worker of availableWorkers) {
      // Normalize worker.id and targetIdentifier if needed (e.g. hashing, padding)
      // For this example, we use them directly.
      const distance = calculateHammingDistance(worker.id, targetIdentifier);
      console.log(`Node ${node.id}: Worker ${worker.id}, distance ${distance} to target ${targetIdentifier}`);

      if (distance < minDistance) {
        minDistance = distance;
        bestWorker = worker;
      } else if (distance === minDistance) {
        // Tie-breaking: e.g., prefer worker with less load, or a consistent tie-breaker like lexicographical ID.
        if (bestWorker && worker.currentLoad < bestWorker.currentLoad) {
          bestWorker = worker;
        } else if (bestWorker && worker.currentLoad === bestWorker.currentLoad && worker.id < bestWorker.id) {
          bestWorker = worker; // Lexicographical tie-break
        }
      }
    }
    
    if (bestWorker) {
        console.log(`Selected worker ${bestWorker.id} for node ${node.id} (distance: ${minDistance})`);
    } else {
        console.log(`Could not select a worker for node ${node.id} based on Hamming distance.`);
    }
    return bestWorker;
  }

  assignTaskToWorker(nodeId: GoTNodeID, workerId: string): TaskAssignment | null {
    const worker = this.workers.get(workerId);
    // const node = ???; // We need access to the GoTNode object, assume TaskManager provides it
    
    if (!worker || worker.status !== 'online' || worker.currentLoad >= worker.maxLoad) {
      console.warn(`Cannot assign node ${nodeId} to worker ${workerId}: Worker not suitable.`);
      return null;
    }

    const assignment: TaskAssignment = {
      nodeId,
      workerId,
      assignedAt: Date.now(),
    };
    this.assignments.set(nodeId, assignment);
    worker.currentLoad++;
    if (worker.currentLoad >= worker.maxLoad) {
      worker.status = 'busy';
    }
    console.log(`Node ${nodeId} assigned to worker ${workerId}.`);
    // Notify worker via pubsub stub (wire to libp2p when available)
    this.notifyWorkerAssignment(workerId, nodeId);
    return assignment;
  }

  releaseAssignment(nodeId: GoTNodeID): boolean {
    const assignment = this.assignments.get(nodeId);
    if (!assignment) {
      return false;
    }
    const worker = this.workers.get(assignment.workerId);
    if (worker) {
      worker.currentLoad = Math.max(0, worker.currentLoad - 1); // Ensure load doesn't go below 0
      if (worker.status === 'busy' && worker.currentLoad < worker.maxLoad) {
        worker.status = 'online';
      }
    }
    this.assignments.delete(nodeId);
    console.log(`Assignment for node ${nodeId} released from worker ${assignment.workerId}.`);
    return true;
  }

  getAssignment(nodeId: GoTNodeID): TaskAssignment | undefined {
    return this.assignments.get(nodeId);
  }

  private hasRequiredCapabilities(worker: Worker, node: GoTNode): boolean {
    // Placeholder for capability matching logic.
    // e.g., node.metadata.requiredCapabilities vs worker.capabilities
    return true;
  }

  // --- Placeholder for LibP2P PubSub interactions ---
  announceTaskForDelegation(node: GoTNode, taskMerkleClockHead: string): void {
    const announcement = {
      nodeId: node.id,
      taskContentSummary: node.content.substring(0, 100), // Summary
      requiredCapabilities: [], // Extract from node.metadata if available
      targetClockHead: taskMerkleClockHead, // For Hamming distance calculation by peers
    };
    console.log(`Announcing task ${node.id} for delegation with target head ${taskMerkleClockHead}:`, announcement);
    // this.libp2pPubSub.publish('task-announcements', JSON.stringify(announcement));
  }

  // Workers would listen to 'task-announcements'. If responsible (min Hamming distance), they'd claim.
  // claimTask(nodeId: GoTNodeID, workerId: string): void {
  //   console.log(`Worker ${workerId} claiming task ${nodeId}`);
  //   // this.libp2pPubSub.publish('task-claims', JSON.stringify({ nodeId, workerId }));
  //   // TaskManager (or a central coordinator part) listens to claims and confirms assignment.
  // }

  announceTaskCompletion(nodeId: GoTNodeID, workerId: string, resultSummary: unknown, resultCid?: string): void {
    const completion = { nodeId, workerId, resultSummary, resultCid };
    console.log(`Worker ${workerId} announcing completion for node ${nodeId}:`, completion);
    // this.libp2pPubSub.publish('task-completions', JSON.stringify(completion));
  }

  /** Heartbeat: update worker status and clock; mark offline if no beat within timeoutMs. */
  handleHeartbeat(workerId: string, clock?: unknown): boolean {
    return this.updateWorkerStatus(workerId, 'online', clock as Parameters<typeof this.updateWorkerStatus>[2]);
  }

  /** Start a heartbeat watchdog; marks workers offline after timeoutMs of silence. */
  startHeartbeatWatchdog(timeoutMs = 30_000): NodeJS.Timeout {
    const lastSeen = new Map<string, number>();
    for (const id of this.workers.keys()) lastSeen.set(id, Date.now());

    const timer = setInterval(() => {
      const now = Date.now();
      for (const [id, worker] of this.workers) {
        const seen = lastSeen.get(id) ?? 0;
        if (now - seen > timeoutMs && worker.status !== 'offline') {
          console.warn(`Worker ${id} heartbeat timeout — marking offline.`);
          worker.status = 'offline';
        }
      }
    }, Math.max(1000, timeoutMs / 3));

    if (typeof timer === 'object' && typeof (timer as NodeJS.Timeout).unref === 'function') {
      (timer as NodeJS.Timeout).unref();
    }
    return timer;
  }

  /** Stub for network worker-joined announcement. */
  private announceWorkerJoined(workerId: string): void {
    console.log(`[network-stub] Worker joined: ${workerId}`);
    // this.libp2pPubSub?.publish('worker-joined', JSON.stringify({ workerId }));
  }

  /** Stub for per-assignment worker notification. */
  private notifyWorkerAssignment(workerId: string, nodeId: GoTNodeID): void {
    console.log(`[network-stub] Notify worker ${workerId} about assignment: ${nodeId}`);
    // this.libp2pPubSub?.publish(`worker-${workerId}`, JSON.stringify({ type: 'assign', nodeId }));
  }
}
