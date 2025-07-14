/**
 * Integration test for MCP patches
 * Tests that our MCP patch system properly loads and fixes issues
 */

import '@src/patches'; // Import patches to ensure they're applied

// Import after patches to get the patched versions

describe('MCP Patch Integration', () => {
  beforeEach(() => {
    // Reset any mocks
    jest.clearAllMocks();
  });

  it('should apply MCP patches successfully', () => {
    // Create a spy to verify the function was called
    const patchSpy = jest.spyOn(global.console, 'log');
    
    // Call the function to apply patches
    applyAllMcpPatches();
    
    // Verify the patches were applied
    expect(patchSpy).toHaveBeenCalledWith('All MCP patches applied successfully');
  });

  it('should create transport implementations with the correct behavior', () => {
    // This is more of an integration test to verify the patched factory
    // creates the correct transport types
    
    // Create a WebSocket transport
    const wsTransport = MCPTransportFactory.create({
      type: 'websocket',
      endpoint: 'ws://localhost:8080'
    });
    
    expect(wsTransport.getType()).toBe('websocket');
    
    // Create an HTTP transport
    const httpTransport = MCPTransportFactory.create({
      type: 'https',
      endpoint: 'https://localhost/api'
    });
    
    expect(httpTransport.getType()).toBe('https');
  });
});