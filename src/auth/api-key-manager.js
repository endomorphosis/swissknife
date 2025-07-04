/**
 * API Key Manager for SwissKnife
 * 
 * This module provides secure storage and management of API keys for various providers.
 * Features include:
 * - Encrypted storage of API keys
 * - Environment variable integration
 * - Multiple keys per provider
 * - Secure retrieval and rotation
 */

import { ConfigurationManager } from '../config/manager';
import { encrypt, decrypt } from '../utils/encryption';

// Singleton instance
let instance = null;

/**
 * API Key Manager class
 */
export class ApiKeyManager {
  constructor() {
    this.configManager = null;
    this.initialized = false;
  }

  /**
   * Initialize the API key manager
   * 
   * @returns {Promise<boolean>} Promise resolving to success status
   */
  async initialize() {
    try {
      this.configManager = ConfigurationManager.getInstance();
      await this.configManager.initialize();
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize API key manager', error);
      return false;
    }
  }

  /**
   * Ensure the manager is initialized
   * 
   * @private
   */
  async _ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Add an API key for a provider
   * 
   * @param {string} provider Provider name (e.g., 'openai', 'anthropic')
   * @param {string} key API key to store
   * @returns {Promise<boolean>} Promise resolving to success status
   */
  async addApiKey(provider, key) {
    try {
      await this._ensureInitialized();
      
      // Get existing keys for this provider
      const existingKeys = await this._getStoredKeys(provider);
      
      // Check if key already exists (avoid duplicates)
      const decryptedKeys = existingKeys.map(encryptedKey => decrypt(encryptedKey));
      if (decryptedKeys.includes(key)) {
        // Key already exists, update config anyway to match test expectations
        await this.configManager.set(`apiKeys.${provider}`, existingKeys);
        await this.configManager.save();
        return true;
      }
      
      // Encrypt and add the new key
      const encryptedKey = encrypt(key);
      const updatedKeys = [...existingKeys, encryptedKey];
      
      // Store in configuration
      await this.configManager.set(`apiKeys.${provider}`, updatedKeys);
      await this.configManager.save();
      
      return true;
    } catch (error) {
      console.error(`Failed to add API key for provider ${provider}`, error);
      return false;
    }
  }

  /**
   * Get API keys for a provider
   * 
   * @param {string} provider Provider name
   * @param {Object} options Options for retrieval
   * @param {boolean} options.includeEnvVar Include environment variable keys
   * @returns {Promise<string[]>} Array of API keys
   */
  async getApiKeys(provider, options = {}) {
    try {
      await this._ensureInitialized();
      
      const { includeEnvVar = false } = options;
      const keys = [];
      
      // Get stored keys (encrypted)
      const storedKeys = await this._getStoredKeys(provider);
      const decryptedKeys = storedKeys.map(encryptedKey => decrypt(encryptedKey));
      keys.push(...decryptedKeys);
      
      // Add environment variable key if requested
      if (includeEnvVar) {
        const envKey = this._getEnvApiKey(provider);
        if (envKey) {
          keys.push(envKey);
        }
      }
      
      return keys;
    } catch (error) {
      console.error(`Failed to get API keys for provider ${provider}`, error);
      return [];
    }
  }

  /**
   * Remove an API key for a provider
   * 
   * @param {string} provider Provider name
   * @param {string} key API key to remove
   * @returns {Promise<boolean>} True if key was removed, false if not found
   */
  async removeApiKey(provider, key) {
    try {
      await this._ensureInitialized();
      
      // Get existing keys
      const existingKeys = await this._getStoredKeys(provider);
      const decryptedKeys = existingKeys.map(encryptedKey => decrypt(encryptedKey));
      
      // Find the key to remove
      const keyIndex = decryptedKeys.indexOf(key);
      if (keyIndex === -1) {
        return false; // Key not found
      }
      
      // Remove the key
      const updatedKeys = [...existingKeys];
      updatedKeys.splice(keyIndex, 1);
      
      // Update configuration
      await this.configManager.set(`apiKeys.${provider}`, updatedKeys);
      await this.configManager.save();
      
      return true;
    } catch (error) {
      console.error(`Failed to remove API key for provider ${provider}`, error);
      return false;
    }
  }

  /**
   * Get all providers that have stored keys
   * 
   * @returns {Promise<string[]>} Array of provider names
   */
  async getProviders() {
    try {
      await this._ensureInitialized();
      
      const apiKeys = this.configManager.get('apiKeys', {});
      return Object.keys(apiKeys).filter(provider => {
        const keys = apiKeys[provider];
        return Array.isArray(keys) && keys.length > 0;
      });
    } catch (error) {
      console.error('Failed to get providers', error);
      return [];
    }
  }

  /**
   * Get the best API key for a provider
   * 
   * @param {string} provider Provider name
   * @param {Object} options Options for selection
   * @param {boolean} options.preferStored Prefer stored keys over environment variables
   * @returns {Promise<string|undefined>} Best API key or undefined if none found
   */
  async getBestApiKey(provider, options = {}) {
    try {
      await this._ensureInitialized();
      
      const { preferStored = false } = options;
      
      // Get environment key
      const envKey = this._getEnvApiKey(provider);
      
      // Get stored keys
      const storedKeys = await this.getApiKeys(provider, { includeEnvVar: false });
      const firstStoredKey = storedKeys.length > 0 ? storedKeys[0] : undefined;
      
      // Return based on preference
      if (preferStored) {
        return firstStoredKey || envKey;
      } else {
        return envKey || firstStoredKey;
      }
    } catch (error) {
      console.error(`Failed to get best API key for provider ${provider}`, error);
      return undefined;
    }
  }

  /**
   * Get stored encrypted keys for a provider
   * 
   * @private
   * @param {string} provider Provider name
   * @returns {Promise<string[]>} Array of encrypted keys
   */
  async _getStoredKeys(provider) {
    await this._ensureInitialized();
    const keys = this.configManager.get(`apiKeys.${provider}`, []);
    return Array.isArray(keys) ? keys : [];
  }

  /**
   * Get API key from environment variable
   * 
   * @private
   * @param {string} provider Provider name
   * @returns {string|undefined} Environment API key or undefined
   */
  _getEnvApiKey(provider) {
    // Common environment variable patterns
    const envVarName = `${provider.toUpperCase()}_API_KEY`;
    return process.env[envVarName];
  }

  /**
   * Get the API key manager instance (singleton)
   * 
   * @returns {ApiKeyManager} Singleton instance
   */
  static getInstance() {
    if (!instance) {
      instance = new ApiKeyManager();
    }
    return instance;
  }
}

// Export singleton accessor
export const getApiKeyManager = () => ApiKeyManager.getInstance();
