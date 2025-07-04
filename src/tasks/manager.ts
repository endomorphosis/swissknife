// src/tasks/manager.ts
import { TaskScheduler } from './scheduler/scheduler.js';
import { 
    Task, 
    GoTNode, 
    TaskStatus, 
    TaskCreationOptions,
    ThoughtNodeType // For creating initial GoTNode
} from '../types/task';
import { TaskID, GoTNodeID } from '../types/common'; // Corrected import
import { StorageProvider } from '../types/storage'; // Corrected import path AGAIN
import { ThinkingManager } from '../ai/thinking/manager'; // For processing GoTNodes
import { BaseModel } from '../ai/models/model'; // For ThinkingManager
import { ThoughtGraph } from '../ai/thinking/graph'; // For context to ThinkingManager
import { v4 as uuidv4 } from 'uuid';

// Placeholder for GraphProcessor, to be detailed in Week 9 tasks
class PlaceholderGraphProcessor {
  async createGraphForTask(task: Task, initialContent: string): Promise<ThoughtGraph> {
    // This would create a ThoughtGraph and its initial GoTNodes based on the task
    // For now, creates a simple graph with one root node
    const graph = new ThoughtGraph();
    const rootNodeId = task.rootNodeId || uuidv4();
    const gotNode = graph.addNode(initialContent, ThoughtNodeType.QUESTION, { basePriority: task.priority }, rootNodeId);
    task.rootNodeId = gotNode.id; // Ensure task links to the root GoT node
    task.nodes = [gotNode.id];
    return graph;
  }
  async decomposeNode(node: GoTNode, _graph: ThoughtGraph, _model: BaseModel, _thinkingManager: ThinkingManager): Promise<GoTNode[]> {
    // Placeholder: In reality, this would use LLM via ThinkingManager or specific strategies
    // to break down 'node' and add new child nodes to 'graph'.
    console.log(`Placeholder: Decomposing node ${node.id}`);
    return []; // No new nodes created by placeholder
  }
}


export class TaskManager {
  private tasks: Map<TaskID, Task>; // Manages high-level tasks
  private gotGraphs: Map<TaskID, ThoughtGraph>; // Stores the GoT for each task
  private scheduler: TaskScheduler;
  private storageProvider?: StorageProvider; // Optional, for IPFS operations
  private thinkingManager: ThinkingManager; // For GoT node processing logic
  private model: BaseModel; // Default model for thinking processes
  private graphProcessor: PlaceholderGraphProcessor; // To be replaced with full GraphProcessor

  // TODO: Executor loop should be started/stopped
  private executionInterval: NodeJS.Timeout | null = null;


  constructor(model: BaseModel, storageProvider?: StorageProvider) {
    this.tasks = new Map<TaskID, Task>();
    this.gotGraphs = new Map<TaskID, ThoughtGraph>();
    this.scheduler = new TaskScheduler();
    this.storageProvider = storageProvider;
    this.model = model; // Needs a default model
    this.thinkingManager = new ThinkingManager(); // Default strategy
    this.graphProcessor = new PlaceholderGraphProcessor();
  }

  async createTask(options: TaskCreationOptions): Promise<Task> { // Changed return type to Promise<Task>
    const taskId = uuidv4();
    const now = Date.now();
    const task: Task = {
      id: taskId,
      description: options.description,
      status: TaskStatus.PENDING,
      priority: options.basePriority ?? 0,
      createdAt: now,
      updatedAt: now,
      nodes: [], // Will be populated by graphProcessor
    };
    this.tasks.set(taskId, task);

    // Create the initial ThoughtGraph and its root GoTNode
    const rootContent = options.rootNodeContent || options.description;
    const graph = await this.graphProcessor.createGraphForTask(task, rootContent);
    this.gotGraphs.set(taskId, graph);
    
    // Add all nodes from the newly created graph to the scheduler
    graph.getAllNodes().forEach(node => {
        // Convert ThoughtNode from graph.ts to GoTNode for scheduler
        const gotNode: GoTNode = this.mapThoughtNodeToGoTNode(node, task.priority);
        this.scheduler.addNodeToSchedule(gotNode);
    });

    console.log(`Task ${taskId} created. Root GoTNode ID: ${task.rootNodeId}`);
    this.startExecutionLoop(); // Ensure executor is running
    return task; // Return the full task object
  }
  
