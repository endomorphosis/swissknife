/**
 * Graph-of-Thought CLI Command
 * 
 * Provides CLI commands to interact with the Graph-of-Thought system
 * for complex reasoning and task decomposition.
 */

import { Command } from 'commander';
import { GoTManager } from '../tasks/graph/manager';
import { MCPClient } from '../storage/ipfs/mcp-client';
import { ConfigurationManager } from '../config/manager';
import chalk from 'chalk';

export const got = new Command('got')
  .description('Interact with the Graph-of-Thought system')
  .addHelpText('after', `
Examples:
  $ swissknife got create                 # Create a new Graph-of-Thought
  $ swissknife got node graph123 question # Add a question node to graph123
  $ swissknife got list graph123          # List all nodes in graph123
  $ swissknife got visualize graph123     # Visualize the graph structure
  $ swissknife got persist graph123       # Persist the graph to IPFS
  $ swissknife got execute graph123       # Execute the graph's reasoning flow
  `);

got
  .command('create')
  .description('Create a new Graph-of-Thought')
  .action(async () => {
    try {
      const manager = GoTManager.getInstance();
      const graphId = manager.createGraph();
      
      console.log(chalk.green(`✓ Created new Graph-of-Thought with ID: ${graphId}`));
      console.log(`\nUse this ID in subsequent commands to add nodes and manage the graph.`);
    } catch (error: any) {
      console.error(chalk.red(`Error creating Graph-of-Thought: ${error.message}`));
    }
  });

got
  .command('node <graphId> <type>')
  .description('Add a node to an existing graph')
  .option('-c, --content <content>', 'Node content')
  .option('-p, --parents <parentIds>', 'Comma-separated list of parent node IDs')
  .option('-d, --data <json>', 'JSON string of additional node data')
  .option('-r, --priority <number>', 'Node priority (default: 1)', '1')
  .action(async (graphId, type, options) => {
    try {
      if (!['question', 'task', 'thought', 'decision', 'action', 'result', 'answer', 'error'].includes(type)) {
        throw new Error(`Invalid node type: ${type}. Must be one of: question, task, thought, decision, action, result, answer, error`);
      }
      
      const manager = GoTManager.getInstance();
      
      // Parse options
      const content = options.content || '';
      const parentIds = options.parents ? options.parents.split(',') : [];
      const data = options.data ? JSON.parse(options.data) : {};
      const priority = parseInt(options.priority, 10);
      
      // Create the node
      const node = manager.createNode(graphId, {
        type: type as any,
        content,
        data,
        priority,
        parentIds
      });
      
      console.log(chalk.green(`✓ Created new ${type} node with ID: ${node.id}`));
      console.log(`Added to graph: ${graphId}`);
      
      if (parentIds.length > 0) {
        console.log(`Connected to parent nodes: ${parentIds.join(', ')}`);
      }
    } catch (error: any) {
      console.error(chalk.red(`Error adding node: ${error.message}`));
    }
  });

got
  .command('list <graphId>')
  .description('List all nodes in a graph')
  .option('-t, --type <type>', 'Filter by node type')
  .option('-s, --status <status>', 'Filter by node status')
  .action(async (graphId, options) => {
    try {
      const manager = GoTManager.getInstance();
      let nodes = manager.getGraphNodes(graphId);
      
      // Apply filters if specified
      if (options.type) {
        nodes = nodes.filter(node => node.type === options.type);
      }
      
      if (options.status) {
        nodes = nodes.filter(node => node.status === options.status);
      }
      
      if (nodes.length === 0) {
        console.log(chalk.yellow(`No nodes found for graph: ${graphId}`));
        return;
      }
      
      console.log(chalk.green(`Nodes in graph ${graphId}:`));
      console.log('───────────────────────────────────');
      
      nodes.forEach(node => {
        const statusColor: { [key: string]: chalk.Chalk } = {
          'pending': chalk.yellow,
          'active': chalk.blue,
          'completed': chalk.green,
          'failed': chalk.red,
          'blocked': chalk.grey
        };
        
        console.log(`${chalk.bold(node.id)} (${chalk.cyan(node.type)}) - ${statusColor[node.status](node.status)}`);
        console.log(`Content: ${node.content.substring(0, 50)}${node.content.length > 50 ? '...' : ''}`);
        
        if (node.parentIds.length > 0) {
          console.log(`Parents: ${node.parentIds.join(', ')}`);
        }
        
        if (node.childIds.length > 0) {
          console.log(`Children: ${node.childIds.join(', ')}`);
        }
        
        console.log('───────────────────────────────────');
      });
      
    } catch (error: any) {
      console.error(chalk.red(`Error listing nodes: ${error.message}`));
    }
  });

