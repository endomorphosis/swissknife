/**
 * MCP Patch Loader
 * 
 * This module loads and applies all patches for the MCP server and client.
 * It should be imported early in the application startup process.
 */

import { applyAllMcpPatches } from './mcp/index.js';

/**
 * Initialize all patches in the application
 */
export function initializePatches() {
  // Apply MCP patches
  applyAllMcpPatches();
  
  // Additional patch categories can be added here
  
  console.log('All patches initialized successfully');
}

// Apply patches immediately when imported
initializePatches();