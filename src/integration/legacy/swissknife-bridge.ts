// src/integration/legacy/swissknife-bridge.ts

import { IntegrationBridge } from '../registry';
import { ConfigManager } from '@/config/manager';
import * as path from 'path';
import * as fs from 'fs/promises';

// Dynamically import child_process and util for Node.js environment
let child_process: typeof import('child_process');
let promisify: typeof import('util').promisify;

async function loadNodeModules() {
  if (typeof window === 'undefined') { // Check if in Node.js environment
    child_process = await import('child_process');
    const util = await import('util');
    promisify = util.promisify;
  }
}

loadNodeModules();

const exec = async (command: string) => {
  if (!child_process || !promisify) {
    throw new Error('Node.js child_process or util not loaded.');
  }
  return promisify(child_process.exec)(command);
};

/**
 * Bridge that provides integration with legacy SwissKnife functionality
 */
export class LegacySwissKnifeBridge implements IntegrationBridge {
  id: string = 'swissknife-legacy';
  name: string = 'Legacy SwissKnife Bridge';
  source: 'swissknife_old' = 'swissknife_old';
  target: 'current' = 'current';
  
  private initialized: boolean = false;
  private legacyPath: string = '';
  private configManager: ConfigManager;
  
  constructor() {
    this.configManager = ConfigManager.getInstance();
  }
  
  /**
   * Initialize the Legacy SwissKnife bridge
   */
  async initialize(): Promise<boolean> {
    try {
      // Check if Legacy SwissKnife is installed
      this.legacyPath = this.configManager.get<string>('legacy.swissknife.path', '');
      
      if (!this.legacyPath) {
        console.warn('Legacy SwissKnife path not configured. Set legacy.swissknife.path configuration first.');
        return false;
      }
      
      // Verify Legacy SwissKnife installation
      try {
        await fs.access(path.join(this.legacyPath, 'package.json'));
      } catch (error) {
        console.error('Legacy SwissKnife not found at configured path:', this.legacyPath);
        return false;
      }
      
      // Check version for compatibility
      const packageJsonPath = path.join(this.legacyPath, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      
      console.log(`Found Legacy SwissKnife version ${packageJson.version} at ${this.legacyPath}`);
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize Legacy SwissKnife bridge:', error);
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
   * Call a method on the Legacy SwissKnife bridge
   * @param method The method name to call
   * @param args The arguments to pass to the method
   * @returns Promise resolving to the result of the method call
   */
  async call<T>(method: string, args: any): Promise<T> {
    if (!this.isInitialized()) {
      throw new Error('Legacy SwissKnife bridge not initialized');
    }
    
    // For legacy commands, we'll execute them via CLI and capture the output
    if (method === 'execute_command') {
      const { command, options } = args;
      
      try {
        // Construct command line
        const cmdOptions = options ? Object.entries(options)
          .map(([key, value]) => `--${key}=${value}`)
          .join(' ') : '';
        
        const fullCommand = `node ${path.join(this.legacyPath, 'cli.js')} ${command} ${cmdOptions}`;
        console.log(`Executing legacy command: ${fullCommand}`);
        
        // Execute command
        const { stdout, stderr } = await exec(fullCommand);
        
        if (stderr) {
          console.warn(`Legacy command produced warnings: ${stderr}`);
        }
        
        // Try to parse JSON output
        try {
          return JSON.parse(stdout) as T;
        } catch (e) {
          // Return as string if not valid JSON
          return stdout as unknown as T;
        }
      } catch (error) {
        console.error(`Error executing legacy command ${command}:`, error);
        throw error;
      }
    }
    
    // For direct module functions, we'll require the module and call the function
    if (method === 'require_module') {
      const { modulePath, functionName, functionArgs } = args;
      
      try {
        // Resolve module path
        const resolvedPath = path.resolve(this.legacyPath, modulePath);
        
        // For safety in Phase 1, we'll just mock this functionality
        console.log(`Mock: Requiring module ${resolvedPath} and calling ${functionName}`);
        
        // Return mock data based on the module and function requested
        return this.getMockResult(modulePath, functionName, functionArgs) as T;
      } catch (error) {
        console.error(`Error requiring legacy module ${modulePath}:`, error);
        throw error;
      }
    }
    
    throw new Error(`Unsupported method in Legacy SwissKnife bridge: ${method}`);
  }
  
  /**
   * Get mock result for a module and function
   * This is a placeholder for Phase 1 implementation
   */
  private getMockResult(modulePath: string, functionName: string, args: any): any {
    console.log(`Generating mock result for ${modulePath}:${functionName}`);
    
    // Mock responses based on the requested module and function
    if (modulePath.includes('storage')) {
      if (functionName === 'storeFile') {
        return {
          success: true,
          id: `mock-file-${Date.now()}`,
          size: args.content ? args.content.length : 1024
        };
      }
      
      if (functionName === 'retrieveFile') {
        return {
          success: true,
          content: 'Mock file content from legacy system',
          metadata: {
            createdAt: new Date().toISOString(),
            size: 1024,
            type: 'text/plain'
          }
        };
      }
    }
    
    if (modulePath.includes('models')) {
      if (functionName === 'listModels') {
        return {
          models: [
            { id: 'legacy-model-1', name: 'Legacy Model 1', type: 'text' },
            { id: 'legacy-model-2', name: 'Legacy Model 2', type: 'image' }
          ]
        };
      }
      
      if (functionName === 'generateText') {
        return {
          text: `Mock response from legacy model: ${args.prompt || 'No prompt provided'}`,
          usage: {
            tokens: args.prompt ? args.prompt.length / 4 + 50 : 50,
            processingTime: 500
          }
        };
      }
    }
    
    // Default mock response
    return {
      success: true,
      message: `Mock response from legacy module ${modulePath}.${functionName}`,
      timestamp: new Date().toISOString()
    };
  }
}