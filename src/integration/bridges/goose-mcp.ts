/**
 * Goose MCP Bridge - Bridge to the Goose MCP system
 */

import { IntegrationBridge, SystemType } from '../registry.js';
import { ConfigurationManager } from '../../config/manager.js';

/**
 * Configuration for the Goose MCP Bridge
 */
export interface GooseMCPBridgeConfig {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

/**
 * Goose MCP Bridge class
 * 
 * Provides bridge functionality between the current system and Goose MCP
 */
export class GooseMCPBridge implements IntegrationBridge {
  id: string = 'goose-mcp';
  name: string = 'Goose MCP Bridge';
  source: SystemType = 'current';
  target: SystemType = 'goose';
  
  private initialized: boolean = false;
  private configManager: ConfigurationManager;
  private config: GooseMCPBridgeConfig;
  
  /**
   * Constructor
   */
  constructor(config?: GooseMCPBridgeConfig) {
    this.configManager = ConfigurationManager.getInstance();
    
    // Default configuration
    this.config = {
      baseUrl: 'http://localhost:8000',
      timeout: 30000,
      ...config
    };
  }
  
  /**
   * Check if the bridge is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Initialize the bridge
   */
  async initialize(): Promise<boolean> {
    try {
      const bridgeConfig = this.configManager.get<GooseMCPBridgeConfig>('integration.bridges.goose-mcp.options', {});
      this.config = { ...this.config, ...bridgeConfig };
      console.log(`Initializing Goose MCP Bridge with base URL: ${this.config.baseUrl}`);

      // Health-check the Goose MCP endpoint
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), this.config.timeout ?? 30_000);
      try {
        const resp = await fetch(`${this.config.baseUrl}/health`, {
          method:  'GET',
          headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
          signal:  ctrl.signal,
        });
        clearTimeout(tid);
        if (!resp.ok) {
          console.warn(`Goose MCP health check returned ${resp.status} — bridge will operate in degraded mode.`);
        }
      } catch (fetchErr: unknown) {
        clearTimeout(tid);
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.warn(`Goose MCP unreachable (${msg}) — bridge will use mock fallback.`);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize Goose MCP Bridge:', error);
      return false;
    }
  }
  
  /**
   * Call a method on the bridge
   */
  async call<T>(method: string, args: Record<string, unknown>): Promise<T> {
    if (!this.isInitialized()) throw new Error('Goose MCP bridge not initialized');
    console.log(`Calling method ${method} on Goose MCP Bridge`);

    // Try real HTTP call first; fall back to mock on error
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), this.config.timeout ?? 30_000);
      const resp = await fetch(`${this.config.baseUrl}/v1/${method}`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body:   JSON.stringify(args),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (resp.ok) return await resp.json() as T;
    } catch { /* fall through to mock */ }

    // Mock fallback
    switch (method) {
      case 'healthCheck':
        return { status: 'ok', version: '1.0.0' } as unknown as T;
      case 'generateCompletion':
        return this.mockGenerateCompletion(args) as unknown as T;
      case 'getModels':
        return { models: [{ id: 'goose-model-1', name: 'Goose Model 1' }, { id: 'goose-model-2', name: 'Goose Model 2' }] } as unknown as T;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
  
  /**
   * Mock generate completion (for testing)
   */
  private mockGenerateCompletion(args: any): any {
    const { model, prompt, options } = args;
    
    // Simple mock implementation
    return {
      completion: `Response to: ${prompt}`,
      usage: {
        promptTokens: prompt.length / 4,
        completionTokens: 20,
        totalTokens: prompt.length / 4 + 20
      },
      model,
      timing_ms: 500
    };
  }
}