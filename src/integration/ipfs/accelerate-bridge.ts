// src/integration/ipfs/accelerate-bridge.ts

import { IntegrationBridge } from '../registry';
import { ConfigManager } from '../config/manager';
import { loadNativeModule } from '../utils/native-loader';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Bridge that provides integration with IPFS Accelerate JS
 */
export class IPFSAccelerateBridge implements IntegrationBridge {
  id: string = 'ipfs-accelerate';
  name: string = 'IPFS Accelerate Bridge';
  source: 'ipfs_accelerate' = 'ipfs_accelerate';
  target: 'current' = 'current';
  
  private accelerateModule: any = null;
  private initialized: boolean = false;
  private configManager: ConfigManager;
  
  constructor() {
    this.configManager = ConfigManager.getInstance();
  }
  
  /**
   * Initialize the IPFS Accelerate bridge
   */
  async initialize(): Promise<boolean> {
    try {
      // Check if IPFS Accelerate JS is installed
      const ipfsPath = this.configManager.get<string>('ipfs.accelerate.path');
      
      if (!ipfsPath) {
        console.warn('IPFS Accelerate JS path not configured. Set ipfs.accelerate.path configuration first.');
        return false;
      }
      
      // Verify IPFS Accelerate JS installation
      try {
        await fs.access(path.join(ipfsPath, 'package.json'));
      } catch (error) {
        console.error('IPFS Accelerate JS not found at configured path:', ipfsPath);
        return false;
      }
      
      // Load IPFS Accelerate module
      console.log('Initializing IPFS Accelerate bridge with path:', ipfsPath);
      
      // For Phase 1, we'll use our mock implementation
      this.accelerateModule = loadNativeModule('ipfs_accelerate_bridge');
      
      // Initialize the module with configurations
      const apiKey = this.configManager.get<string>('ipfs.accelerate.apiKey');
      const endpoint = this.configManager.get<string>('ipfs.accelerate.endpoint', 'https://ipfs-api.example.com');
      
      const initResult = await this.accelerateModule.initialize({
        apiKey,
        endpoint,
        timeout: 30000,
        retries: 3
      });
      
      this.initialized = initResult === true;
      
      return this.initialized;
    } catch (error) {
      console.error('Failed to initialize IPFS Accelerate bridge:', error);
      return false;
    }
  }
  
  /**
   * Check if the bridge is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Call a method on the IPFS Accelerate bridge
   * @param method The method name to call
   * @param args The arguments to pass to the method
   * @returns Promise resolving to the result of the method call
   */
  async call<T>(method: string, args: any): Promise<T> {
    if (!this.isInitialized()) {
      throw new Error('IPFS Accelerate bridge not initialized');
    }
    
    if (!this.accelerateModule[method]) {
      throw new Error(`Method not found in IPFS Accelerate bridge: ${method}`);
    }
    
    try {
      return await this.accelerateModule[method](args) as T;
    } catch (error) {
      console.error(`Error calling IPFS Accelerate method ${method}:`, error);
      throw error;
    }
  }
}