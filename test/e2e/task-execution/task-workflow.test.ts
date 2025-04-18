/**
 * End-to-End Tests for Task Execution Workflows
 *
 * These tests verify various workflows related to task execution using the CLI,
 * including creation, sync/async execution, cancellation, listing, filtering,
 * dependencies, and batch operations.
 *
 * Assumes the CLI is built and task types like 'test-task', 'error-task', etc.
 * are registered within the application for testing purposes.
 */

import * as path from 'path';
import * as childProcess from 'child_process';
import * as util from 'util';
import * as fs from 'fs/promises'; // Use imported fs
// Assuming these helpers exist and function correctly - Add .js extension
import { createTempTestDir, removeTempTestDir, mockEnv, waitFor } from '../../helpers/testUtils.js';
// Assuming this fixture generator exists - Add .js extension
import { generateConfigFixtures } from '../../helpers/fixtures.js';

// Promisify exec for async/await usage
const exec = util.promisify(childProcess.exec);

// --- Test Setup ---

describe('Task Execution Workflows (E2E)', () => {
  let tempDir: string;
  let configPath: string;
  let restoreEnv: () => void;
  const cliEntryPoint = path.resolve(__dirname, '../../../dist/cli.mjs'); // Assuming build output

  beforeAll(async () => {
    // 1. Create temp directory
    tempDir = await createTempTestDir('task-workflow-e2e');

    // 2. Generate and write configuration fixtures
    const fixtures = generateConfigFixtures(); // Assuming this provides necessary mock config
    configPath = path.join(tempDir, 'config.json');
    // Ensure config includes necessary task/worker settings if needed by tests
    const testConfig = {
        ...fixtures.config,
        task: { // Corrected from 'tasks'
            ...(fixtures.config.task || {}), // Corrected from 'tasks'
            // Add specific settings for task tests if needed
            logPath: path.join(tempDir, 'logs'), // Use temp dir for logs
            defaultTimeout: 30000,
        },
        // Add worker config if needed by tests, based on fixture structure
        worker: {
             ...(fixtures.config.worker || {}),
             poolSize: 1, // Keep low for predictable testing
        },
        logging: { level: 'warn' } // Keep logs quieter
    };
    await fs.mkdir(path.join(tempDir, 'logs'), { recursive: true }); // Ensure logs dir exists
    await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));

    // 3. Mock environment variables
    restoreEnv = mockEnv({
      'SWISSKNIFE_CONFIG_PATH': configPath,
      // Add other necessary env vars
    });
    console.log(`E2E Task Workflow Tests: Using temp directory ${tempDir}`);
  });

  afterAll(async () => {
    // Clean up temp directory and restore environment
    await removeTempTestDir(tempDir);
    restoreEnv();
    console.log(`E2E Task Workflow Tests: Cleaned up temp directory ${tempDir}`);
  });

  // --- Helper Functions ---

  /**
   * Executes a SwissKnife CLI command.
   * @param command The command string (e.g., 'task list --status pending')
   * @returns Promise<{ stdout: string; stderr: string; exitCode: number }>
   */
  async function runCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const commandToRun = `node ${cliEntryPoint} ${command}`;
    try {
      // Execute command within the temp directory context
      const { stdout, stderr } = await exec(commandToRun, { cwd: tempDir });
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (error: any) {
      // exec throws an error for non-zero exit codes
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

  describe('Simple Task Workflow', () => {
    let taskId: string | null; // Store taskId for use across tests in this suite

    beforeEach(async () => {
        // Create a fresh task before each test in this suite
        const createResult = await runCommand('task create test-task "Simple Workflow Task" --input "workflow-data"');
        expect(createResult.exitCode).toBe(0);
        taskId = extractTaskId(createResult.stdout);
        expect(taskId).toBeTruthy(); // Ensure taskId was extracted
    });

    it('should create, implicitly execute, and verify completion', async () => {
      // Arrange (Task created in beforeEach)
      expect(taskId).not.toBeNull(); // Ensure taskId is set

      // Act: Wait for the task to complete (polling status)
      let finalStatus = '';
      const completed = await waitFor(async () => {
        const statusResult = await runCommand(`task status ${taskId!}`); // Use non-null assertion
        if (statusResult.stdout.includes('Succeeded') || statusResult.stdout.includes('Failed')) {
          finalStatus = statusResult.stdout.includes('Succeeded') ? 'Succeeded' : 'Failed';
          return true; // Stop waiting once finished
        }
        return false; // Continue waiting
      }, { timeout: 15000, interval: 500 }); // Adjust timing as needed

      // Assert
      expect(completed).toBe(true); // Check if waitFor completed successfully
      expect(finalStatus).toBe('Succeeded');
    }, 20000); // Increase Jest timeout for this test

    it('should allow cancellation of a pending/ready task', async () => {
      // Arrange (Task created in beforeEach, assume it's still Pending/Ready)
      expect(taskId).not.toBeNull();
      const initialStatus = await runCommand(`task status ${taskId!}`);
      // Task might become Ready very quickly, so check for either
      expect(initialStatus.stdout).toMatch(/Status: (Pending|Ready)/i);

      // Act: Cancel the task
      const cancelResult = await runCommand(`task cancel ${taskId!}`);

      // Assert: Check cancellation command output
      expect(cancelResult.stderr).toBe('');
      expect(cancelResult.exitCode).toBe(0);
      expect(cancelResult.stdout).toMatch(/Task .* cancelled/i);

      // Verify final status is Cancelled
      const finalStatusResult = await runCommand(`task status ${taskId!}`);
      expect(finalStatusResult.exitCode).toBe(0);
      expect(finalStatusResult.stdout).toMatch(/Status: Cancelled/i);
    });
  });

  describe('Task Listing and Filtering', () => {
    // Setup: Create a diverse set of tasks before running these tests
    beforeAll(async () => {
      console.log("Setting up tasks for listing/filtering tests...");
      const commands = [
        'task create list-task "Pending Task A" --input pA --priority 10', // High prio
        'task create list-task "Pending Task B" --input pB --priority 50', // Med prio
        'task create other-task "Other Pending" --input oP',
      ];
      // Run sequentially to ensure they exist before completion/cancellation steps
      for (const cmd of commands) { await runCommand(cmd); await new Promise(res => setTimeout(res, 50)); }

      // Create and complete a task
      const createComplete = await runCommand('task create list-task "Completed Task" --input c --priority 1');
      const completeId = extractTaskId(createComplete.stdout);
      if (completeId) {
        // Wait specifically for this task to complete
        await waitFor(async () => (await runCommand(`task status ${completeId}`)).stdout.includes('Succeeded'), { timeout: 15000 });
      } else {
        console.warn("Could not extract ID for completed task in setup.");
      }

      // Create and cancel a task
      const createCancel = await runCommand('task create list-task "Cancelled Task" --input x');
      const cancelId = extractTaskId(createCancel.stdout);
      if (cancelId) {
        await runCommand(`task cancel ${cancelId}`);
        // Verify cancellation took effect
        await waitFor(async () => (await runCommand(`task status ${cancelId}`)).stdout.includes('Cancelled'), { timeout: 5000 });
      } else {
        console.warn("Could not extract ID for cancelled task in setup.");
      }

      console.log("Finished setting up tasks for listing/filtering tests.");
    }, 30000); // Longer timeout for setup

    it('should list tasks, including different states when using --all', async () => {
      // Act
      const result = await runCommand('task list --all');

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Pending Task A');
      expect(result.stdout).toContain('Pending Task B');
      expect(result.stdout).toContain('Other Pending');
      expect(result.stdout).toContain('Completed Task');
      expect(result.stdout).toContain('Cancelled Task');
    });

    it('should filter tasks by status (Pending/Ready)', async () => {
      // Act
      // Combine Pending and Ready as execution might be fast
      const result = await runCommand('task list --status Pending,Ready --all');

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toMatch(/Pending Task A|Pending Task B|Other Pending/);
      expect(result.stdout).not.toContain('Completed Task');
      expect(result.stdout).not.toContain('Cancelled Task');
    });

    it('should filter tasks by status (Succeeded)', async () => {
        // Act
        const result = await runCommand('task list --status Succeeded --all');

        // Assert
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('Completed Task');
        expect(result.stdout).not.toContain('Pending Task');
        expect(result.stdout).not.toContain('Cancelled Task');
    });

     it('should filter tasks by status (Cancelled)', async () => {
        // Act
        const result = await runCommand('task list --status Cancelled --all');

        // Assert
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('Cancelled Task');
        expect(result.stdout).not.toContain('Pending Task');
        expect(result.stdout).not.toContain('Completed Task');
    });

    it('should filter tasks by type', async () => {
      // Act
      const listTaskResult = await runCommand('task list --type list-task --all');
      const otherTaskResult = await runCommand('task list --type other-task --all');

      // Assert
      expect(listTaskResult.exitCode).toBe(0);
      expect(listTaskResult.stderr).toBe('');
      expect(listTaskResult.stdout).toContain('Pending Task A'); // From setup
      expect(listTaskResult.stdout).toContain('Completed Task'); // From setup
      expect(listTaskResult.stdout).toContain('Cancelled Task'); // From setup
      expect(listTaskResult.stdout).not.toContain('Other Pending'); // Different type

      expect(otherTaskResult.exitCode).toBe(0);
      expect(otherTaskResult.stderr).toBe('');
      expect(otherTaskResult.stdout).toContain('Other Pending'); // From setup
      expect(otherTaskResult.stdout).not.toContain('Pending Task A'); // Different type
    });

    // Note: Filtering by priority might be less reliable if priorities change dynamically
    it('should filter tasks by priority (if supported and stable)', async () => {
       // Act
      const highResult = await runCommand('task list --priority 10 --all'); // Assuming 10 is high

      // Assert
      expect(highResult.exitCode).toBe(0);
      expect(highResult.stderr).toBe('');
      expect(highResult.stdout).toContain('Pending Task A');
      expect(highResult.stdout).not.toContain('Pending Task B'); // Assumes B has different priority (50)
    });

    it('should support combined filters (status and type)', async () => {
      // Act
      const combinedResult = await runCommand('task list --status Pending,Ready --type list-task --all');

      // Assert
      expect(combinedResult.exitCode).toBe(0);
      expect(combinedResult.stderr).toBe('');
      expect(combinedResult.stdout).toContain('Pending Task A');
      expect(combinedResult.stdout).toContain('Pending Task B');
      expect(combinedResult.stdout).not.toContain('Other Pending');
      expect(combinedResult.stdout).not.toContain('Completed Task');
      expect(combinedResult.stdout).not.toContain('Cancelled Task');
    });
  });

  describe('Task Dependencies Workflow', () => {
    it('should execute dependent task only after parent completes', async () => {
      // Arrange: Create parent task
      const parentResult = await runCommand('task create simple-task "ParentDep E2E" --input parent-data');
      const parentId = extractTaskId(parentResult.stdout);
      expect(parentId).toBeTruthy(); // Corrected assertion

      // Arrange: Create child task depending on parent
      const childResult = await runCommand(`task create simple-task "ChildDep E2E" --input child-data --dependency ${parentId}`);
      const childId = extractTaskId(childResult.stdout);
      expect(childId).toBeTruthy(); // Corrected assertion

      // Assert 1: Child should be Pending or Ready initially
      const initialChildStatus = await runCommand(`task status ${childId}`);
      expect(initialChildStatus.stdout).toMatch(/Status: (Pending|Ready)/i);

      // Act 1: Wait for parent task to complete
      const parentCompleted = await waitFor(async () => {
        const status = await runCommand(`task status ${parentId}`);
        return status.stdout.includes('Succeeded');
      }, { timeout: 15000, interval: 500 });
      expect(parentCompleted).toBe(true); // Corrected assertion

      // Act 2: Wait for child task to complete (should become Ready and run now)
      let finalChildStatus = '';
      const childCompleted = await waitFor(async () => {
         const statusResult = await runCommand(`task status ${childId}`);
         if (statusResult.stdout.includes('Succeeded') || statusResult.stdout.includes('Failed')) {
           finalChildStatus = statusResult.stdout.includes('Succeeded') ? 'Succeeded' : 'Failed';
           return true;
         }
         return false;
      }, { timeout: 15000, interval: 500 });

      // Assert 2: Child should now be Succeeded
      expect(childCompleted).toBe(true); // Corrected assertion
      expect(finalChildStatus).toBe('Succeeded');
    }, 35000); // Longer Jest timeout
  });

  // Add tests for 'task chain', 'task batch', 'task graph' etc. if implemented and stable
});
