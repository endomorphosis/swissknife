/**
 * MemoryTransport Implementation
 * 
 * A transport implementation that works in-memory for testing or local development.
 * This allows direct communication between client and server without network or process boundaries.
 */

import { MCPTransportType, MCPTransportOptions, MCPTransport } from '../../services/mcp-transport.js';

/**
 * Shared memory channel that connects paired transports
 */
export class MemoryChannel {
  private clientToServer: Array<(message: any) => void> = [];
  private serverToClient: Array<(message: any) => void> = [];
  
  /**
   * Register a callback for messages coming from client to server
   */
  onClientToServer(callback: (message: any) => void): void {
    this.clientToServer.push(callback);
  }
  
  /**
   * Register a callback for messages coming from server to client
   */
  onServerToClient(callback: (message: any) => void): void {
    this.serverToClient.push(callback);
  }
  
  /**
   * Send a message from client to server
   */
  sendToServer(message: any): void {
    for (const callback of this.clientToServer) {
      setTimeout(() => callback(message), 0);
    }
  }
  
  /**
   * Send a message from server to client
   */
  sendToClient(message: any): void {
    for (const callback of this.serverToClient) {
      setTimeout(() => callback(message), 0);
    }
  }
  
  /**
   * Clear all registered callbacks
   */
  clear(): void {
    this.clientToServer = [];
    this.serverToClient = [];
  }
}

/**
 * Role in the memory transport (client or server)
 */
export type MemoryTransportRole = 'client' | 'server';

/**
 * Memory Transport Options
 */
export interface MemoryTransportOptions extends MCPTransportOptions {
  channel: MemoryChannel;
  role: MemoryTransportRole;
}

/**
 * In-memory transport implementation for local testing
 */
export class MemoryTransport implements MCPTransport {
  private options: MemoryTransportOptions;
  private connected: boolean = false;
  private messageListeners: ((message: any) => void)[] = [];
  private disconnectListeners: (() => void)[] = [];
  
  constructor(options: MemoryTransportOptions) {
    this.options = options;
  }
  
  /**
   * Connect to the memory channel
   */
  async connect(): Promise<boolean> {
    if (this.connected) {
      return true;
    }
    
    if (this.options.role === 'client') {
      // As client, listen for messages from server
      this.options.channel.onServerToClient((message) => {
        for (const listener of this.messageListeners) {
          listener(message);
        }
      });
    } else {
      // As server, listen for messages from client
      this.options.channel.onClientToServer((message) => {
        for (const listener of this.messageListeners) {
          listener(message);
        }
      });
    }
    
    this.connected = true;
    return true;
  }
  
  /**
   * Disconnect from the memory channel
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    
    this.connected = false;
    
    for (const listener of this.disconnectListeners) {
      listener();
    }
  }
  
  /**
   * Send a message through the memory channel
   */
  async send(message: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Memory transport not connected');
    }
    
    if (this.options.role === 'client') {
      this.options.channel.sendToServer(message);
    } else {
      this.options.channel.sendToClient(message);
    }
  }
  
  /**
   * Receive is not typically used with event-based transport
   */
  async receive(): Promise<any> {
    throw new Error('Memory transport uses event-based messaging, use on("message") instead');
  }
  
  /**
   * Check if the transport is connected
   */
  isConnected(): boolean {
    return this.connected;
  }
  
  /**
   * Get the transport type
   */
  getType(): MCPTransportType {
    return 'memory' as MCPTransportType;
  }
  
  /**
   * Register an event listener
   */
  on(event: 'message' | 'disconnect', listener: (...args: any[]) => void): void {
    if (event === 'message') {
      this.messageListeners.push(listener as (message: any) => void);
    } else if (event === 'disconnect') {
      this.disconnectListeners.push(listener as () => void);
    }
  }
  
  /**
   * Remove an event listener
   */
  off(event: 'message' | 'disconnect', listener: (...args: any[]) => void): void {
    if (event === 'message') {
      this.messageListeners = this.messageListeners.filter(l => l !== listener);
    } else if (event === 'disconnect') {
      this.disconnectListeners = this.disconnectListeners.filter(l => l !== listener);
    }
  }
}