/**
 * Mock implementation of MCP Transport for testing
 */

import { MCPTransportType, MCPTransportOptions, MCPTransport } from '../../../src/services/mcp/mcp-transport.js';

/**
 * A mock implementation of MCPTransport for testing
 */
export class MockTransport implements MCPTransport {
  private options: MCPTransportOptions;
  private connected: boolean = false;
  private messageListeners: ((message: any) => void)[] = [];
  private disconnectListeners: (() => void)[] = [];
  private latency: number = 0;
  private mockResponses: Map<string, any> = new Map();
  private messageLog: any[] = [];
  private shouldFailConnect: boolean = false;
  private shouldFailSend: boolean = false;
  private shouldFailReceive: boolean = false;

  constructor(options: MCPTransportOptions) {
    this.options = options;
  }

  /**
   * Set whether connect() should fail
   */
  setShouldFailConnect(shouldFail: boolean): void {
    this.shouldFailConnect = shouldFail;
  }

  /**
   * Set whether send() should fail
   */
  setShouldFailSend(shouldFail: boolean): void {
    this.shouldFailSend = shouldFail;
  }

  /**
   * Set whether receive() should fail
   */
  setShouldFailReceive(shouldFail: boolean): void {
    this.shouldFailReceive = shouldFail;
  }

  /**
   * Set a mock response for a specific request
   */
  setMockResponse(requestId: string, response: any): void {
    this.mockResponses.set(requestId, response);
  }

  /**
   * Get the log of messages that have been sent
   */
  getMessageLog(): any[] {
    return [...this.messageLog];
  }

  /**
   * Set the mock latency
   */
  setLatency(latencyMs: number): void {
    this.latency = latencyMs;
  }

  /**
   * Simulate receiving a message
   */
  simulateReceiveMessage(message: any): void {
    this.messageListeners.forEach(listener => listener(message));
  }

  /**
   * Simulate disconnect
   */
  simulateDisconnect(): void {
    this.connected = false;
    this.disconnectListeners.forEach(listener => listener());
  }

  /**
   * Connect the transport
   */
  async connect(): Promise<boolean> {
    if (this.shouldFailConnect) {
      throw new Error('Mock connection failure');
    }

    await this.delay(this.latency);
    this.connected = true;
    return true;
  }

  /**
   * Disconnect the transport
   */
  async disconnect(): Promise<void> {
    await this.delay(this.latency);
    this.connected = false;
    this.disconnectListeners.forEach(listener => listener());
  }

  /**
   * Send a message
   */
  async send(message: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }

    if (this.shouldFailSend) {
      throw new Error('Mock send failure');
    }

    await this.delay(this.latency);
    this.messageLog.push(message);
    
    // Auto-respond if we have a mock response for this message
    if (message.correlationId && this.mockResponses.has(message.correlationId)) {
      const response = this.mockResponses.get(message.correlationId);
      setTimeout(() => {
        this.simulateReceiveMessage({
          ...response,
          correlationId: message.correlationId
        });
      }, this.latency);
    }
  }

  /**
   * Receive a message
   */
  async receive(): Promise<any> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }

    if (this.shouldFailReceive) {
      throw new Error('Mock receive failure');
    }

    await this.delay(this.latency);
    return null; // This implementation uses events instead
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the transport type
   */
  getType(): MCPTransportType {
    return this.options.type;
  }

  /**
   * Get the latency
   */
  getLatency(): number {
    return this.latency;
  }

  /**
   * Add an event listener
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

  /**
   * Helper method to simulate delay
   */
  private delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}