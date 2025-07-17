// Mock common dependencies

import path from 'path';
import fs from 'fs/promises';
import os from 'os';

jest.mock("chalk", () => ({ default: (str: string) => str, red: (str: string) => str, green: (str: string) => str, blue: (str: string) => str }));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("fs", () => ({
  ...(jest.requireActual("fs") as any), // Import and retain default behavior
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
 * Universal test utilities (TypeScript ES Module version)
 */

// Test helper functions
export const createMockModel = function(id: string, name: string, provider: string) {
  return {
    id,
    name,
    provider,
    parameters: { temperature: 0.7 },
    metadata: { version: '1.0' }
  };
};

export const createTempTestDir = async function(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swissknife-test-'));
  return tempDir;
};

export const removeTempTestDir = async function(dirPath: string) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to remove temp directory:', error);
  }
};

export const createMockStorage = function() {
  return {
    store: jest.fn(),
    retrieve: jest.fn(),
    delete: jest.fn(),
    list: jest.fn()
  };
};

export const createMockLogger = function() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
};

// Mock implementations for common classes
export class MockModel {
  config: any; // Declare config property
  constructor(config: any) {
    this.config = config;
  }
  
  async execute(input: any) {
    return { output: `Mock output for ${input}` };
  }
};

export class MockStorage {
  data: Map<string, any>; // Declare data property
  constructor() {
    this.data = new Map();
  }
  
  async store(key: string, value: any) {
    this.data.set(key, value);
  }
  
  async retrieve(key: string) {
    return this.data.get(key);
  }
  
  async delete(key: string) {
    this.data.delete(key);
  }
  
  async list() {
    return Array.from(this.data.keys());
  }
};

export const testConfig = {
  tempDir: os.tmpdir(),
  timeout: 10000,
  retries: 3
};

// Function to mock environment variables
export const mockEnv = function(envVars: Record<string, string | undefined>) {
  const originalEnv: Record<string, string | undefined> = {};
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
export const restoreEnv = function() {
  // This function is returned by mockEnv, so it will have access to the originalEnv closure
  // No need to define it here, it's just a placeholder for clarity in the export.
};
