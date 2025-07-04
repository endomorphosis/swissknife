// src/ai/thinking/manager.ts
import { ThoughtGraph, ThoughtNode } from './graph.js';
import { GoTNodeType, GoTNodeStatus } from '../tasks/graph/node'; // Import unified enums
import { IModel, Tool } from '../types/ai'; // Use IModel interface and Zod-based Tool
import { v4 as uuidv4 } from 'uuid';

// Placeholder for LLM interaction result
interface LLMGenerationResult {
  content: string;
  // Potentially other metadata like confidence, tokens used, etc.
}

// Assuming Model class will have a method like:
// interface Model {
//   generate(options: { prompt: string; /* other params */ }): Promise<LLMGenerationResult>;
// }


export interface NodeProcessorInput {
  node: ThoughtNode;
  graph: ThoughtGraph;
  model: IModel; // Changed to IModel
  strategy: ReasoningStrategyType; // Added for Phase 3 Reasoning Strategies
  // Potentially access to tools or other context
}

export enum ReasoningStrategyType {
  SIMPLE_SEQUENTIAL = 'simpleSequential', // Default, processes existing graph
  DEPTH_FIRST_EXPANSION = 'depthFirstExpansion', // Actively expands graph depth-wise
  BREADTH_FIRST_EXPANSION = 'breadthFirstExpansion', // Actively expands graph breadth-wise
}

export interface ThinkingManagerOptions {
  strategy?: ReasoningStrategyType;
}

export class ThinkingManager {
  private strategy: ReasoningStrategyType;

  constructor(options?: ThinkingManagerOptions) {
    this.strategy = options?.strategy || ReasoningStrategyType.SIMPLE_SEQUENTIAL;
  }

  setStrategy(strategy: ReasoningStrategyType): void {
    this.strategy = strategy;
  }

  async createThinkingGraph(initialContent: string, _model: IModel, rootId?: string): Promise<ThoughtGraph> { // Changed to IModel
    const graph = new ThoughtGraph();
    const newRootId = rootId || uuidv4();
    graph.addNode(initialContent, ThoughtNodeType.QUESTION, {}, newRootId); // Use ThoughtNodeType
    // The root node is initially PENDING. processGraph will pick it up.
    return graph;
  }

  private async _isNodeReady(nodeId: string, graph: ThoughtGraph): Promise<boolean> {
    const node = graph.getNode(nodeId);
    if (!node || node.status !== GoTNodeStatus.PENDING) { // Use GoTNodeStatus
      return false; // Only pending nodes can become ready
    }
    if (node.parents.length === 0) {
      return true; // Root nodes or nodes with no explicit parents are ready
    }
    for (const parentId of node.parents) {
      const parentNode = graph.getNode(parentId);
      if (!parentNode || parentNode.status !== GoTNodeStatus.COMPLETED) { // All parents must be completed
        return false; // All parents must be completed
      }
    }
    return true;
  }

