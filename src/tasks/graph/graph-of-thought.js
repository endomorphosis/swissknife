// src/tasks/graph/graph-of-thought.js
import { ThoughtNodeType, TaskStatus } from '../types/task';
import { logger } from '../utils/logger';
import { FibonacciHeapScheduler } from '../scheduler/fibonacci-heap-scheduler'; 
import { DirectedAcyclicGraph } from './dag.js'; 

/**
 * Implements the Graph-of-Thought reasoning process.
 * Manages the graph structure, node execution, and result synthesis.
 */
export class GraphOfThoughtEngine {
  /**
   * Create a new Graph-of-Thought engine
   * @param {Object} options - Configuration options
   * @param {Object} options.storage - Storage provider
   * @param {Object} options.agent - Agent for reasoning
   */
  constructor(options) {
    logger.debug('Initializing GraphOfThoughtEngine...');
    this.storage = options.storage;
    this.agent = options.agent;
    this.dag = new DirectedAcyclicGraph(); 
    this.scheduler = new FibonacciHeapScheduler({ storage: this.storage, dag: this.dag }); 
    logger.info('GraphOfThoughtEngine initialized.');
  }

  /**
   * Processes a query by building and executing a reasoning graph.
   * @param {string} query - The input query to process
   * @returns {Promise<Object>} - The result of processing
   */
  async processQuery(query) {
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
          logger.error(`Failed to connect node ${node.id} to root: ${error.message}`);
        }
      }
    });

    // 3. Execute Graph
    await this.executeGraph();
    
    // 4. Synthesize Results
    return await this.synthesizeResult();
  }

  /**
   * Creates a node with the given content and type
   * @private
   * @param {string} content - The node content
   * @param {string} type - The node type
   * @param {Object} options - Additional node options
   * @returns {Object} The created node
   */
  createNode(content, type, options = {}) {
    const id = `node-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    return {
      id,
      content,
      type,
      dependencies: options.dependencies || [],
      priority: options.priority || 5,
      status: options.status || TaskStatus.PENDING,
      metadata: {
        createdAt: Date.now(),
        ...options.metadata
      },
      storage: {}
    };
  }

  /**
   * Decomposes a problem into subproblems
   * @private
   * @param {Object} rootNode - The root problem node
   * @returns {Promise<Array>} List of subproblem nodes
   */
  async decomposeProblem(rootNode) {
    logger.info(`Decomposing problem: ${rootNode.content.substring(0, 50)}...`);
    
    try {
      // Use the agent to decompose the problem
      const decompositionPrompt = `Decompose the following problem into 3-5 subproblems:
      
Problem: ${rootNode.content}

Output a JSON array of subproblems, each with a title and description.`;
      
      const response = await this.agent.generate(decompositionPrompt);
      
      // Parse the response to extract subproblems
      const subproblemsText = response.content;
      let subproblems = [];
      
      try {
        // Try to parse as JSON
        const startIdx = subproblemsText.indexOf('[');
        const endIdx = subproblemsText.lastIndexOf(']') + 1;
        
        if (startIdx >= 0 && endIdx > startIdx) {
          const jsonText = subproblemsText.substring(startIdx, endIdx);
          subproblems = JSON.parse(jsonText);
        } else {
          // Fallback: extract line by line
          const lines = subproblemsText.split('\n').filter(line => line.trim().startsWith('-'));
          subproblems = lines.map(line => ({
            title: line.replace('-', '').trim(),
            description: line
          }));
        }
      } catch (error) {
        logger.error(`Failed to parse subproblems: ${error.message}`);
        // Fallback to simple extraction
        subproblems = [
          { title: 'Analysis', description: 'Analyze the problem' },
          { title: 'Solution', description: 'Develop a solution' },
          { title: 'Evaluation', description: 'Evaluate the solution' }
        ];
      }
      
      // Convert to nodes
      return subproblems.map(subproblem => this.createNode(
        `${subproblem.title}: ${subproblem.description}`,
        ThoughtNodeType.ANALYSIS,
        { 
          dependencies: [rootNode.id],
          priority: 3
        }
      ));
    } catch (error) {
      logger.error(`Error in problem decomposition: ${error.message}`);
      // Return a basic fallback decomposition
      return [
        this.createNode('Analyze the problem', ThoughtNodeType.ANALYSIS, { dependencies: [rootNode.id] }),
        this.createNode('Generate solution approach', ThoughtNodeType.SOLUTION, { dependencies: [rootNode.id] })
      ];
    }
  }

  /**
   * Execute the reasoning graph
   * @private
   * @returns {Promise<void>}
   */
  async executeGraph() {
    logger.info('Executing reasoning graph...');
    
    // Process nodes until there are no more pending/scheduled nodes
    while (this.hasUnresolvedNodes()) {
      const nextNode = await this.scheduler.getNextTask();
      
      if (!nextNode) {
        logger.debug('No more tasks to process.');
        break;
      }
      
      logger.debug(`Processing node ${nextNode.id} of type ${nextNode.type}`);
      
      try {
        // Execute the node
        const resultNodes = await this.processNodeResult(nextNode);
        
        // Schedule any resulting nodes
        resultNodes.forEach(node => {
          this.dag.addNode(node);
          this.dag.addEdge(nextNode.id, node.id);
          this.scheduler.addTask(node);
        });
        
        // Mark the current node as completed
        nextNode.status = TaskStatus.COMPLETED;
        nextNode.metadata.completedAt = Date.now();
        
        // Re-check pending nodes
        this.scheduler.reschedulePending();
      } catch (error) {
        logger.error(`Error processing node ${nextNode.id}: ${error.message}`);
        nextNode.status = TaskStatus.FAILED;
        nextNode.metadata.error = error.message;
      }
    }
  }

  /**
   * Process a node and generate any follow-up nodes
   * @private
   * @param {Object} node - The node to process
   * @returns {Promise<Array>} Any resulting nodes to add to the graph
   */
  async processNodeResult(node) {
    const nodeContext = await this.buildNodeContext(node);
    
    const prompt = `Process the following thought in the context of the problem:
    
Type: ${node.type}
Content: ${node.content}

Context: ${nodeContext}

Provide your analysis and any follow-up thoughts needed.`;
    
    try {
      const response = await this.agent.generate(prompt);
      
      // Update the node with the result
      node.result = {
        output: response.content
      };
      
      // Default: no follow-up nodes
      return [];
    } catch (error) {
      logger.error(`Error processing node ${node.id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Builds the context for a node by gathering its dependencies
   * @private
   * @param {Object} node - The node to build context for
   * @returns {Promise<string>} The context as a string
   */
  async buildNodeContext(node) {
    if (!node.dependencies || node.dependencies.length === 0) {
      return "No prior context.";
    }
    
    const contextParts = [];
    
    for (const depId of node.dependencies) {
      const depNode = this.dag.getNode(depId);
      if (depNode) {
        const depContent = depNode.result?.output || depNode.content;
        contextParts.push(`- ${depNode.type}: ${depContent}`);
      }
    }
    
    return contextParts.join("\n\n");
  }

  /**
   * Checks if there are any unresolved nodes in the graph
   * @private
   * @returns {boolean} True if there are unresolved nodes
   */
  hasUnresolvedNodes() {
    const allNodes = this.dag.getNodes();
    
    return allNodes.some(node => 
      node.status === TaskStatus.PENDING || 
      node.status === TaskStatus.SCHEDULED ||
      node.status === TaskStatus.PROCESSING
    );
  }

  /**
   * Synthesize the final result from the completed graph
   * @private
   * @returns {Promise<Object>} The final result
   */
  async synthesizeResult() {
    logger.info('Synthesizing final result...');
    
    // Get all nodes from the DAG
    const allNodes = this.dag.getNodes();
    
    // Get leaf nodes (nodes with no children)
    const leafNodes = allNodes.filter(node => {
      return this.dag.getChildren(node.id).length === 0;
    });
    
    // Get the root node
    const rootNodes = allNodes.filter(node => {
      return this.dag.getParents(node.id).length === 0;
    });
    
    if (rootNodes.length === 0) {
      logger.error('No root node found in the graph.');
      return {
        answer: "Failed to process the query. No root node found.",
        confidence: 0
      };
    }
    
    const rootNode = rootNodes[0];
    const originalQuery = rootNode.content;
    
    // Build the synthesis context
    let synthesisContext = `Original question: ${originalQuery}\n\n`;
    synthesisContext += "Key findings:\n";
    
    // Add results from completed nodes, favoring leaf nodes
    const significantNodes = [...leafNodes];
    
    // Sort by completion time if available
    significantNodes.sort((a, b) => {
      return (b.metadata.completedAt || 0) - (a.metadata.completedAt || 0);
    });
    
    // Add content from significant nodes
    for (const node of significantNodes) {
      if (node.status === TaskStatus.COMPLETED && node.result?.output) {
        synthesisContext += `- ${node.type}: ${node.result.output.substring(0, 200)}...\n`;
      }
    }
    
    // Generate the final answer
    try {
      const synthesisPrompt = `Based on the following context, provide a comprehensive answer to the original question.
      
${synthesisContext}

Your answer should be well-reasoned and consider all the key findings. Include a confidence score between 0 and 1.`;
      
      const response = await this.agent.generate(synthesisPrompt);
      
      // Extract confidence score if present
      let confidence = 0.7; // Default value
      const confidenceMatch = response.content.match(/confidence[:\s]+([0-9.]+)/i);
      if (confidenceMatch) {
        confidence = parseFloat(confidenceMatch[1]);
        // Normalize to 0-1 range
        if (confidence > 1) confidence /= 10;
      }
      
      return {
        answer: response.content,
        confidence,
        reasoning: significantNodes.map(n => n.result?.output || n.content)
      };
    } catch (error) {
      logger.error(`Error synthesizing result: ${error.message}`);
      return {
        answer: "Failed to synthesize a complete answer due to an error.",
        confidence: 0.1,
        error: error.message
      };
    }
  }
}

export default GraphOfThoughtEngine;
