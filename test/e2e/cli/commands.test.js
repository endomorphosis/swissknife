/**
 * End-to-End Tests for Core CLI Commands
 *
 * These tests execute the compiled CLI (`cli.mjs`) as a child process
 * to verify the behavior of top-level commands like help, version,
 * config, and basic model execution.
 *
 * Key dependencies (ConfigurationManager, ServiceRegistry, specific services)
 * are mocked using Jest to isolate the CLI command parsing and execution logic.
 */

const path = require('path');
const { execFile } = require('child_process');

// --- Mock Setup ---

// Mock ConfigurationManager to provide controlled config data
// Note: Adjust path based on actual project structure relative to this test file
jest.mock('../../../src/config/manager', () => {
  // Using a simple in-memory mock for E2E tests
  const mockData = {
    models: { default: 'test-model' },
    apiKeys: { 'test-provider': ['test-api-key'] },
    // Add other necessary default configs
  };
  return {
    ConfigurationManager: {
      // Mock the singleton getInstance pattern if used
      getInstance: jest.fn().mockImplementation(() => ({
        get: jest.fn((key, defaultValue) => {
          // Basic key retrieval (e.g., 'models.default')
          const keys = key.split('.');
          let value = mockData;
          for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
              value = value[k];
            } else {
              return defaultValue;
            }
          }
          return value ?? defaultValue;
        }),
        set: jest.fn((key, value) => {
          // Basic key setting (e.g., 'test.value')
          const keys = key.split('.');
          let current = mockData;
          for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!current[k] || typeof current[k] !== 'object') {
              current[k] = {};
            }
            current = current[k];
          }
          current[keys[keys.length - 1]] = value;
          console.log(`MockConfig set: ${key} = ${value}`); // For debugging test
        }),
        list: jest.fn(() => mockData), // Return the whole mock data for list
        save: jest.fn().mockResolvedValue(undefined), // Mock save operation
        load: jest.fn(), // Mock load operation
      })),
    },
  };
});

// Mock ServiceRegistry and specific services needed by commands under test
// Note: Adjust path based on actual project structure
jest.mock('../../../src/services/registry', () => {
  // Mock ModelExecutionService
  const mockModelService = {
    execute: jest.fn().mockImplementation(async (task, options) => {
      // Simple mock response based on prompt
      const prompt = task.prompt || '';
      console.log(`MockModelService execute called with prompt: ${prompt}`); // For debugging test
      return Promise.resolve({
        response: `Mock response to: ${prompt}`,
        usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
        timingMs: 100,
      });
    }),
    // Add other methods if needed by commands
  };

  // Mock ServiceRegistry
  const mockServiceRegistry = {
    registerService: jest.fn(),
    getService: jest.fn((serviceName) => {
      if (serviceName === 'modelExecution') { // Assuming this is the name used
        return mockModelService;
      }
      // Return mocks for other services if needed by tested commands
      console.warn(`MockServiceRegistry: getService called for unmocked service "${serviceName}"`);
      return null;
    }),
  };

  return {
    ServiceRegistry: {
      // Mock the singleton getInstance pattern if used
      getInstance: jest.fn().mockReturnValue(mockServiceRegistry),
    },
  };
});


// --- Test Helper ---

