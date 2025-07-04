// src/tasks/graph/processor.ts
import { 
    ThoughtGraph, 
    ThoughtNode as ThinkingThoughtNode // This is the node from ai/thinking/graph.js
} from '../ai/thinking/graph'; 
import { 
    GoTNode, // This is the schedulable node from types/task.js
    // GoTNodeID, // Now from common.js
    ThoughtNodeType, // Unified enum
    TaskStatus     // Unified enum
} from '../types/task';
import { GoTNodeID } from '../types/common'; // Corrected import
import { Model } from '../ai/models/model';
import { ThinkingManager, ReasoningStrategyType } from '../ai/thinking/manager';
import { v4 as uuidv4 } from 'uuid';

export enum DecompositionStrategy {
  SIMPLE_LIST = 'simpleList', // e.g., LLM generates a list of sub-steps
  RECURSIVE = 'recursive',    // Sub-tasks can themselves be decomposed
  DOMAIN_SPECIFIC = 'domainSpecific', // Uses pre-defined templates or rules
}

export interface DecompositionOptions {
  strategy?: DecompositionStrategy;
  maxDepth?: number; // For recursive strategy
  // Other strategy-specific options
}

export class GraphProcessor {
  private thinkingManager: ThinkingManager; // For LLM-driven decomposition

  constructor(model: Model) {
    // GraphProcessor might need its own ThinkingManager instance or share one.
    // If it uses LLM for decomposition, it needs a model.
    this.thinkingManager = new ThinkingManager({ strategy: ReasoningStrategyType.SIMPLE_SEQUENTIAL });
    // Potentially set a specific strategy for decomposition tasks if needed
    // this.thinkingManager.setStrategy(ReasoningStrategyType.DEPTH_FIRST_EXPANSION); 
  }

  /**
   * Decomposes a given node within a ThoughtGraph into sub-nodes (children).
   * @param parentNode The GoTNode (from types/task.js) to decompose.
   * @param graph The ThoughtGraph instance where new nodes will be added.
   * @param model The AI model to use for LLM-driven decomposition.
   * @param options Decomposition options including strategy.
   * @returns A promise that resolves to an array of the newly created child GoTNodes.
   */
  async decomposeNode(
    parentNode: GoTNode, 
    graph: ThoughtGraph, 
    model: Model, 
    options?: DecompositionOptions
  ): Promise<GoTNode[]> {
    const strategy = options?.strategy || DecompositionStrategy.SIMPLE_LIST;
    const parentThinkingNode = graph.getNode(parentNode.id); // Get the node from the graph context

    if (!parentThinkingNode) {
        throw new Error(`Parent node ${parentNode.id} not found in the provided graph.`);
    }
    
    console.log(`Decomposing node ${parentNode.id} using strategy: ${strategy}`);
    graph.setNodeStatus(parentNode.id, TaskStatus.PROCESSING); // Mark parent as being processed for decomposition

    let newSubNodes: ThinkingThoughtNode[] = [];

    try {
      switch (strategy) {
        case DecompositionStrategy.SIMPLE_LIST:
          newSubNodes = await this._simpleListDecomposition(parentThinkingNode, graph, model, options);
          break;
        case DecompositionStrategy.RECURSIVE:
          // Recursive might be handled by the nature of GoT, where sub-nodes can also be DECOMPOSITION type.
          // For now, let it be similar to simple list.
          newSubNodes = await this._simpleListDecomposition(parentThinkingNode, graph, model, options);
          console.warn("Recursive decomposition strategy not fully implemented, using simple list.");
          break;
        // Add other strategies here
        default:
          console.warn(`Unknown decomposition strategy: ${strategy}. Using SIMPLE_LIST.`);
          newSubNodes = await this._simpleListDecomposition(parentThinkingNode, graph, model, options);
      }

      // Link new sub-nodes to the parent and update parent status
      newSubNodes.forEach(subNode => {
        graph.addChild(parentNode.id, subNode.id);
      });
      graph.setNodeResult(parentNode.id, { decompositionResult: `Decomposed into ${newSubNodes.length} sub-nodes.` });
      // Parent node (decomposition task itself) is now COMPLETED. Sub-nodes are PENDING.
      // The main ThinkingManager.processGraph loop will pick up these new PENDING sub-nodes.

    } catch (error: any) {
        console.error(`Error during decomposition of node ${parentNode.id}:`, error);
        graph.setNodeStatus(parentNode.id, TaskStatus.FAILED, error.message || "Decomposition failed");
        return []; // Return empty array on failure
    }
    
    // Map ThinkingThoughtNode back to GoTNode for the return type, if needed by caller.
    // However, the primary effect is modifying the graph.
    // The caller (TaskManager) will likely re-fetch nodes from graph or scheduler.
    return newSubNodes.map(tn => this.mapThinkingNodeToGoTNode(tn, parentNode.priority));
  }

  private async _simpleListDecomposition(
    parentThinkingNode: ThinkingThoughtNode,
    graph: ThoughtGraph,
    model: Model,
    options?: DecompositionOptions
  ): Promise<ThinkingThoughtNode[]> {
    const newNodes: ThinkingThoughtNode[] = [];
    // Simulate LLM call to get sub-tasks
    // const prompt = `Decompose the following task into a list of smaller, actionable sub-tasks: "${parentThinkingNode.content}"`;
    // const llmResponse = await model.generate({ prompt }); // Assuming model.generate exists
    // const subTaskDescriptions = JSON.parse(llmResponse.content); // Assuming LLM returns JSON array of strings

    // Placeholder sub-tasks
    const subTaskDescriptions = [
      `Sub-task 1 for: ${parentThinkingNode.content.substring(0,20)}...`,
      `Sub-task 2 for: ${parentThinkingNode.content.substring(0,20)}...`,
    ];

    for (const desc of subTaskDescriptions) {
      // Determine type of sub-node, e.g., QUESTION or a more specific task type
      const subNodeType = ThoughtNodeType.QUESTION; // Default, could be more intelligent
      const newNode = graph.addNode(desc, subNodeType, { basePriority: parentThinkingNode.metadata?.basePriority });
      newNodes.push(newNode);
    }
    return newNodes;
  }
  
  // Helper to map, assuming GoTNode is the primary schedulable/interface type
  private mapThinkingNodeToGoTNode(tn: ThinkingThoughtNode, baseTaskPriority: number): GoTNode {
    return {
        id: tn.id,
        content: tn.content,
        type: tn.type, 
        dependencies: tn.parents,
        priority: tn.metadata?.basePriority ?? baseTaskPriority, 
        status: tn.status, 
        result: tn.result,
        error: tn.error,
        metadata: {
            createdAt: tn.createdAt,
            updatedAt: tn.updatedAt,
            basePriority: tn.metadata?.basePriority ?? baseTaskPriority,
            ...tn.metadata
        },
        storage: { // Assuming new nodes don't have CIDs yet
            instructionsCid: tn.contentCid, 
            dataCid: undefined, // Or map from tn.metadata if applicable
            resultCid: tn.resultCid,
        },
        children: tn.children,
    };
  }

  // This was from Phase 2, might be deprecated or adapted if TaskManager creates initial graph directly
  // async createGraphForTask(task: Task): Promise<ThoughtGraph> {
  //   const graph = new ThoughtGraph();
  //   const rootNode = graph.addNode(task.description, ThoughtNodeType.QUESTION, { basePriority: task.priority }, task.rootNodeId || uuidv4());
  //   task.rootNodeId = rootNode.id;
  //   // This graph is initially empty beyond the root. Decomposition would populate it.
  //   return graph;
  // }
}
