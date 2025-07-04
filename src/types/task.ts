import { CID, GoTNodeID, TaskID } from './common.js'; // Assuming common.js exists and is correct
import { GoTNodeType, GoTNodeStatus } from '../tasks/graph/node'; // Import GoTNode types and statuses

/**
 * Represents the status specifically for a Task or a GoTNode execution lifecycle.
 */
export { GoTNodeStatus as TaskStatus }; // Re-export GoTNodeStatus as TaskStatus for consistency

/**
 * Represents the different types of nodes within a Graph-of-Thought.
 */
export { GoTNodeType as ThoughtNodeType }; // Re-export GoTNodeType as ThoughtNodeType for consistency

/**
 * Interface for a node within the Graph-of-Thought (GoT).
 * Based on the structure outlined in the INTEGRATION_PLAN.md.
 */
export interface GoTNode {
  id: GoTNodeID;                  // Unique identifier for the node
  content: string;                // The thought, question, or instruction content
  type: GoTNodeType;          // Type of thought node (using GoTNodeType)
  dependencies: GoTNodeID[];      // IDs of nodes this node depends on
  priority: number;               // Computed priority for scheduling
  status: GoTNodeStatus;             // Current execution status (e.g., PENDING, PROCESSING, COMPLETED) (using GoTNodeStatus)
  result?: any;                   // Result data after execution (can be refined with specific types)
  error?: string;                 // Error message if execution failed
  metadata: {
    createdAt: number;            // Timestamp (ms since epoch) of creation
    startedAt?: number;           // Timestamp when processing started
    completedAt?: number;         // Timestamp when processing completed
    confidence?: number;          // Confidence score in the result (0-1), if applicable
    executionTimeMs?: number;     // Actual execution time in milliseconds
    computationalComplexity?: number; // Estimated complexity (e.g., 1-10)
    retryCount?: number;          // How many times this node has been retried
    basePriority?: number;        // Initial base priority if different from computed
    updatedAt?: number;           // Timestamp of the last update to this node's metadata or status
    // Add other relevant metadata (e.g., model used, cost)
  };
  storage: {
    instructionsCid?: CID;        // Optional IPFS CID for detailed task instructions
    dataCid?: CID;                // Optional IPFS CID for input data
    resultCid?: CID;              // Optional IPFS CID for result data (if large)
  };
  // Optional field for child nodes if decomposition creates direct children not just dependencies
  children?: GoTNodeID[]; 
}

/**
 * Represents a high-level task managed by the TaskManager.
 * This might be the entry point that gets decomposed into a GoT.
 */
export interface Task {
  id: TaskID;
  description: string;
  status: GoTNodeStatus; // Changed to GoTNodeStatus
  priority: number;
  createdAt: number;
  updatedAt: number;
 rootNodeId?: GoTNodeID; // Link to the root node of the GoT if applicable
 result?: any; // Final result of the overall task
 nodes: GoTNodeID[]; // List of node IDs associated with this task
 // Add other relevant task fields (e.g., user ID, context)
}

/**
 * Represents the final result structure from processing a GoT query.
 */
 export interface GoTResult {
    finalAnswer: string; // Or a more complex result object
    relevantNodes: GoTNode[]; // Key nodes contributing to the answer
    // Add other result metadata (e.g., total execution time, confidence)
}

export interface TaskCreationOptions {
  description: string;
  basePriority?: number;
  initialData?: any;
  initialDataCid?: CID;
  rootNodeContent?: string; // If starting directly with a GoT
  // Other options like user ID, context, etc.
}