  private mapThoughtNodeToGoTNode(tn: import('../ai/thinking/graph.js').ThoughtNode, baseTaskPriority: number): GoTNode {
    // This is a temporary mapping. GoTNode and ThoughtNode should ideally converge or have a clearer relation.
    // For now, scheduler works with GoTNode from types/task.ts
    // Since graph.ts now uses ThoughtNodeType and TaskStatus from task.ts, direct assignment should work.
    return {
        id: tn.id,
        content: tn.content,
        type: tn.type, // Should be ThoughtNodeType from task.ts now
        dependencies: tn.parents, // ThoughtNode.parents are GoTNode.dependencies
        priority: baseTaskPriority, // Base priority from task, scheduler will compute actual
        status: tn.status, // Should be TaskStatus from task.ts now
        result: tn.result,
        error: tn.error, // GoTNode now has error field
        metadata: {
            createdAt: tn.createdAt,
            updatedAt: tn.updatedAt,
            basePriority: baseTaskPriority,
            ...(tn.metadata || {})
        },
        storage: {}, // Placeholder for storage CIDs
        children: tn.children,
    };
  }


  private async executeNode(node: GoTNode): Promise<void> {
    console.log(`Executing GoTNode ${node.id} (${node.type}): ${node.content.substring(0, 50)}...`);
    const taskGraph = this.findGraphForNode(node.id);
    if (!taskGraph) {
        console.error(`No graph found for node ${node.id}. Cannot execute.`);
        this.scheduler.updateNodePriority(node.id, undefined, { retryCount: (node.metadata.retryCount || 0) + 1 });
        // Consider setting node to FAILED directly in scheduler if graph is missing
        return;
    }

    // 1. IPFS Content Retrieval (Placeholder)
    if (node.storage.instructionsCid && this.storageProvider) {
      // node.content = (await this.storageProvider.get(node.storage.instructionsCid)).toString();
      console.log(`Retrieved instructions for ${node.id} from IPFS: ${node.storage.instructionsCid}`);
    }
    if (node.storage.dataCid && this.storageProvider) {
      // node.inputData = JSON.parse((await this.storageProvider.get(node.storage.dataCid)).toString());
      console.log(`Retrieved data for ${node.id} from IPFS: ${node.storage.dataCid}`);
    }

    try {
      // 2. Execute node logic (using ThinkingManager to process the graph segment)
      // The ThinkingManager.processGraph works on an entire graph.
      // For a single node execution triggered by scheduler, we might need a more targeted call,
      // or ensure ThinkingManager's processGraph can pick up this specific IN_PROGRESS node.
      // The current ThinkingManager.processGraph iterates and processes READY nodes.
      // So, we ensure the graph state is updated, and let TM handle it.
      // This implies TM.processGraph might need to be called within the execution loop,
      // or TM itself runs its own loop and scheduler just signals readiness.
      // For now, let's assume TM.processGraph is the "execution" for the whole graph.
      // The node is already set to PROCESSING by the scheduler.
      // We need to update the graph in ThinkingManager's context if it's not shared directly.
      
      // This is a conceptual simplification:
      // In a real scenario, the ThinkingManager would be invoked to process the *specific node*
      // or the graph would be processed, and this node would be picked up.
      // For now, we simulate that the node's processing via ThinkingManager leads to a result.
      // The actual processing logic is in ThinkingManager's _process<Type>Node methods.
      // We'll update the graph in the ThinkingManager and let its loop run.
      
      // Let's assume ThinkingManager.processGraph is called elsewhere or this is a simplified path.
      // We'll directly update the node after a simulated execution.
      // This part needs refinement on how scheduler and TM interact for single node execution.
      
      // Simulate execution based on node type (placeholder for actual execution logic)
      let result: any = { message: "Processed by TaskManager executor placeholder" };
      if (node.type === ThoughtNodeType.DECOMPOSITION) {
          const newSubNodes = await this.graphProcessor.decomposeNode(node, taskGraph, this.model, this.thinkingManager);
          newSubNodes.forEach(subNode => {
              // subNode.type is already ThoughtNodeType, which graph.addNode now expects.
              taskGraph.addNode(subNode.content, subNode.type, subNode.metadata, subNode.id);
              taskGraph.addChild(node.id, subNode.id); // Link to parent
              this.scheduler.addNodeToSchedule(this.mapThoughtNodeToGoTNode(taskGraph.getNode(subNode.id)!, node.priority));
          });
          result = { decompositionSummary: `Decomposed into ${newSubNodes.length} sub-nodes.`};
      }


      // 3. Result Storage (Placeholder)
      if (result && this.storageProvider) {
        // const resultStr = JSON.stringify(result);
        // if (resultStr.length > 1024) { // Example threshold for IPFS storage
        //   node.storage.resultCid = await this.storageProvider.add(resultStr);
        //   node.result = { $ref: node.storage.resultCid }; // Store reference
        // } else {
        //   node.result = result;
        // }
        node.result = result; // Store inline for now
      } else {
        node.result = result;
      }
      
      node.status = TaskStatus.COMPLETED;
      node.metadata.completedAt = Date.now();
      // node.metadata.executionTimeMs = node.metadata.completedAt - (node.metadata.startedAt || node.metadata.completedAt);
      if(node.metadata.startedAt) {
        node.metadata.executionTimeMs = node.metadata.completedAt - node.metadata.startedAt;
      }


    } catch (error: any) {
      console.error(`Error executing node ${node.id}:`, error);
      node.status = TaskStatus.FAILED;
      node.error = error.message; // GoTNode now has error field
      node.metadata.retryCount = (node.metadata.retryCount || 0) + 1;
      // Implement retry logic here if needed (e.g., re-schedule with lower priority or delay)
    }
    
    // Update node in scheduler's internal map
    this.scheduler.updateNodePriority(node.id, undefined, node.metadata); // This updates the node in scheduler's map
    
    // Notify scheduler about completion/failure to process dependents
    if (node.status === TaskStatus.COMPLETED) {
        this.scheduler.processNodeCompletion(node.id);
    }
    // Check if overall task is complete
    this.checkTaskCompletion(this.findTaskForNode(node.id)?.id);
  }