  async processGraph(graph: ThoughtGraph, model: IModel): Promise<ThoughtGraph> { // Changed to IModel
    let changedInIteration = true;
    const processingOrder = graph.topologicalSort();

    if (!processingOrder) {
      console.error("Graph has cycles, cannot process.");
      // Optionally, find a root or entry node and try to process from there if possible
      // Or mark graph as failed. For now, just return.
      return graph;
    }
    
    // Iterate multiple times if processing one node makes others ready
    // A more robust system might use an event queue or a more sophisticated scheduler
    while(changedInIteration) {
        changedInIteration = false;
        for (const currentNode of processingOrder) {
            if (currentNode.status === GoTNodeStatus.PENDING) { // Use GoTNodeStatus
                if (await this._isNodeReady(currentNode.id, graph)) {
                    graph.setNodeStatus(currentNode.id, GoTNodeStatus.PENDING); // Changed to PENDING, as SCHEDULED is not in GoTNodeStatus
                    changedInIteration = true;
                }
            }

            if (currentNode.status === GoTNodeStatus.PENDING) { // Changed to PENDING
                graph.setNodeStatus(currentNode.id, GoTNodeStatus.IN_PROGRESS); // Changed to IN_PROGRESS
                changedInIteration = true; // Status changed

                try {
                    let result: any;
                    // Get the latest state of the node for processing
                    const nodeToProcess = graph.getNode(currentNode.id);
                    if (!nodeToProcess) continue; // Should not happen if just set to IN_PROGRESS

                    const processorInput: NodeProcessorInput = {
                        node: nodeToProcess,
                        graph,
                        model,
                        strategy: this.strategy,
                    };

                    switch (nodeToProcess.type) {
                        case GoTNodeType.QUESTION: // Use GoTNodeType
                            result = await this._processQuestionNode(processorInput);
                            break;
                        case GoTNodeType.HYPOTHESIS: // Use GoTNodeType
                            result = await this._processHypothesisNode(processorInput);
                            break;
                        case GoTNodeType.RESEARCH: // Use GoTNodeType
                            result = await this._processResearchNode(processorInput);
                            break;
                        case GoTNodeType.ANALYSIS: // Use GoTNodeType
                            result = await this._processAnalysisNode(processorInput);
                            break;
                        case GoTNodeType.ANSWER: // Use GoTNodeType.ANSWER for CONCLUSION
                            result = await this._processConclusionNode(processorInput);
                            break;
                        case GoTNodeType.THOUGHT: // Use GoTNodeType.THOUGHT for DECOMPOSITION
                            result = await this._processDecompositionNode(processorInput);
                            break;
                        case GoTNodeType.SYNTHESIS: // Use GoTNodeType
                            result = await this._processSynthesisNode(processorInput);
                            break;
                        default:
                            console.warn(`Unknown node type: ${nodeToProcess.type}`);
                            graph.setNodeStatus(nodeToProcess.id, GoTNodeStatus.FAILED, `Unknown node type: ${nodeToProcess.type}`); // Use GoTNodeStatus
                            continue;
                    }
                    graph.setNodeResult(nodeToProcess.id, result);
                } catch (error: any) {
                    console.error(`Error processing node ${currentNode.id}:`, error);
                    graph.setNodeStatus(currentNode.id, GoTNodeStatus.FAILED, error.message || 'Unknown error'); // Use GoTNodeStatus
                }
                changedInIteration = true; // Status changed to COMPLETED or FAILED
            }
        }
    }
    return graph;
  }

  // --- Specialized Node Processors (Placeholders) ---
  // These would typically involve LLM calls, data processing, tool use, etc.

  private async _simulateLLMCall(prompt: string, model: IModel): Promise<LLMGenerationResult> { // Changed to IModel
    console.log(`Simulating LLM call for prompt: "${prompt.substring(0, 100)}..."`);
    // In a real scenario: return await model.generate({ prompt });
    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate network latency
    if (prompt.toLowerCase().includes("decompose") || prompt.toLowerCase().includes("sub-tasks")) {
        return { content: JSON.stringify([`Sub-task A for ${model.getName()}`, `Sub-task B for ${model.getName()}`]) };
    }
    return { content: `Simulated LLM response to: ${prompt.substring(0,50)}...` };
  }

  private async _processQuestionNode(input: NodeProcessorInput): Promise<any> {
    const { node, graph, model, strategy } = input;
    console.log(`Processing Question Node: ${node.id} (${strategy}) - ${node.content}`);
    
    let generatedHypotheses: string[] = [];
    // Simulate LLM call to generate hypotheses or sub-questions
    const llmPrompt = `Given the question: "${node.content}", generate potential hypotheses or sub-questions to explore.`;
    const llmResult = await this._simulateLLMCall(llmPrompt, model);
    try {
        // Assuming LLM might return a JSON array of strings for multiple hypotheses
        const parsedContent = JSON.parse(llmResult.content);
        if (Array.isArray(parsedContent)) {
            generatedHypotheses = parsedContent.map(item => String(item));
        } else {
            generatedHypotheses = [llmResult.content];
        }
    } catch (e) {
        generatedHypotheses = [llmResult.content]; // Fallback if not JSON
    }

    if (generatedHypotheses.length === 0) generatedHypotheses.push("Explore further.");


    switch (strategy) {
      case ReasoningStrategyType.DEPTH_FIRST_EXPANSION:
        // Create one HYPOTHESIS child to explore deeply
        const hypothesisNode = graph.addNode(generatedHypotheses[0], ThoughtNodeType.HYPOTHESIS, node.metadata);
        graph.addChild(node.id, hypothesisNode.id);
        break;
      case ReasoningStrategyType.BREADTH_FIRST_EXPANSION:
        // Create multiple HYPOTHESIS children for parallel exploration
        generatedHypotheses.forEach(hypoText => {
          const childNode = graph.addNode(hypoText, ThoughtNodeType.HYPOTHESIS, node.metadata);
          graph.addChild(node.id, childNode.id);
        });
        break;
      case ReasoningStrategyType.SIMPLE_SEQUENTIAL:
      default:
        // Simple: just mark as processed, or generate one simple next step (e.g. analysis)
        const analysisNode = graph.addNode(`Analyze: ${node.content}`, ThoughtNodeType.ANALYSIS, node.metadata);
        graph.addChild(node.id, analysisNode.id);
        break;
    }
    return { processedContent: `Expanded question with ${generatedHypotheses.length} new paths using ${strategy}.` };
  }

