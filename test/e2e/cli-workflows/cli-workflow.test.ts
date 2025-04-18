/**
 * End-to-End Tests for Basic CLI Workflows
 *
 * These tests execute the compiled CLI as a child process to verify
 * common user workflows involving core commands like help, version,
 * config, model execution, and basic task management.
 *
 * It uses a temporary directory and configuration file, similar to
 * cli-task-integration.test.ts, but may use different mocks or fixtures.
 */

import * as path from 'path';
import * as childProcess from 'child_process';
import * as util from 'util';
import * as fs from 'fs/promises'; // Use imported fs
// Assuming these helpers exist and function correctly - Add .js extension
// Import only existing helpers
import { createTempTestDir, removeTempTestDir, mockEnv, waitFor } from '../../helpers/testUtils.js';
// Assuming this fixture generator exists
import { generateConfigFixtures } from '../../helpers/fixtures.js'; // Add .js extension if needed

// Promisify exec for async/await usage
const exec = util.promisify(childProcess.exec);

// --- Test Setup ---

describe('CLI Basic Workflows (E2E)', () => {
  let tempDir: string;
  let configPath: string;
  let restoreEnv: () => void;
  const cliEntryPoint = path.resolve(__dirname, '../../../dist/cli.mjs'); // Assuming build output

  beforeAll(async () => {
    // 1. Create temp directory
    tempDir = await createTempTestDir('cli-workflow-e2e');

    // 2. Generate and write configuration fixtures
    const fixtures = generateConfigFixtures(); // Assuming this provides necessary mock config
    configPath = path.join(tempDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(fixtures.config, null, 2));

    // 3. Mock environment variables
    restoreEnv = mockEnv({
      'SWISSKNIFE_CONFIG_PATH': configPath,
      'TEST_PROVIDER_1_API_KEY': 'test-api-key-1', // Example keys if needed by fixtures/tests
      'TEST_PROVIDER_2_API_KEY': 'test-api-key-2',
      // Add other necessary env vars
    });
    console.log(`E2E Workflow Tests: Using temp directory ${tempDir}`);
  });

  afterAll(async () => {
    // Clean up temp directory and restore environment
    await removeTempTestDir(tempDir);
    restoreEnv();
    console.log(`E2E Workflow Tests: Cleaned up temp directory ${tempDir}`);
  });

  // --- Helper Functions ---

  /**
   * Executes a SwissKnife CLI command.
   * @param command The command string (e.g., 'help', 'config get key')
   * @returns Promise<{ stdout: string; stderr: string; exitCode: number }>
   */
  async function runCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const commandToRun = `node ${cliEntryPoint} ${command}`;
    try {
      const { stdout, stderr } = await exec(commandToRun, { cwd: tempDir });
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout?.toString().trim() || '',
        stderr: error.stderr?.toString().trim() || '',
        exitCode: error.code || 1,
      };
    }
  }

  /**
   * Extracts a task ID from CLI output (adjust regex as needed).
   * @param output The stdout string from runCommand.
   * @returns The extracted task ID or null.
   */
  function extractTaskId(output: string): string | null {
    // Example regex, adjust based on actual "task create" output format
    const match = output.match(/Task created: (\S+)/i) || output.match(/Task ID: (\S+)/i);
    return match ? match[1] : null;
  }


  // --- Test Suites ---

  describe('Basic CLI Commands', () => {
    it('should show help information via "help" command', async () => {
      // Arrange
      const command = 'help';

      // Act
      const result = await runCommand(command);

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Usage: swissknife [command]');
      expect(result.stdout).toContain('Available commands');
    });

    it('should show version information via "version" command', async () => {
      // Arrange
      const command = 'version';

      // Act
      const result = await runCommand(command);

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Check for SemVer format
    });

    it('should handle unknown commands gracefully', async () => {
      // Arrange
      const command = 'non-existent-command --flag';

      // Act
      const result = await runCommand(command);

      // Assert
      expect(result.exitCode).not.toBe(0); // Expect non-zero exit code
      expect(result.stderr).toMatch(/error: unknown command/i);
      expect(result.stdout).toBe('');
    });
  });

  describe('Configuration Commands Workflow', () => {
    it('should get a default configuration value', async () => {
      // Arrange
      const key = 'models.default'; // Key from fixture
      const expectedValue = 'test-model-1'; // Value from fixture

      // Act
      const result = await runCommand(`config get ${key}`);

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe(expectedValue); // Expect exact value
    });

    it('should set and then get a configuration value', async () => {
      // Arrange
      const key = 'user.name';
      const value = 'test-user';

      // Act 1: Set value
      const setResult = await runCommand(`config set ${key} ${value}`);

      // Assert 1: Set operation succeeded
      expect(setResult.exitCode).toBe(0);
      expect(setResult.stderr).toBe('');
      expect(setResult.stdout).toContain(`Set '${key}' to '${value}'`);

      // Act 2: Get value to verify
      const getResult = await runCommand(`config get ${key}`);

      // Assert 2: Value was set and retrieved correctly
      expect(getResult.exitCode).toBe(0);
      expect(getResult.stderr).toBe('');
      expect(getResult.stdout).toBe(value);
    });

    // Add test for 'config list' if needed
  });

  describe('Model Execution Workflow', () => {
    // These tests rely on the mocks configured for the E2E environment
    // or potentially hitting a real test/staging backend if configured.
    // Assuming mocks are set up via jest.mock or similar.

    it('should execute a model with a given prompt', async () => {
      // Arrange
      const model = 'test-model-1'; // From fixture
      const prompt = '"Tell me a short story about a CLI tool."'; // Quote prompt
      const command = `model run ${model} ${prompt}`; // Assuming 'model run' exists

      // Act
      const result = await runCommand(command);

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Response:'); // Check for indicator
      // Add more specific checks based on expected mock response if possible
    });

    it('should list available models based on config/fixtures', async () => {
      // Arrange
      const command = 'model list'; // Assuming 'model list' exists

      // Act
      const result = await runCommand(command);

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('test-model-1'); // From fixture
      expect(result.stdout).toContain('test-model-2'); // From fixture
    });
  });

  describe('Basic Task Execution Workflow', () => {
    // These tests rely on the Task system being available and
    // mock task types ('test-task') being registered or handled.

    it('should create, execute (implicitly), and check status of a task', async () => {
      // Arrange
      const taskType = 'test-task'; // Assumed task type
      const taskDesc = '"Basic E2E Task"';
      const taskInput = '"e2e-input"';

      // Act 1: Create task
      const createResult = await runCommand(`task create ${taskType} ${taskDesc} --input ${taskInput}`);

      // Assert 1: Task creation succeeded
      expect(createResult.exitCode).toBe(0);
      expect(createResult.stderr).toBe('');
      expect(createResult.stdout).toContain('Task created:');
      const taskId = extractTaskId(createResult.stdout); // Use helper
      expect(taskId).toBeTruthy();

      // Act 2: Wait for task to complete (polling status)
      let finalStatus = '';
      const completed = await waitFor(async () => {
        const statusResult = await runCommand(`task status ${taskId}`);
        if (statusResult.stdout.includes('Succeeded') || statusResult.stdout.includes('Failed')) {
          finalStatus = statusResult.stdout.includes('Succeeded') ? 'Succeeded' : 'Failed';
          return true;
        }
        return false;
      }, { timeout: 20000, interval: 1000 }); // Adjust timing

      // Assert 2: Task completed successfully
      expect(completed).toBe(true);
      expect(finalStatus).toBe('Succeeded');

      // Act 3: Optionally get task result
      // const resultCmd = await runCommand(`task result ${taskId}`);
      // expect(resultCmd.exitCode).toBe(0);
      // expect(resultCmd.stdout).toContain(...);

    }, 25000); // Longer Jest timeout for workflow

    it('should list tasks including the newly created one', async () => {
       // Arrange: Create a task first
       await runCommand('task create test-task "List Test Task" --input "list-data"');

      // Act
      const result = await runCommand('task list --all'); // Use --all to see finished tasks

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('test-task'); // Check if type is listed
      expect(result.stdout).toContain('List Test Task'); // Check if description is listed
    });
  });
});
