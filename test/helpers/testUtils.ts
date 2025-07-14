// Mock common dependencies

const path = require('path');
const fs = require('fs/promises');
const os = require('os');

jest.mock("chalk", () => ({ default: (str) => str, red: (str) => str, green: (str) => str, blue: (str) => str }));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("fs", () => ({
  ...(jest.requireActual("fs")), // Import and retain default behavior
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    rm: jest.fn(), // Add rm for recursive directory removal
    unlink: jest.fn(), // Add unlink for file deletion
  },
  existsSync: jest.fn(), // Mock synchronous existsSync
  mkdirSync: jest.fn(), // Mock synchronous mkdirSync
  rmSync: jest.fn(), // Mock synchronous rmSync
  unlinkSync: jest.fn(), // Mock synchronous unlinkSync
  writeFileSync: jest.fn(), // Mock synchronous writeFileSync
}));

/**
 * Universal test utilities (TypeScript CommonJS version)
 */

// Test helper functions
exports.createMockModel = function(id, name, provider) {
  return {
    id,
    name,
    provider,
    parameters: { temperature: 0.7 },
    metadata: { version: '1.0' }
  };
};

exports.createTempTestDir = async function() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swissknife-test-'));
  return tempDir;
};

exports.removeTempTestDir = async function(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to remove temp directory:', error);
  }
};

exports.createMockStorage = function() {
  return {
    store: jest.fn(),
    retrieve: jest.fn(),
    delete: jest.fn(),
    list: jest.fn()
  };
};

exports.createMockLogger = function() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
};

// Mock implementations for common classes
exports.MockModel = class MockModel {
  constructor(config) {
    this.config = config;
  }
  
  async execute(input) {
    return { output: `Mock output for ${input}` };
  }
};

exports.MockStorage = class MockStorage {
  constructor() {
    this.data = new Map();
  }
  
  async store(key, value) {
    this.data.set(key, value);
  }
  
  async retrieve(key) {
    return this.data.get(key);
  }
  
  async delete(key) {
    this.data.delete(key);
  }
  
  async list() {
    return Array.from(this.data.keys());
  }
};

exports.testConfig = {
  tempDir: os.tmpdir(),
  timeout: 10000,
  retries: 3
};

// Function to mock environment variables
exports.mockEnv = function(envVars) {
  const originalEnv = {};
  for (const key in envVars) {
    originalEnv[key] = process.env[key];
    process.env[key] = envVars[key];
  }
  return () => {
    for (const key in originalEnv) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  };
};

// Function to restore environment variables (this will be returned by mockEnv)
exports.restoreEnv = function() {
  // This function is returned by mockEnv, so it will have access to the originalEnv closure
  // No need to define it here, it's just a placeholder for clarity in the export.
};