/**
 * Executes the CLI script as a child process.
 * @param {string[]} args - Array of command line arguments.
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function runCLI(args) {
  // Adjust path to your compiled CLI entry point
  const cliPath = path.resolve(__dirname, '../../../dist/cli.mjs'); // Assuming output is in dist/

  return new Promise((resolve) => {
    execFile('node', [cliPath, ...args], { timeout: 15000 }, (error, stdout, stderr) => {
      // Resolve even if there's an error (non-zero exit code)
      resolve({
        stdout: stdout.toString().trim(),
        stderr: stderr.toString().trim(),
        exitCode: error ? error.code || 1 : 0, // Default to 1 if code is missing
      });
    });
  });
}

// --- Test Suite ---

describe('CLI Core Commands (E2E with Mocks)', () => {

  // Clear mocks before each test
  beforeEach(() => {
     // Reset mocks on the mocked modules if necessary (e.g., clear call counts)
     const configManagerInstance = require('../../../src/config/manager').ConfigurationManager.getInstance();
     configManagerInstance.get.mockClear();
     configManagerInstance.set.mockClear();
     configManagerInstance.list.mockClear();
     configManagerInstance.save.mockClear();

     const serviceRegistryInstance = require('../../../src/services/registry').ServiceRegistry.getInstance();
     serviceRegistryInstance.getService.mockClear();
     const modelService = serviceRegistryInstance.getService('modelExecution');
     if (modelService?.execute) {
        modelService.execute.mockClear();
     }
  });

  it('should display help information when called with --help', async () => {
    // Arrange
    const args = ['--help'];

    // Act
    const result = await runCLI(args);

    // Assert
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Usage: swissknife \[command]/i); // Check for usage string
    expect(result.stdout).toContain('Options:');
    expect(result.stdout).toContain('Commands:');
    expect(result.stderr).toBe('');
  });

  it('should display version information when called with --version', async () => {
    // Arrange
    const args = ['--version'];
    // Assuming version is read from package.json, which isn't mocked here,
    // but the command should still execute and output *something*.
    // A more robust test would mock package.json reading or inject version.

    // Act
    const result = await runCLI(args);

    // Assert
    expect(result.exitCode).toBe(0);
    // Match Semantic Version pattern
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    expect(result.stderr).toBe('');
  });

  it('should return a non-zero exit code and error message for an unknown command', async () => {
    // Arrange
    const args = ['this-is-not-a-real-command'];

    // Act
    const result = await runCLI(args);

    // Assert
    expect(result.exitCode).not.toBe(0); // Expect non-zero exit code
    expect(result.stderr).toMatch(/error: unknown command 'this-is-not-a-real-command'/i); // Check stderr for error
    expect(result.stdout).toBe(''); // Expect no stdout
  });

  it('should execute the "model execute" command successfully using mocks', async () => {
    // Arrange
    const prompt = 'Explain quantum physics simply.';
    const args = [
      'model', // Assuming 'model' is the command group
      'execute',
      '--model', 'test-model', // Use the model configured in mock
      '--', // Separator for positional prompt argument
      prompt
    ];
    const modelService = require('../../../src/services/registry').ServiceRegistry.getInstance().getService('modelExecution');


    // Act
    const result = await runCLI(args);

    // Assert
    expect(result.exitCode).toBe(0);
    expect(modelService.execute).toHaveBeenCalledTimes(1);
    // Check if the correct prompt was passed (might need more specific task structure check)
    // expect(modelService.execute).toHaveBeenCalledWith(expect.objectContaining({ prompt: prompt }), expect.anything());
    expect(result.stdout).toContain(`Mock response to: ${prompt}`);
    expect(result.stderr).toBe('');
  });

  it('should handle "config set" and "config get" commands using mocks', async () => {
    // Arrange
    const key = 'user.preference.theme';
    const value = 'dark';
    const setArgs = ['config', 'set', key, value];
    const getArgs = ['config', 'get', key];
    const configManagerInstance = require('../../../src/config/manager').ConfigurationManager.getInstance();

    // Act: Set the config value
    const setResult = await runCLI(setArgs);

    // Assert: Check set result and mock calls
    expect(setResult.exitCode).toBe(0);
    expect(setResult.stdout).toContain(`Set '${key}' to '${value}'`);
    expect(configManagerInstance.set).toHaveBeenCalledWith(key, value);
    expect(configManagerInstance.save).toHaveBeenCalled(); // Assume set triggers save

    // Act: Get the config value
    const getResult = await runCLI(getArgs);

    // Assert: Check get result and mock calls
    expect(getResult.exitCode).toBe(0);
    expect(getResult.stdout).toBe(value); // Expect the value itself to be printed
    expect(configManagerInstance.get).toHaveBeenCalledWith(key, undefined); // Check get was called
  });

  // Add more E2E tests for other core commands as they are implemented
  // e.g., 'config list', 'storage list /local', 'agent chat' (might be harder to test non-interactively)

});
