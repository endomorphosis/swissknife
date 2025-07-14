/**
 * Unit tests for MCP transport service
 */



import { MCPTransportFactory, MCPClient, MCPTransportType } from '@services/mcp-transport';

describe('MCP Transport Service', () => {
  describe('MCPTransportFactory', () => {
    it('should create WebSocket transport', () => {
      const transport = MCPTransportFactory.create({
        type: 'websocket',
        endpoint: 'ws://localhost:8080'
      });
      
      expect(transport.getType()).toBe('websocket');
      expect(transport.isConnected()).toBe(false);
    });
    
    it('should create libp2p transport', () => {
      const transport = MCPTransportFactory.create({
        type: 'libp2p',
        endpoint: '/ip4/127.0.0.1/tcp/8080/p2p/QmExample'
      });
      
      expect(transport.getType()).toBe('libp2p');
      expect(transport.isConnected()).toBe(false);
    });
    
    it('should create WebRTC transport', () => {
      const transport = MCPTransportFactory.create({
        type: 'webrtc',
        endpoint: 'signaling-server.example.com'
      });
      
      expect(transport.getType()).toBe('webrtc');
      expect(transport.isConnected()).toBe(false);
    });
    
    it('should create HTTPS transport', () => {
      const transport = MCPTransportFactory.create({
        type: 'https',
        endpoint: 'https://api.example.com/mcp'
      });
      
      expect(transport.getType()).toBe('https');
      expect(transport.isConnected()).toBe(false);
    });
    
    it('should throw for unsupported transport type', () => {
      // Using type assertion to simulate invalid input
      const invalidType = 'invalid' as any;
      
      expect(() => {
        MCPTransportFactory.create({
          type: invalidType,
          endpoint: 'example.com'
        });
      }).toThrow('Unsupported MCP transport type');
    });
  });
  
  describe('MCPClient', () => {
    let client: any;
    
    beforeEach(() => {
      client = new MCPClient({
        type: 'websocket',
        endpoint: 'ws://localhost:8080'
      });
    });
    
    it('should initialize with the correct transport type', () => {
      // Access private transport field for testing
      // @ts-ignore - accessing private field for test
      expect(client.transport.getType()).toBe('websocket');
    });
    
    it('should throw when sending request to disconnected transport', async () => {
      await expect(client.sendRequest({ method: 'test' })).rejects.toThrow('MCP transport not connected');
    });
    
    // Note: Additional tests would require mocking the transport implementations
    // or integrating with actual transport implementations
  });
});
