/**
 * MCP Transport Implementation Patch
 * 
 * This patch implements the WebSocket and HTTP transport methods for the MCP client
 * to fix issues after the refactoring.
 */

import { MCPTransportType, MCPTransportOptions } from '../../services/mcp-transport.js';
import WebSocket from 'ws.js';
import axios from 'axios.js';

/**
 * Properly implemented WebSocket transport for MCP
 */
export class WebSocketTransportImpl {
  private ws: WebSocket | null = null;
  private endpoint: string;
  private connected: boolean = false;
  private messageListeners: Array<(message: any) => void> = [];
  private disconnectListeners: Array<() => void> = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectInterval: number = 2000; // ms

  constructor(options: MCPTransportOptions) {
    this.endpoint = options.endpoint;
  }

  async connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.endpoint);
        
        this.ws.on('open', () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          console.log(`WebSocket connected to ${this.endpoint}`);
          resolve(true);
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.messageListeners.forEach(listener => listener(message));
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        });

        this.ws.on('close', () => {
          this.connected = false;
          this.disconnectListeners.forEach(listener => listener());
          console.log('WebSocket disconnected');
          
          // Reconnect logic if enabled
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), this.reconnectInterval);
          }
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        });
      } catch (error) {
        console.error('Error connecting WebSocket:', error);
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  async send(message: any): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      this.ws!.send(JSON.stringify(message), (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  getType(): MCPTransportType {
    return 'websocket';
  }

  on(event: 'message' | 'disconnect', listener: (...args: any[]) => void): void {
    if (event === 'message') {
      this.messageListeners.push(listener as (message: any) => void);
    } else if (event === 'disconnect') {
      this.disconnectListeners.push(listener as () => void);
    }
  }

  off(event: 'message' | 'disconnect', listener: (...args: any[]) => void): void {
    if (event === 'message') {
      this.messageListeners = this.messageListeners.filter(l => l !== listener);
    } else if (event === 'disconnect') {
      this.disconnectListeners = this.disconnectListeners.filter(l => l !== listener);
    }
  }
}

/**
 * Properly implemented HTTP transport for MCP
 */
export class HttpTransportImpl {
  private endpoint: string;
  private credentials: any;
  private connected: boolean = true; // HTTP is connectionless, so always "connected"
  private messageListeners: Array<(message: any) => void> = [];
  private disconnectListeners: Array<() => void> = [];

  constructor(options: MCPTransportOptions) {
    this.endpoint = options.endpoint;
    this.credentials = options.credentials;
  }

  async connect(): Promise<boolean> {
    // HTTP is connectionless, so just return true
    this.connected = true;
    return true;
  }

  async disconnect(): Promise<void> {
    // HTTP is connectionless, so just set connected to false
    this.connected = false;
    this.disconnectListeners.forEach(listener => listener());
  }

  async send(message: any): Promise<void> {
    if (!this.connected) {
      throw new Error('HTTP transport not connected');
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add authentication if provided
      if (this.credentials) {
        if (this.credentials.apiKey) {
          headers['Authorization'] = `Bearer ${this.credentials.apiKey}`;
        }
        // Add other auth methods as needed
      }

      await axios.post(this.endpoint, message, { headers });
    } catch (error) {
      console.error('Error sending HTTP request:', error);
      throw error;
    }
  }

  async request(message: any): Promise<any> {
    if (!this.connected) {
      throw new Error('HTTP transport not connected');
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add authentication if provided
      if (this.credentials) {
        if (this.credentials.apiKey) {
          headers['Authorization'] = `Bearer ${this.credentials.apiKey}`;
        }
        // Add other auth methods as needed
      }

      const response = await axios.post(this.endpoint, message, { headers });
      return response.data;
    } catch (error) {
      console.error('Error sending HTTP request:', error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getType(): MCPTransportType {
    return 'https';
  }

  on(event: 'message' | 'disconnect', listener: (...args: any[]) => void): void {
    if (event === 'message') {
      this.messageListeners.push(listener as (message: any) => void);
    } else if (event === 'disconnect') {
      this.disconnectListeners.push(listener as () => void);
    }
  }

  off(event: 'message' | 'disconnect', listener: (...args: any[]) => void): void {
    if (event === 'message') {
      this.messageListeners = this.messageListeners.filter(l => l !== listener);
    } else if (event === 'disconnect') {
      this.disconnectListeners = this.disconnectListeners.filter(l => l !== listener);
    }
  }
}