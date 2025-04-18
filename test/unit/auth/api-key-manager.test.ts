/**
 * Unit Tests for the ApiKeyManager class (`src/auth/api-key-manager.js`).
 *
 * These tests verify the manager's ability to add, retrieve, remove, and list API keys,
 * handle environment variable integration, manage key rotation/invalidation (if implemented),
 * interact with encryption utilities, and persist keys via the ConfigurationManager.
 *
 * Dependencies (ConfigurationManager, encryption utils) are mocked.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
// Add .js extension
import { ApiKeyManager } from '../../../src/auth/api-key-manager.js'; // Adjust path
import { ConfigurationManager } from '../../../src/config/manager.js'; // Adjust path
import { createTempTestDir, removeTempTestDir, mockEnv } from '../../helpers/testUtils.js'; // Adjust path

// --- Mock Setup ---

// Mock encryption functions - Add .js extension
// Simulate simple prefixing for encryption/decryption
const mockEncryption = {
  encrypt: jest.fn((data: string) => `encrypted:${data}`),
  decrypt: jest.fn((data: string) => data.replace(/^encrypted:/, '')),
  generateKeyPair: jest.fn(() => ({ publicKey: 'mock-public-key', privateKey: 'mock-private-key' })),
};
jest.mock('../../../src/utils/encryption.js', () => mockEncryption); // Adjust path

// Mock ConfigurationManager singleton - Add .js extension
// Use an in-memory object to simulate config persistence for these tests
// Add index signature to allow string indexing
let mockConfigData: { apiKeys?: Record<string, string[]>; [key: string]: any } = {};
const mockConfigManagerInstance = {
    configPath: '', // Will be set in beforeEach
    initialize: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const keys = key.split('.');
        let value: any = mockConfigData; // Start with any type
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) { value = value[k]; }
            else { return defaultValue; }
        }
        return value ?? defaultValue;
    }),
    set: jest.fn().mockImplementation((key: string, value: any) => {
        const keys = key.split('.');
        let current: any = mockConfigData;
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!current[k] || typeof current[k] !== 'object') { current[k] = {}; }
            current = current[k];
        }
        current[keys[keys.length - 1]] = value;
    }),
    save: jest.fn().mockResolvedValue(undefined), // Mock save, data is in mockConfigData
};
jest.mock('../../../src/config/manager.js', () => ({ // Adjust path
  ConfigurationManager: {
    getInstance: jest.fn(() => mockConfigManagerInstance),
  },
}));

// --- Test Suite ---

describe('ApiKeyManager', () => {
  let apiKeyManager: ApiKeyManager;
  // Use the mocked instance type for clarity
  let configManager: jest.Mocked<typeof mockConfigManagerInstance>;
  let tempDir: string;
  let configPath: string;
  let restoreEnv: () => void;

  // Define environment variables for testing override/fallback
  const ENV_VARS = {
      'OPENAI_API_KEY': 'env-openai-key',
      'ANTHROPIC_API_KEY': 'env-anthropic-key',
      // Add other provider keys if needed
  };

  beforeAll(async () => {
    // Create temp directory for the mock config file
    tempDir = await createTempTestDir('api-key-manager-test');
    configPath = path.join(tempDir, 'test-config.json');

    // Mock environment variables
    restoreEnv = mockEnv(ENV_VARS);
  });

  afterAll(async () => {
    // Clean up temp directory and restore environment
    await removeTempTestDir(tempDir);
    restoreEnv();
  });

  beforeEach(async () => {
    // Reset mocks and config data
    jest.clearAllMocks();
    mockConfigData = { apiKeys: {} }; // Reset config state

    // Reset singletons (important for tests relying on initial state)
    (ConfigurationManager as any).instance = undefined; // Allow getInstance to return new mock
    (ApiKeyManager as any).instance = undefined;

    // Get mocked ConfigManager instance and set path
    configManager = ConfigurationManager.getInstance() as jest.Mocked<typeof mockConfigManagerInstance>;
    (configManager as any).configPath = configPath; // Set path on mock if needed by save/load
    await configManager.initialize(); // Initialize mock config manager

    // Initialize API key manager - it will use the mocked ConfigManager
    apiKeyManager = ApiKeyManager.getInstance();

    // Clear any keys potentially loaded from ENV during init (if applicable)
    // or ensure the mock starts clean via mockConfigData reset.
  });

  // --- Basic Operations ---

  describe('Basic Operations (Add, Get, Remove, List)', () => {
    it('should add a new API key for a provider', async () => {
      // Arrange
      const provider = 'openai';
      const key = 'test-openai-key-1';

      // Act
      await apiKeyManager.addApiKey(provider, key);

      // Assert
      // Verify config manager was used to set the encrypted key
      expect(configManager.set).toHaveBeenCalledWith(`apiKeys.${provider}`, [mockEncryption.encrypt(key)]);
      expect(configManager.save).toHaveBeenCalledTimes(1);

      // Verify retrieval (which involves decryption)
      const keys = await apiKeyManager.getApiKeys(provider);
      expect(keys).toEqual([key]);
      expect(mockEncryption.decrypt).toHaveBeenCalledWith(mockEncryption.encrypt(key));
    });

    it('should add multiple API keys for the same provider', async () => {
      // Arrange
      const provider = 'openai';
      const key1 = 'test-openai-key-1';
      const key2 = 'test-openai-key-2';

      // Act
      await apiKeyManager.addApiKey(provider, key1);
      await apiKeyManager.addApiKey(provider, key2); // Add second key

      // Assert
      // Check final state in mock config
      const expectedEncryptedKeys = [mockEncryption.encrypt(key1), mockEncryption.encrypt(key2)];
      expect(configManager.set).toHaveBeenCalledTimes(2);
      // Check the argument of the *last* call to set
      expect(configManager.set).toHaveBeenLastCalledWith(`apiKeys.${provider}`, expectedEncryptedKeys);
      expect(configManager.save).toHaveBeenCalledTimes(2);

      // Verify retrieval
      const keys = await apiKeyManager.getApiKeys(provider);
      expect(keys).toHaveLength(2);
      expect(keys).toEqual(expect.arrayContaining([key1, key2]));
    });

    it('should not add a duplicate API key for the same provider', async () => {
      // Arrange
      const provider = 'openai';
      const key = 'test-openai-key-duplicate';

      // Act
      await apiKeyManager.addApiKey(provider, key);
      await apiKeyManager.addApiKey(provider, key); // Add same key again

      // Assert
      // set should be called twice, but the final array should only contain one encrypted key
      expect(configManager.set).toHaveBeenCalledTimes(2);
      expect(configManager.set).toHaveBeenLastCalledWith(`apiKeys.${provider}`, [mockEncryption.encrypt(key)]);
      expect(configManager.save).toHaveBeenCalledTimes(2);

      // Verify retrieval
      const keys = await apiKeyManager.getApiKeys(provider);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toBe(key);
    });

    it('should remove an existing API key', async () => {
      // Arrange
      const provider = 'openai';
      const key1 = 'test-openai-key-toremove';
      const key2 = 'test-openai-key-tokeep';
      await apiKeyManager.addApiKey(provider, key1);
      await apiKeyManager.addApiKey(provider, key2);
      // Clear mocks from setup
      jest.clearAllMocks();

      // Act
      const removed = await apiKeyManager.removeApiKey(provider, key1);

      // Assert
      expect(removed).toBe(true);
      // Verify config manager was called to set the remaining key
      expect(configManager.set).toHaveBeenCalledWith(`apiKeys.${provider}`, [mockEncryption.encrypt(key2)]);
      expect(configManager.save).toHaveBeenCalledTimes(1);

      // Verify retrieval
      const keys = await apiKeyManager.getApiKeys(provider);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toBe(key2);
    });

    it('should return false when removing a non-existent API key', async () => {
      // Arrange
      const provider = 'openai';
      await apiKeyManager.addApiKey(provider, 'existing-key');
      jest.clearAllMocks();

      // Act
      const removed = await apiKeyManager.removeApiKey(provider, 'non-existent-key');

      // Assert
      expect(removed).toBe(false);
      // Verify config manager was NOT called to update/save
      expect(configManager.set).not.toHaveBeenCalled();
      expect(configManager.save).not.toHaveBeenCalled();
      const keys = await apiKeyManager.getApiKeys(provider);
      expect(keys).toEqual(['existing-key']); // Should remain unchanged
    });

    it('should list all providers that have stored keys', async () => {
      // Arrange
      await apiKeyManager.addApiKey('openai', 'key-a');
      await apiKeyManager.addApiKey('anthropic', 'key-b');
      await apiKeyManager.addApiKey('cohere', 'key-c');
      // Provider 'gemini' has no stored key

      // Act
      const providers = await apiKeyManager.getProviders();

      // Assert
      expect(providers).toHaveLength(3);
      expect(providers).toEqual(expect.arrayContaining(['openai', 'anthropic', 'cohere']));
      expect(providers).not.toContain('gemini');
    });

    it('should return an empty array if no keys are stored for a provider', async () => {
        // Arrange (no keys added)

        // Act
        const keys = await apiKeyManager.getApiKeys('nonexistent-provider');

        // Assert
        expect(keys).toEqual([]);
    });
  });

  // --- Environment Variable Integration ---

  describe('Environment Variable Integration', () => {
    it('should detect and return API keys from environment variables if no stored keys exist', async () => {
      // Arrange (ENV vars set in beforeAll, no keys stored in beforeEach)

      // Act
      const openaiKey = await apiKeyManager.getBestApiKey('openai');
      const anthropicKey = await apiKeyManager.getBestApiKey('anthropic');
      const cohereKey = await apiKeyManager.getBestApiKey('cohere'); // No ENV var for this

      // Assert
      expect(openaiKey).toBe(ENV_VARS.OPENAI_API_KEY);
      expect(anthropicKey).toBe(ENV_VARS.ANTHROPIC_API_KEY);
      expect(cohereKey).toBeUndefined(); // No stored key, no ENV var
    });

    it('should prioritize environment variables by default when getting the best key', async () => {
      // Arrange: Add a stored key
      const storedOpenaiKey = 'stored-openai-key';
      await apiKeyManager.addApiKey('openai', storedOpenaiKey);

      // Act: Get best key (default behavior)
      const bestKey = await apiKeyManager.getBestApiKey('openai');

      // Assert: Should return the ENV var key
      expect(bestKey).toBe(ENV_VARS.OPENAI_API_KEY);
    });

    it('should prioritize stored keys over environment variables when preferStored=true', async () => {
      // Arrange: Add a stored key
      const storedOpenaiKey = 'stored-openai-key';
      await apiKeyManager.addApiKey('openai', storedOpenaiKey);

      // Act: Get best key with preferStored = true
      const bestKey = await apiKeyManager.getBestApiKey('openai', { preferStored: true });

      // Assert: Should return the stored key
      expect(bestKey).toBe(storedOpenaiKey);
    });

    it('should return stored key if preferStored=true even if no ENV var exists', async () => {
        // Arrange: Add stored key for provider without ENV var
        const storedCohereKey = 'stored-cohere-key';
        await apiKeyManager.addApiKey('cohere', storedCohereKey);

        // Act
        const bestKey = await apiKeyManager.getBestApiKey('cohere', { preferStored: true });

        // Assert
        expect(bestKey).toBe(storedCohereKey);
    });

    it('should return all keys (ENV + stored) when getting all keys', async () => {
        // Arrange: Add stored key
        const storedOpenaiKey = 'stored-openai-key';
        await apiKeyManager.addApiKey('openai', storedOpenaiKey);

        // Act
        const allKeys = await apiKeyManager.getApiKeys('openai', { includeEnvVar: true });

        // Assert
        expect(allKeys).toHaveLength(2);
        expect(allKeys).toEqual(expect.arrayContaining([ENV_VARS.OPENAI_API_KEY, storedOpenaiKey]));
    });

     it('should return only stored keys when getting keys with includeEnvVar=false', async () => {
        // Arrange: Add stored key
        const storedOpenaiKey = 'stored-openai-key';
        await apiKeyManager.addApiKey('openai', storedOpenaiKey);

        // Act
        const storedOnlyKeys = await apiKeyManager.getApiKeys('openai', { includeEnvVar: false });

        // Assert
        expect(storedOnlyKeys).toHaveLength(1);
        expect(storedOnlyKeys).toEqual([storedOpenaiKey]);
    });
  });

  // --- Security Features (Encryption) ---

  describe('Security Features (Encryption)', () => {
    // Note: These tests rely on the mock encryption implementation

    it('should encrypt keys before storing them in config', async () => {
      // Arrange
      const provider = 'openai';
      const key = 'super-secret-key';
      const expectedEncryptedKey = `encrypted:${key}`;

      // Act
      await apiKeyManager.addApiKey(provider, key);

      // Assert
      // Verify encryption function was called
      expect(mockEncryption.encrypt).toHaveBeenCalledWith(key);
      // Verify the value set in config manager was the encrypted one
      expect(configManager.set).toHaveBeenCalledWith(`apiKeys.${provider}`, [expectedEncryptedKey]);
    });

    it('should decrypt keys when retrieving them', async () => {
      // Arrange: Manually set an encrypted key in the mock config
      const provider = 'openai';
      const originalKey = 'super-secret-key';
      const encryptedKey = `encrypted:${originalKey}`;
      mockConfigData = { apiKeys: { [provider]: [encryptedKey] } };
      // Reset manager to load the new mock config state
      // Remove incorrect reset call: resetModelRegistrySingleton();
      (ApiKeyManager as any).instance = undefined;
      apiKeyManager = ApiKeyManager.getInstance();

      // Act: Retrieve the key(s)
      const keys = await apiKeyManager.getApiKeys(provider);
      const bestKey = await apiKeyManager.getBestApiKey(provider); // Should also decrypt

      // Assert
      // Verify decryption was called (likely multiple times if getBestApiKey calls getApiKeys)
      expect(mockEncryption.decrypt).toHaveBeenCalledWith(encryptedKey);
      // Verify the retrieved keys are decrypted
      expect(keys).toEqual([originalKey]);
      expect(bestKey).toBe(originalKey);
    });
  });

  // --- Optional Features (Rotation, Invalidation, Usage - Add if implemented) ---

  // describe('Key Rotation and Management', () => { ... });
  // describe('Key Validation', () => { ... });
  // describe('Master Password', () => { ... });
  // describe('Persistence Across Sessions', () => { ... });
  // describe('Import/Export', () => { ... });

});
