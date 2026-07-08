/**
 * Configuration Manager for SwissKnife
 * 
 * This module provides a centralized way to manage application configuration.
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { logger } from '../utils/logger.js'; // Keep .js for logger as it's a JS file

// Singleton instance
let instance: ConfigManager | null = null;

/**
 * Configuration Manager class
 */
export interface IConfigManager {
  initialize(): Promise<boolean>;
  load(): Promise<boolean>;
  save(): Promise<boolean>;
  getDefaultConfig(): Record<string, any>;
  get<T>(key: string, defaultValue?: T): T | undefined;
  set(key: string, value: any): Promise<boolean>;
  has(key: string): boolean;
  delete(key: string): boolean;
  listKeys(): string[];
  registerSchema(key: string, schema: any): void;
  getAll(showSensitive?: boolean): Record<string, any>;
  reset(): Promise<boolean>;
}

export class ConfigManager implements IConfigManager {
  private config: Record<string, any>;
  private configPath: string;
  private initialized: boolean;

  constructor() {
    this.config = {};
    this.configPath = path.join(os.homedir(), '.swissknife', 'config.json');
    this.initialized = false;
  }

  /**
   * Initialize the configuration manager
   * 
   * @returns {Promise<boolean>} Promise resolving to success status
   */
  async initialize(): Promise<boolean> {
    try {
      await this.load();
      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize configuration manager', error);
      return false;
    }
  }

  /**
   * Load configuration from disk
   * 
   * @returns {Promise<boolean>} Promise resolving to success status
   */
  async load(): Promise<boolean> {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(data);
      } else {
        // Use default config if file doesn't exist
        this.config = this.getDefaultConfig();
        await this.save();
      }
      return true;
    } catch (error) {
      logger.error('Failed to load configuration', error);
      // Fall back to default config
      this.config = this.getDefaultConfig();
      return false;
    }
  }

  /**
   * Save configuration to disk
   * 
   * @returns {Promise<boolean>} Promise resolving to success status
   */
  async save(): Promise<boolean> {
    try {
      // Create directory if it doesn't exist
      const configDir = path.join(os.homedir(), '.swissknife');
      if (!fs.existsSync(configDir)) {
        await fsPromises.mkdir(configDir, { recursive: true });
      }

      // Write config file
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (error) {
      logger.error('Failed to save configuration', error);
      return false;
    }
  }

  /**
   * Get default configuration
   * 
   * @returns {Object} Default configuration object
   */
  getDefaultConfig(): Record<string, any> {
    return {
      // Add some default values that tests might expect
      defaultLanguage: 'en',
      logLevel: 'info',
      maxRetries: 3,
      models: {
        default: 'gpt-4o',
        providers: {
          'openai': {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: ''
          },
          'anthropic': {
            baseUrl: 'https://api.anthropic.com',
            apiKey: ''
          }
        }
      },
      storage: {
        type: 'local',
        path: path.join(os.homedir(), '.swissknife', 'storage')
      },
      logging: {
        level: 'info',
        path: path.join(os.homedir(), '.swissknife', 'logs')
      },
      ui: {
        theme: 'dark',
        colors: {
          primary: 'blue',
          secondary: 'green'
        }
      }
    };
  }

  /**
   * Get a configuration value by key
   * 
   * @param {string} key Configuration key in dot notation
   * @param {any} defaultValue Default value if key is not found
   * @returns {any} Configuration value
   */
  get<T>(key: string, defaultValue?: T): T | undefined {
    if (!this.initialized) {
      throw new Error('Configuration manager not initialized');
    }

    const parts = key.split('.');
    let value: any = this.config;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return defaultValue;
      }
      value = value[part];
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set a configuration value by key
   * 
   * @param {string} key Configuration key in dot notation
   * @param {any} value Value to set
   * @returns {Promise<boolean>} Promise resolving to success status
   */
  async set(key: string, value: any): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Configuration manager not initialized');
    }

    const parts = key.split('.');
    let current: Record<string, any> = this.config;

    // Traverse the object, creating objects as needed
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    // Set the value
    current[parts[parts.length - 1]] = value;

    // Save to disk
    return this.save();
  }

  /**
   * Check if a configuration key exists
   * 
   * @param {string} key Configuration key in dot notation
   * @returns {boolean} True if key exists
   */
  has(key: string): boolean {
    if (!this.initialized) {
      throw new Error('Configuration manager not initialized');
    }

    const parts = key.split('.');
    let value: any = this.config;

    for (const part of parts) {
      if (value === undefined || value === null || typeof value !== 'object') {
        return false;
      }
      if (!(part in value)) {
        return false;
      }
      value = value[part];
    }

    return true;
  }

  /**
   * Delete a configuration key
   * 
   * @param {string} key Configuration key in dot notation
   * @returns {boolean} True if key was deleted
   */
  delete(key: string): boolean {
    if (!this.initialized) {
      throw new Error('Configuration manager not initialized');
    }

    const parts = key.split('.');
    if (parts.length === 0) return false;

    let current: Record<string, any> = this.config;

    // Navigate to parent object
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        return false; // Path doesn't exist
      }
      current = current[part];
    }

    const lastKey = parts[parts.length - 1];
    if (lastKey in current) {
      delete current[lastKey];
      this.save(); // Save changes
      return true;
    }

    return false;
  }

  /**
   * List all configuration keys (flattened dot notation)
   * 
   * @returns {string[]} Array of configuration keys
   */
  listKeys(): string[] {
    if (!this.initialized) {
      throw new Error('Configuration manager not initialized');
    }

    const keys: string[] = [];
    
    function flatten(obj: Record<string, any>, prefix = '') {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const newKey = prefix ? `${prefix}.${key}` : key;
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            flatten(obj[key], newKey);
          } else {
            keys.push(newKey);
          }
        }
      }
    }

    flatten(this.config);
    return keys;
  }

  /**
   * Register a schema for validation (stub implementation)
   * Note: This is a stub since JS version doesn't support Zod validation
   * 
   * @param {string} key Configuration key or prefix
   * @param {any} schema Schema object (ignored in JS implementation)
   */
  registerSchema(key: string, schema: any): void {
    // Stub implementation - JS version doesn't support validation
    // This is here for compatibility with TypeScript tests
    console.warn(`Schema registration not supported in JavaScript implementation (key: ${key})`);
    // @ts-ignore - schema parameter is intentionally unused in this stub implementation
    void schema;
  }

  /**
   * Get all configuration
   * 
   * @param {boolean} showSensitive Whether to show sensitive values (stub parameter)
   * @returns {Object} Complete configuration object
   */
  getAll(showSensitive = false): Record<string, any> {
    if (!this.initialized) {
      throw new Error('Configuration manager not initialized');
    }
    // @ts-ignore - showSensitive parameter is intentionally unused in this stub implementation
    void showSensitive;
    return this.config;
  }

  /**
   * Reset configuration to defaults
   * 
   * @returns {Promise<boolean>} Promise resolving to success status
   */
  async reset(): Promise<boolean> {
    this.config = this.getDefaultConfig();
    return this.save();
  }

  /**
   * Get the configuration manager instance (singleton)
   * 
   * @returns {ConfigManager} Singleton instance
   */
  static getInstance(): ConfigManager {
    if (!instance) {
      instance = new ConfigManager();
    }
    return instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    instance = null;
  }
}

// Export singleton accessor
export const getConfigManager = (): ConfigManager => ConfigManager.getInstance();

// Export alias for backward compatibility
export const ConfigurationManager = ConfigManager;