  private async _processHypothesisNode(input: NodeProcessorInput): Promise<any> {
    const { node, graph, model, strategy } = input;
    console.log(`Processing Hypothesis Node: ${node.id} (${strategy}) - ${node.content}`);
    // Example: Plan research steps (create RESEARCH child nodes)
    const researchPrompt = `To validate/invalidate the hypothesis: "${node.content}", what research steps are needed?`;
    const llmResult = await this._simulateLLMCall(researchPrompt, model);
    // For simplicity, create one research node
    const researchNode = graph.addNode(`Research for: ${node.content} (based on LLM: ${llmResult.content.substring(0,30)}...)`, ThoughtNodeType.RESEARCH, node.metadata);
    graph.addChild(node.id, researchNode.id);
    return { validationPlan: `Created research node ${researchNode.id}` };
  }

  private async _processResearchNode(input: NodeProcessorInput): Promise<any> {
    const { node, graph, model, strategy } = input;
    console.log(`Processing Research Node: ${node.id} (${strategy}) - ${node.content}`);
    // Example: Simulate executing a search query or data retrieval.
    // This is where a tool might be identified and used by the Agent later.
    // For now, simulate finding some data.
    const researchData = await this._simulateLLMCall(`Simulate research findings for: "${node.content}"`, model);
    // Create an ANALYSIS child node
    const analysisNode = graph.addNode(`Analyze data for: ${node.content}`, ThoughtNodeType.ANALYSIS, node.metadata);
    graph.addChild(node.id, analysisNode.id);
    // Store the "found" data in the research node's result.
    return { researchData: researchData.content, nextStepNodeId: analysisNode.id };
  }

  private async _processAnalysisNode(input: NodeProcessorInput): Promise<any> {
    const { node, graph, model, strategy } = input;
    console.log(`Processing Analysis Node: ${node.id} (${strategy}) - ${node.content}`);
    // Example: Analyze data from parent (RESEARCH) nodes.
    let dataToAnalyze = `Analysis of: ${node.content}. `;
    node.parents.forEach(parentId => {
        const parent = graph.getNode(parentId);
        if(parent && parent.result?.researchData) {
            dataToAnalyze += `Parent ${parentId} found: ${parent.result.researchData}. `;
        }
    });
    const analysisResult = await this._simulateLLMCall(`Summarize and analyze: "${dataToAnalyze}"`, model);
    return { analysisSummary: analysisResult.content };
  }

  private async _processConclusionNode(input: NodeProcessorInput): Promise<any> {
    const { node, graph, model, strategy } = input;
    console.log(`Processing Conclusion Node: ${node.id} (${strategy}) - ${node.content}`);
    // Example: Formulate a final answer based on parent (ANALYSIS) nodes.
    let basisForConclusion = `Conclusion based on: ${node.content}. `;
     node.parents.forEach(parentId => {
        const parent = graph.getNode(parentId);
        if(parent && parent.result?.analysisSummary) {
            basisForConclusion += `From analysis ${parentId}: ${parent.result.analysisSummary}. `;
        }
    });
    const finalConclusion = await this._simulateLLMCall(`Formulate conclusion from: "${basisForConclusion}"`, model);
    return { finalConclusion: finalConclusion.content };
  }
  
  private async _processDecompositionNode(input: NodeProcessorInput): Promise<any> {
    const { node, graph, model, strategy } = input;
    console.log(`Processing Decomposition Node: ${node.id} (${strategy}) - ${node.content}`);
    // This node type is intended to be handled by GraphProcessor.
    // However, ThinkingManager might initiate it or use GraphProcessor as a tool/service.
    // For now, let's assume it generates a few sub-questions.
    const llmPrompt = `Decompose the task: "${node.content}" into smaller, distinct sub-questions.`;
    const llmResult = await this._simulateLLMCall(llmPrompt, model);
    let subQuestions: string[] = [];
     try {
        const parsed = JSON.parse(llmResult.content);
        if(Array.isArray(parsed)) subQuestions = parsed.map(String);
        else subQuestions = [llmResult.content];
    } catch { subQuestions = [llmResult.content]; }

    subQuestions.forEach(qText => {
        const subNode = graph.addNode(qText, ThoughtNodeType.QUESTION, node.metadata);
        graph.addChild(node.id, subNode.id);
    });
    return { decompositionResult: `Decomposed into ${subQuestions.length} sub-questions.` };
  }

