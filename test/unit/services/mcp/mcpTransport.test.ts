/**
 * Unit tests for MCP transport service
 */



import { MCPTransportFactory, MCPClient } from '../../../../src/services/mcp/mcp-transport.js';

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

    it('should use browser WebSocket protocols instead of Node header options', async () => {
      const originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
      const constructed: Array<{ url: string; init: unknown }> = [];

      class FakeBrowserWebSocket {
        readyState = 1;
        private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

        constructor(url: string, init?: unknown) {
          constructed.push({ url, init });
          queueMicrotask(() => {
            for (const listener of this.listeners.get('open') ?? []) {
              listener({ type: 'open' });
            }
          });
        }

        addEventListener(event: string, listener: (event: unknown) => void): void {
          const listeners = this.listeners.get(event) ?? [];
          listeners.push(listener);
          this.listeners.set(event, listeners);
        }

        send(_data: string): void {}

        close(): void {}
      }

      (globalThis as Record<string, unknown>).WebSocket = FakeBrowserWebSocket;
      try {
        const transport = MCPTransportFactory.create({
          type: 'websocket',
          endpoint: 'ws://browser.example/mcp',
          credentials: {
            token: 'host-only-header-must-not-be-used',
            protocol: 'mcp.v1',
          },
        });

        await expect(transport.connect()).resolves.toBe(true);
        expect(constructed).toHaveLength(1);
        expect(constructed[0]).toEqual({
          url: 'ws://browser.example/mcp',
          init: 'mcp.v1',
        });
        expect(transport.isConnected()).toBe(true);
        await expect(transport.send({ ok: true })).resolves.toBeUndefined();
        await transport.disconnect();
      } finally {
        if (originalWebSocket === undefined) {
          delete (globalThis as Record<string, unknown>).WebSocket;
        } else {
          (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
        }
      }
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
