import { GoTNode, GoTResult, ThoughtNodeType, TaskStatus } from '../../types/task.js';
import { StorageProvider } from '../../types/storage.js';
import { logger } from '../../utils/logger.js';
import { FibonacciHeapScheduler } from '../scheduler/fibonacci-heap-scheduler.js'; 
import { DirectedAcyclicGraph } from './dag.js'; 
import { Agent } from '../../ai/agent/agent.js'; // Import Agent
import { ModelGenerateInput } from '../../types/ai.js'; // Import ModelGenerateInput

interface GoTEngineOptions {
  storage: StorageProvider;
  agent: Agent; // Require Agent instance for LLM and potentially tool access
}

/**
 * Implements the Graph-of-Thought reasoning process.
 * Manages the graph structure, node execution, and result synthesis.
 */
export class GraphOfThoughtEngine {
  private storage: StorageProvider;
  private dag: DirectedAcyclicGraph<GoTNode>; 
  private scheduler: FibonacciHeapScheduler; 
  private agent: Agent; // Store Agent instance

  constructor(options: GoTEngineOptions) {
    logger.debug('Initializing GraphOfThoughtEngine...');
    this.storage = options.storage;
    this.agent = options.agent; // Store agent
    this.dag = new DirectedAcyclicGraph<GoTNode>(); 
    this.scheduler = new FibonacciHeapScheduler({ storage: this.storage, dag: this.dag }); 
    logger.info('GraphOfThoughtEngine initialized.');
  }

  /**
   * Processes a query by building and executing a reasoning graph.
   */
  async processQuery(query: string): Promise<GoTResult> {
    logger.info(`GoT Engine: Processing query: "${query}"`);
    
    // 1. Initialize Graph
    const rootNode = this.createNode(query, ThoughtNodeType.QUESTION);
    this.dag.addNode(rootNode);

    // 2. Decompose Problem
    const subproblemNodes = await this.decomposeProblem(rootNode);
    subproblemNodes.forEach(node => {
       this.dag.addNode(node);
       if (this.dag.hasNode(rootNode.id) && this.dag.hasNode(node.id)) {
           try {
               this.dag.addEdge(rootNode.id, node.id);
               this.scheduler.addTask(node); 
           } catch (error) {
               logger.error(`[GoT] Failed to add edge or task for subproblem ${node.id}:`, error);
           }
       }
    });

    // 3. Execute Graph (Iterative Processing)
    logger.info('[GoT] Starting graph execution loop...');
    let iterations = 0;
    const maxIterations = 10; 

    while (this.scheduler.hasNext() && iterations < maxIterations) { 
       iterations++;
       const nextNodeToProcess = await this.scheduler.getNextTask();
       if (nextNodeToProcess) {
          logger.debug(`[GoT] Iteration ${iterations}: Processing node ${nextNodeToProcess.id} (${nextNodeToProcess.type})`);
          
          const newNodes = await this.processNode(nextNodeToProcess);
          
          logger.debug(`[GoT] Node ${nextNodeToProcess.id} finished processing with status ${nextNodeToProcess.status}.`);

          newNodes.forEach(newNode => {
             if (this.dag.addNode(newNode)) {
                 if (this.dag.hasNode(nextNodeToProcess.id)) {
                     try {
                         this.dag.addEdge(nextNodeToProcess.id, newNode.id);
                         this.scheduler.addTask(newNode); 
                     } catch (error) {
                         logger.error(`[GoT] Failed to add edge or task for new node ${newNode.id}:`, error);
                     }
                 }
             }
          });
          
          // After a node completes, reschedule pending nodes that might now be ready
          if (nextNodeToProcess.status === TaskStatus.COMPLETED) {
             this.scheduler.reschedulePending(); 
          }

       } else {
          logger.warn('[GoT] Scheduler hasNext() is true, but getNextTask() returned null. Breaking loop.');
          break; 
       }
    }
    if (iterations >= maxIterations) {
        logger.warn(`[GoT] Reached max iterations (${maxIterations}).`);
    }
    logger.info('[GoT] Graph execution loop finished.');

    // 4. Synthesize Result
    const finalResult = this.synthesizeResult(this.dag);
    return finalResult;
  }