  private async _processSynthesisNode(input: NodeProcessorInput): Promise<any> {
    const { node, graph, model, strategy } = input;
    console.log(`Processing Synthesis Node: ${node.id} (${strategy}) - ${node.content}`);
    let combinedResults = "";
    for (const parentId of node.parents) {
        const parentNode = graph.getNode(parentId);
        if (parentNode && parentNode.result) {
            combinedResults += JSON.stringify(parentNode.result) + "\n";
        }
    }
    const synthesisPrompt = `Synthesize the following information into a coherent summary for "${node.content}":\n${combinedResults}`;
    const llmResult = await this._simulateLLMCall(synthesisPrompt, model);
    return { synthesizedOutput: llmResult.content };
  }


  identifyTools(graph: ThoughtGraph, availableTools: Tool<any>[]): Array<{name: string, args: any}> { // Changed Tool[] to Tool<any>[]
    const toolRequests: Array<{name: string, args: any}> = [];
    // This logic might need to be more sophisticated, perhaps looking at specific
    // node types (e.g., RESEARCH nodes) or specific content patterns.
    graph.traverse((node: ThoughtNode, _depth: number) => {
      if (node.status === GoTNodeStatus.COMPLETED && node.result && typeof node.result.requestTool === 'string') { // Use GoTNodeStatus
        // A node's result might explicitly request a tool
        const toolName = node.result.requestTool;
        const toolArgs = node.result.toolArgs || {};
        if (availableTools.find(t => t.name === toolName)) {
          toolRequests.push({ name: toolName, args: toolArgs });
        }
      } else {
        // Original simple check (can be refined or removed)
        for (const tool of availableTools) {
          if (node.content.toLowerCase().includes(`use tool ${tool.name.toLowerCase()}`)) {
            // Basic argument extraction - needs significant improvement for real use
            const argMatch = node.content.match(new RegExp(`use tool ${tool.name.toLowerCase()}\\s*(?:with\\s*(.*?))?(?:for\\s*(.*?))?$`, 'i'));
            let args: any = {};
            if (argMatch && argMatch[1]) {
                try {
                    args = JSON.parse(argMatch[1]);
                } catch (e) {
                    args = { rawArgs: argMatch[1]}; // Fallback
                }
            } else if (argMatch && argMatch[2]) {
                 args = { query: argMatch[2]}; // Fallback for "for..."
            }
            toolRequests.push({ name: tool.name, args });
          }
        }
      }
    });
    return toolRequests;
  }

  async generateResponse(
    graph: ThoughtGraph, 
    _model: IModel, // Changed to IModel, may not be needed if response is synthesized from graph
    toolResults?: import('../../types/ai.js').ToolCallResult[] // Changed to use ToolCallResult[]
  ): Promise<string> {
    // Find a "CONCLUSION" node or the root node if no conclusion.
    // Or synthesize from multiple completed nodes.
    let finalContent = "Could not determine a final response from the thought process.";
    const rootNode = graph.getRoot();

    const conclusionNodes = graph.getAllNodes().filter((n: ThoughtNode) => n.type === ThoughtNodeType.CONCLUSION && n.status === TaskStatus.COMPLETED); // Use ThoughtNodeType and TaskStatus
    
    if (conclusionNodes.length > 0) {
        // Simple: take the first completed conclusion node's result
        finalContent = `Conclusion: ${JSON.stringify(conclusionNodes[0].result)}`;
    } else if (rootNode && rootNode.status === GoTNodeStatus.COMPLETED) { // Use GoTNodeStatus
        finalContent = `Result: ${JSON.stringify(rootNode.result)}`;
    } else {
        // Fallback: try to find any completed node
        const completedNodes = graph.getAllNodes().filter((n: ThoughtNode) => n.status === GoTNodeStatus.COMPLETED); // Use GoTNodeStatus
        if (completedNodes.length > 0) {
            finalContent = `Processed: ${JSON.stringify(completedNodes[completedNodes.length -1].result)}`;
        }
    }
    // Incorporate tool results if any (this part needs more thought on how tools integrate with graph nodes)
    if (toolResults && toolResults.length > 0) {
        finalContent += "\n\nTool Results:\n" + toolResults.map(tr => `${tr.toolName}: ${tr.result || tr.error}`).join("\n"); // Use tr.toolName
    }

    return finalContent;
  }
}