  private async executionLoop(): Promise<void> {
    const nodeToExecute = this.scheduler.getNextSchedulableNode();
    if (nodeToExecute) {
      await this.executeNode(nodeToExecute);
      // Schedule next iteration of the loop
      // Using setTimeout to avoid blocking and allow other events
      if (this.executionInterval) { // If loop is still meant to be running
          this.executionInterval = setTimeout(() => this.executionLoop(), 0); 
      }
    } else {
      // No tasks currently, wait a bit before checking again or stop loop if idle for too long
      console.log("Scheduler queue empty, pausing execution loop.");
      // For a persistent service, you might use a longer timeout or an event-driven approach
      // For this example, we'll stop if it was started.
      if (this.executionInterval) {
        // this.stopExecutionLoop(); // Or use a backoff
         this.executionInterval = setTimeout(() => this.executionLoop(), 1000); // Check again in 1s
      }
    }
  }

  startExecutionLoop(): void {
    if (!this.executionInterval) {
      console.log("Starting TaskManager execution loop...");
      // Use setImmediate or setTimeout to make it async and non-blocking
      this.executionInterval = setTimeout(() => this.executionLoop(), 0);
    }
  }

  stopExecutionLoop(): void {
    if (this.executionInterval) {
      console.log("Stopping TaskManager execution loop...");
      clearTimeout(this.executionInterval);
      this.executionInterval = null;
    }
  }
  
  private findGraphForNode(nodeId: GoTNodeID): ThoughtGraph | undefined {
    for (const [_taskId, graph] of this.gotGraphs.entries()) {
        if (graph.getNode(nodeId)) { // Assuming ThoughtGraph.getNode uses GoTNodeID
            return graph;
        }
    }
    return undefined;
  }
  
  private findTaskForNode(nodeId: GoTNodeID): Task | undefined {
    for (const task of this.tasks.values()) {
        if (task.nodes.includes(nodeId)) {
            return task;
        }
    }
    return undefined;
  }

  private checkTaskCompletion(taskId?: TaskID): void {
    if (!taskId) return;
    const task = this.tasks.get(taskId);
    if (!task || task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
      return;
    }

    const graph = this.gotGraphs.get(taskId);
    if (!graph) return;

    const rootNode = graph.getNode(task.rootNodeId!); // Assuming rootNodeId is always set
    if (rootNode && rootNode.status === TaskStatus.COMPLETED) {
      task.status = TaskStatus.COMPLETED;
      task.result = rootNode.result;
      task.updatedAt = Date.now();
      console.log(`Task ${taskId} COMPLETED.`);
      // Potentially stop execution loop if no other tasks are active
    } else {
        // Check if all nodes are done (completed or failed) and if any failed
        let allDone = true;
        let hasFailures = false;
        for (const nodeId of task.nodes) {
            const node = this.scheduler.getNode(nodeId) || graph.getNode(nodeId); // Check scheduler first, then graph
            if (!node || (node.status !== TaskStatus.COMPLETED && node.status !== TaskStatus.FAILED)) {
                allDone = false;
                break;
            }
            if (node.status === TaskStatus.FAILED) {
                hasFailures = true;
            }
        }
        if (allDone && hasFailures) {
            task.status = TaskStatus.FAILED;
            task.updatedAt = Date.now();
            console.log(`Task ${taskId} FAILED due to node failures.`);
        } else if (allDone && !task.rootNodeId) { // No root node, but all nodes are done
             task.status = TaskStatus.COMPLETED; // Or derive result differently
             task.updatedAt = Date.now();
             console.log(`Task ${taskId} COMPLETED (all nodes processed).`);
        }
    }
  }

  getTask(taskId: TaskID): Task | undefined {
    return this.tasks.get(taskId);
  }

  getGoTNode(nodeId: GoTNodeID): GoTNode | undefined {
    return this.scheduler.getNode(nodeId); // Get from scheduler as it has the most current state
  }

  // Add listTasks method to the actual TaskManager class
  async listTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }
}