  // --- Helper Methods ---

  private createNode(content: string, type: ThoughtNodeType, dependencies: string[] = []): GoTNode {
     const newNode: GoTNode = {
        id: `got-node-${Date.now()}-${Math.random().toString(16).slice(2)}`, 
        content: content,
        type: type,
        dependencies: dependencies,
        priority: 5, 
        status: TaskStatus.PENDING,
        metadata: { createdAt: Date.now() },
        storage: {},
     };
     logger.debug(`Created GoT Node: ${newNode.id} (${newNode.type})`);
     return newNode;
  }

  /** Uses LLM (via Agent) to decompose a problem node. */
  private async decomposeProblem(node: GoTNode): Promise<GoTNode[]> {
     logger.debug(`[GoT] Decomposing node ${node.id}: "${node.content}"`);
     const prompt = `Decompose the following task into smaller, manageable sub-steps or questions:\nTask: ${node.content}\n\nSub-steps (one per line):`;
     const modelInput: ModelGenerateInput = { prompt: prompt, maxTokens: 200 }; 
     
     try {
        const modelOutput = await this.agent.model.generate(modelInput); // Use agent's public model
        if (modelOutput.status === 'success') {
           const subSteps = modelOutput.content.split('\n').map(s => s.trim()).filter(s => s.length > 0);
           logger.info(`[GoT] Decomposition generated ${subSteps.length} sub-steps for node ${node.id}.`);
           return subSteps.map(step => this.createNode(step, ThoughtNodeType.ANALYSIS, [node.id])); 
        } else {
           logger.error(`[GoT] LLM failed to decompose node ${node.id}: ${modelOutput.error}`);
           return [];
        }
     } catch (error) {
        logger.error(`[GoT] Error during LLM call for decomposition of node ${node.id}:`, error);
        return [];
     }
  }

  /** Processes a single node based on its type. */
  private async processNode(node: GoTNode): Promise<GoTNode[]> {
     logger.debug(`[GoT] Processing node ${node.id} of type ${node.type}`);
     let resultText = `Placeholder result for node ${node.id} (${node.type})`;
     let newNodes: GoTNode[] = [];

     try {
        switch(node.type) {
            case ThoughtNodeType.QUESTION:
            case ThoughtNodeType.DECOMPOSITION: 
            case ThoughtNodeType.ANALYSIS: 
                const analysisPrompt = `Analyze the following statement/question and provide insights or an answer:\n${node.content}`;
                const modelInput: ModelGenerateInput = { prompt: analysisPrompt, maxTokens: 300 };
                const modelOutput = await this.agent.model.generate(modelInput); // Use agent's public model
                if (modelOutput.status === 'success') {
                    resultText = modelOutput.content;
                } else {
                    throw new Error(modelOutput.error || 'LLM analysis failed');
                }
                break;
            case ThoughtNodeType.RESEARCH:
                logger.info(`[GoT] Research node type processing: Attempting tool execution.`);
                // Assume the node content is the query for the search tool
                const searchQuery = node.content; 
                // Determine which tool to use (e.g., 'search' or fallback to 'echo')
                const toolToUse = this.agent.getTool('search') ? 'search' : 'echo';
                const toolInput = toolToUse === 'search' ? { query: searchQuery } : { message: searchQuery }; 
                
                logger.debug(`[GoT] Calling tool '${toolToUse}' for research node ${node.id}`);
                try {
                    // Use the agent's public executeTool method
                    const toolResult = await this.agent.executeTool(toolToUse, toolInput, node.id /* Pass node id as taskId? */); 
                    resultText = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
                    logger.info(`[GoT] Research node ${node.id} completed via tool '${toolToUse}'.`);
                } catch (toolError: any) {
                     logger.error(`[GoT] Tool execution for research node ${node.id} failed: ${toolError.message}`);
                     resultText = `Tool execution failed: ${toolError.message}`;
                     throw toolError; // Re-throw to mark node as FAILED
                }
                break;
            case ThoughtNodeType.SYNTHESIS:
                const depResults = await this.getDependencyResults(node.dependencies);
                if (depResults.some(r => r.startsWith('[Result for'))) {
                   throw new Error('Cannot synthesize result due to unavailable dependencies.');
                }
                const synthesisPrompt = `Synthesize the following information:\n${depResults.join('\n---\n')}\n\nSynthesis:`;
                const synthInput: ModelGenerateInput = { prompt: synthesisPrompt, maxTokens: 400 };
                const synthOutput = await this.agent.model.generate(synthInput); // Use agent's public model
                 if (synthOutput.status === 'success') {
                    resultText = synthOutput.content;
                } else {
                    throw new Error(synthOutput.error || 'LLM synthesis failed');
                }
                break;
            case ThoughtNodeType.CONCLUSION:
                resultText = node.content; 
                break;
            default:
                logger.warn(`[GoT] Unknown node type encountered: ${node.type}`);
                resultText = `Cannot process unknown node type: ${node.type}`;
        }
        node.result = resultText;
        node.status = TaskStatus.COMPLETED; 
     } catch (error: any) {
         logger.error(`[GoT] Error processing node ${node.id}:`, error);
         node.status = TaskStatus.FAILED;
         node.result = `Error: ${error.message}`; 
     }
     
     node.metadata.completedAt = Date.now();
     node.metadata.executionTimeMs = node.metadata.completedAt - (node.metadata.startedAt ?? node.metadata.completedAt);
     
     return newNodes; 
  }

