/**
 * Mock configuration manager for tests
 * 
 * Provides a mock implementation of the configuration management system
 */

import { sampleConfigurations } from '../fixtures/config/config';

/**
 * Mock ConfigurationManager for testing
 */
export class MockConfigurationManager {
  constructor(initialConfig = sampleConfigurations.basic) {
    this.config = JSON.parse(JSON.stringify(initialConfig));
    this.initialized = true;
    
    // Mock methods
    this.get = jest.fn().mockImplementation((key, defaultValue) => {
      return this._getNestedValue(this.config, key, defaultValue);
    });
    
    this.set = jest.fn().mockImplementation((key, value) => {
      this._setNestedValue(this.config, key, value);
      return Promise.resolve(true);
    });
    
    this.getAll = jest.fn().mockReturnValue(this.config);
    
    this.save = jest.fn().mockResolvedValue(true);
    
    this.load = jest.fn().mockImplementation(() => {
      this.initialized = true;
      return Promise.resolve(true);
    });
    
    this.initialize = jest.fn().mockImplementation(() => {
      this.initialized = true;
      return Promise.resolve(true);
    });
    
    this.reset = jest.fn().mockImplementation(() => {
      this.config = JSON.parse(JSON.stringify(initialConfig));
      return Promise.resolve(true);
    });
  }
  
  /**
   * Helper to get a nested value from an object using dot notation
   * 
   * @param {Object} obj Object to get value from
   * @param {string} path Path in dot notation
   * @param {any} defaultValue Default value if path not found
   * @returns {any} Value at path or default
   */
  _getNestedValue(obj, path, defaultValue) {
    if (!path) return obj;
    
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === undefined || current === null || typeof current !== 'object') {
        return defaultValue;
      }
      
      current = current[part];
    }
    
    return current !== undefined ? current : defaultValue;
  }
  
  /**
   * Helper to set a nested value in an object using dot notation
   * 
   * @param {Object} obj Object to set value in
   * @param {string} path Path in dot notation
   * @param {any} value Value to set
   */
  _setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      
      if (!(part in current)) {
        current[part] = {};
      }
      
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }
}

/**
 * Create a mock configuration system
 * 
 * @param {Object} initialConfig Initial configuration
 * @returns {Object} Mock configuration system
 */
export function createMockConfig(initialConfig = sampleConfigurations.basic) {
  return new MockConfigurationManager(initialConfig);
}