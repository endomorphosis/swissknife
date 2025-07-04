/**
 * Configuration Manager
 * 
 * Manages application configuration settings with singleton pattern
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Configuration file paths
const CONFIG_DIR = path.join(os.homedir(), '.swissknife');
const PROJECT_CONFIG_FILE = 'swissknife.json';
const GLOBAL_CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Configuration Manager class
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private globalConfig: any;
  private projectConfig: any;
  
  /**
   * Private constructor (use getInstance instead)
   */
  private constructor() {
    this.globalConfig = {};
    this.projectConfig = {};
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }
  
  /**
   * Initialize configuration
   */
  async init(workDir?: string): Promise<void> {
    await this.ensureConfigDir();
    await this.loadGlobalConfig();
    await this.loadProjectConfig(workDir);
  }
  
  /**
   * Ensures the configuration directory exists
   */
  private async ensureConfigDir(): Promise<void> {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
    } catch (err) {
      // Directory already exists, ignore
    }
  }
  
  /**
   * Load global configuration
   */
  private async loadGlobalConfig(): Promise<void> {
    try {
      const configData = await fs.readFile(GLOBAL_CONFIG_FILE, 'utf-8');
      this.globalConfig = JSON.parse(configData);
    } catch (err) {
      // If file doesn't exist or has invalid JSON, use empty object
      this.globalConfig = {};
    }
  }
  
  /**
   * Load project configuration
   */
  private async loadProjectConfig(workDir?: string): Promise<void> {
    try {
      const configPath = workDir ? 
        path.join(workDir, PROJECT_CONFIG_FILE) : 
        PROJECT_CONFIG_FILE;
        
      const configData = await fs.readFile(configPath, 'utf-8');
      this.projectConfig = JSON.parse(configData);
    } catch (err) {
      // If file doesn't exist or has invalid JSON, use empty object
      this.projectConfig = {};
    }
  }
  
  /**
   * Get a configuration value
   */
  get(key: string): any {
    // Check project config first, then fall back to global config
    if (this.projectConfig[key] !== undefined) {
      return this.projectConfig[key];
    }
    
    return this.globalConfig[key];
  }
  
  /**
   * Set a configuration value in the project config
   */
  async setProjectConfig(key: string, value: any): Promise<void> {
    this.projectConfig[key] = value;
    await this.saveProjectConfig();
  }
  
  /**
   * Set a configuration value in the global config
   */
  async setGlobalConfig(key: string, value: any): Promise<void> {
    this.globalConfig[key] = value;
    await this.saveGlobalConfig();
  }
  
  /**
   * Save project configuration
   */
  private async saveProjectConfig(): Promise<void> {
    try {
      await fs.writeFile(
        PROJECT_CONFIG_FILE, 
        JSON.stringify(this.projectConfig, null, 2)
      );
    } catch (err) {
      console.error('Error saving project config:', err);
    }
  }
  
  /**
   * Save global configuration
   */
  private async saveGlobalConfig(): Promise<void> {
    try {
      await fs.writeFile(
        GLOBAL_CONFIG_FILE, 
        JSON.stringify(this.globalConfig, null, 2)
      );
    } catch (err) {
      console.error('Error saving global config:', err);
    }
  }
  
  /**
   * Get MCP server configurations
   */
  getMcpServers(): any[] {
    // Check project config first
    const projectServers = this.projectConfig.mcpServers || [];
    const globalServers = this.globalConfig.mcpServers || [];
    
    // Merge servers, with project servers taking precedence
    return [...globalServers, ...projectServers];
  }
  
  /**
   * Get default MCP server
   */
  getDefaultMcpServer(): any {
    const defaultName = this.projectConfig.defaultMcpServer || 
                       this.globalConfig.defaultMcpServer;
    
    if (!defaultName) return null;
    
    const servers = this.getMcpServers();
    return servers.find(s => s.name === defaultName) || null;
  }
}

export default ConfigManager;