  /** Helper to get results from dependency nodes */
  private async getDependencyResults(depIds: string[]): Promise<string[]> {
      const results: string[] = [];
      for (const id of depIds) {
          const depNode = this.dag.getNode(id);
          if (depNode && depNode.status === TaskStatus.COMPLETED) {
              results.push(depNode.result || depNode.content); 
          } else {
              logger.warn(`[GoT] Dependency ${id} not found or not completed for synthesis.`);
              results.push(`[Result for ${id} unavailable]`);
          }
      }
      return results;
  }

  /** Synthesizes the final result from the completed graph. */
  private synthesizeResult(dag: DirectedAcyclicGraph<GoTNode>): GoTResult {
     logger.info('[GoT] Synthesizing final result...');
     
     const conclusionNodes: GoTNode[] = [];
     const terminalCompletedNodes: GoTNode[] = [];
     
     const allNodes = Array.from((dag as any).nodes.values()).map((n: any) => n.data as GoTNode); 

     for (const node of allNodes) {
        if (node.status === TaskStatus.COMPLETED) {
            if (node.type === ThoughtNodeType.CONCLUSION) {
                conclusionNodes.push(node);
            }
            const successors = dag.getSuccessors(node.id);
            if (!successors || successors.size === 0) {
                terminalCompletedNodes.push(node);
            }
        }
     }

     let finalNodes: GoTNode[];
     if (conclusionNodes.length > 0) {
         logger.debug(`[GoT] Found ${conclusionNodes.length} CONCLUSION nodes.`);
         finalNodes = conclusionNodes; 
     } else if (terminalCompletedNodes.length > 0) {
         logger.debug(`[GoT] No CONCLUSION nodes found. Using ${terminalCompletedNodes.length} terminal completed nodes.`);
         finalNodes = terminalCompletedNodes; 
     } else {
         logger.warn("[GoT] No CONCLUSION or terminal completed nodes found for synthesis.");
         const latestCompleted = allNodes
             .filter(n => n.status === TaskStatus.COMPLETED && n.metadata.completedAt)
             .sort((a, b) => b.metadata.completedAt! - a.metadata.completedAt!);
         if (latestCompleted.length > 0) {
             logger.warn("[GoT] Falling back to latest completed node for synthesis.");
             finalNodes = [latestCompleted[0]];
         } else {
             return { finalAnswer: 'Could not determine a final answer. No completed nodes found.', relevantNodes: [] };
         }
     }

     // Simple synthesis: join results of the selected final nodes
     const finalAnswer = finalNodes.map(n => n.result || n.content).join('\n');
     
     logger.info(`[GoT] Synthesis complete.`);
     return { 
         finalAnswer: finalAnswer, 
         relevantNodes: finalNodes 
     };
  }
}