got
  .command('update <nodeId> [status]')
  .description('Update a node\'s status or content')
  .option('-c, --content <content>', 'New content for the node')
  .option('-d, --data <json>', 'JSON string of additional data to merge')
  .action(async (nodeId, status, options) => {
    try {
      const manager = GoTManager.getInstance();
      const node = manager.getNode(nodeId);
      
      if (!node) {
        throw new Error(`Node not found: ${nodeId}`);
      }
      
      if (status) {
        if (!['pending', 'active', 'completed', 'failed', 'blocked'].includes(status)) {
          throw new Error(`Invalid status: ${status}. Must be one of: pending, active, completed, failed, blocked`);
        }
        
        manager.updateNodeStatus(nodeId, status as any);
        console.log(chalk.green(`✓ Updated node ${nodeId} status to: ${status}`));
      }
      
      if (options.content) {
        node.updateContent(options.content);
        console.log(chalk.green(`✓ Updated node ${nodeId} content`));
      }
      
      if (options.data) {
        const data = JSON.parse(options.data);
        node.updateData(data);
        console.log(chalk.green(`✓ Updated node ${nodeId} data`));
      }
    } catch (error: any) {
      console.error(chalk.red(`Error updating node: ${error.message}`));
    }
  });

got
  .command('persist <graphId>')
  .description('Persist a graph to IPFS via MCP')
  .action(async (graphId) => {
    try {
      const manager = GoTManager.getInstance();
      const config = ConfigurationManager.getInstance();
      
      // Check if we have nodes in the graph
      const nodes = manager.getGraphNodes(graphId);
      if (nodes.length === 0) {
        throw new Error(`Graph ${graphId} has no nodes to persist`);
      }
      
      // Initialize MCP client
      const mcpUrl = config.get('mcp.url', 'http://localhost:5000');
      const mcpClient = new MCPClient({ baseUrl: mcpUrl });
      
      console.log(chalk.blue(`Connecting to MCP server at ${mcpUrl}...`));
      await mcpClient.connect();
      
      manager.setMCPClient(mcpClient);
      
      console.log(chalk.blue(`Persisting graph ${graphId} with ${nodes.length} nodes...`));
      const cid = await manager.persistGraph(graphId);
      
      if (!cid) {
        throw new Error(`Failed to persist graph ${graphId}`);
      }
      
      console.log(chalk.green(`✓ Successfully persisted graph to IPFS`));
      console.log(`CID: ${cid}`);
      console.log(`\nYou can retrieve this graph using the CID.`);
      
    } catch (error: any) {
      console.error(chalk.red(`Error persisting graph: ${error.message}`));
    }
  });

got
  .command('visualize <graphId>')
  .description('Visualize a graph structure (outputs DOT format for Graphviz)')
  .option('-o, --output <file>', 'Output file (defaults to stdout)')
  .action(async (graphId, options) => {
    try {
      const manager = GoTManager.getInstance();
      const fs = require('fs');
      
      // Get all nodes in the graph
      const nodes = manager.getGraphNodes(graphId);
      
      if (nodes.length === 0) {
        throw new Error(`Graph ${graphId} has no nodes to visualize`);
      }
      
      // Generate DOT language representation
      let dot = 'digraph G {\n';
      dot += '  rankdir=TB;\n';
      dot += '  node [shape=box, style=filled, fontname="Arial"];\n\n';
      
      // Add nodes
      for (const node of nodes) {
        const nodeColor: { [key: string]: string } = {
          'question': 'lightblue',
          'task': 'lightyellow',
          'thought': 'lightgreen',
          'decision': 'lightpink',
          'action': 'orange',
          'result': 'lightgrey',
          'answer': 'lightcyan',
          'error': 'red'
        };
        
        const label = `${node.type}\\n${node.content.substring(0, 20)}${node.content.length > 20 ? '...' : ''}`;
        dot += `  "${node.id}" [label="${label}", fillcolor="${nodeColor[node.type]}"];\n`;
      }
      
      dot += '\n';
      
      // Add edges
      for (const node of nodes) {
        for (const childId of node.childIds) {
          dot += `  "${node.id}" -> "${childId}";\n`;
        }
      }
      
      dot += '}\n';
      
      // Output to file or stdout
      if (options.output) {
        fs.writeFileSync(options.output, dot);
        console.log(chalk.green(`✓ Graph visualization written to ${options.output}`));
        console.log(`To render: dot -Tpng ${options.output} -o graph.png`);
      } else {
        console.log(dot);
        console.log(chalk.yellow(`\nTo render this graph, save the output to a .dot file and use Graphviz:`));
        console.log(`dot -Tpng graph.dot -o graph.png`);
      }
      
    } catch (error: any) {
      console.error(chalk.red(`Error visualizing graph: ${error.message}`));
    }
  });

got
  .command('execute <graphId>')
  .description('Execute a Graph-of-Thought reasoning flow')
  .action(async (graphId) => {
    try {
      const manager = GoTManager.getInstance();
      
      // Check if we have nodes in the graph
      const nodes = manager.getGraphNodes(graphId);
      if (nodes.length === 0) {
        throw new Error(`Graph ${graphId} has no nodes to execute`);
      }
      
      console.log(chalk.blue(`Executing Graph-of-Thought ${graphId}...`));
      await manager.executeGraph(graphId);
      
      console.log(chalk.green(`✓ Graph execution completed`));
      
      // Show final answer nodes if any
      const answerNodes = manager.getNodesByType(graphId, 'answer' as any);
      if (answerNodes.length > 0) {
        console.log(chalk.yellow(`\nFinal Answers:`));
        answerNodes.forEach(node => {
          console.log('───────────────────────────────────');
          console.log(node.content);
          console.log('───────────────────────────────────');
        });
      }
      
    } catch (error: any) {
      console.error(chalk.red(`Error executing graph: ${error.message}`));
    }
  });

export default got;