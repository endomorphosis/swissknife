/**
 * Updated MCP Client Integration Patch
 * 
 * This patch integrates all the transport implementations with the MCP client
 * to fix issues after the refactoring.
 */

import { WebSocketTransportImpl, HttpTransportImpl } from './mcp-transport-impl.js';
import { MemoryTransport } from './memory-transport.js';
import { MCPTransportFactory, MCPTransportOptions, MCPTransportType } from '../../services/mcp-transport.js';

/**
 * Patch the MCP Transport Factory to use our implementations
 */
export function patchMcpTransportFactory() {
  // Override the create method in MCPTransportFactory
  const originalCreate = MCPTransportFactory.create;
  
  MCPTransportFactory.create = function(options: MCPTransportOptions) {
    // Add support for memory transport for testing
    if (options.type === 'memory' as MCPTransportType) {
      return new MemoryTransport(options as any);
    }
    
    switch (options.type) {
      case 'websocket':
        return new WebSocketTransportImpl(options);
      case 'https':
        return new HttpTransportImpl(options);
      default:
        // Use the original implementation for other transport types
        return originalCreate(options);
    }
  };
  
  console.log('MCP Transport Factory patched successfully');
}

/**
 * Initialize the MCP patches
 */
export function initMcpPatches() {
  // Apply all MCP-related patches
  patchMcpTransportFactory();
  
  console.log('MCP patches applied successfully');
}