/**
 * MCP Server Entry Point
 * 
 * This is the main entry point for the MCP server.
 * It uses the MCPServerController to manage the server lifecycle.
 */

import { MCPServerController } from '../patches/mcp/mcp-server-controller';

// Import patches first to ensure they're applied
import '../patches/index';

/**
 * Start the MCP server in the specified directory
 * @param cwd The current working directory for the server
 */
export async function startMCPServer(cwd: string): Promise<void> {
  console.log(`Starting MCP server in directory: ${cwd}`);
  
  // Get required managers
  const { ConfigManager } = await import('../utils/configManager.js');
  const { StorageManager } = await import('../storage/manager.js');
  const { TaskManager } = await import('../tasks/manager.js');
  
  // Initialize the managers
  const configManager = ConfigManager.getInstance();
  await configManager.init(cwd);
  
  const storageManager = StorageManager.getInstance();
  const taskManager = TaskManager.getInstance();
  
  // Create the controller
  const controller = new MCPServerController(configManager, storageManager, taskManager);
  
  // Handle process signals to ensure clean shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT signal. Shutting down MCP server...');
    await controller.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM signal. Shutting down MCP server...');
    await controller.stop();
    process.exit(0);
  });
  
  // Add error handler to prevent crashes
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    // Don't exit immediately to allow reporting the error
    setTimeout(() => process.exit(1), 500);
  });
  
  // Start the server
  try {
    await controller.start(cwd);
    console.log('MCP server started successfully');
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// If this module is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const workDir = process.argv[2] || process.cwd();
  console.log(`MCP server starting in direct mode, workdir: ${workDir}`);
  
  // Add extra debug output for MCP diagnostics
  console.error(`[MCP-DEBUG] Node version: ${process.version}`);
  console.error(`[MCP-DEBUG] Module type: ${typeof module}, main? ${require.main === module}`);
  console.error(`[MCP-DEBUG] Command: ${process.argv.join(' ')}`);
  
  startMCPServer(workDir).catch(err => {
    console.error('Failed to start MCP server in direct mode:', err);
    process.exit(1);
  });
}
