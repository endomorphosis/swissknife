/**
 * CLI test helper utilities
 * 
 * Provides functions for executing CLI commands in tests and analyzing results
 */

import { execSync, exec } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);
const CLI_PATH = join(process.cwd(), 'cli.mjs');

/**
 * Execute a CLI command and return the result
 * 
 * @param {string[]} args Array of command arguments
 * @param {Object} options Additional options for execution
 * @returns {Object} Object containing stdout, stderr, and exitCode
 */
export function execCLI(args, options = {}) {
  const defaultOptions = {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NO_COLOR: '1'
    },
    timeout: 10000
  };

  const execOptions = {
    ...defaultOptions,
    ...options
  };

  try {
    const result = execSync(`node ${CLI_PATH} ${args.join(' ')}`, {
      ...execOptions,
      encoding: 'utf8'
    });

    return {
      stdout: result,
      stderr: '',
      exitCode: 0
    };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.status || 1
    };
  }
}

/**
 * Execute a CLI command asynchronously and return the result
 * 
 * @param {string[]} args Array of command arguments
 * @param {Object} options Additional options for execution
 * @returns {Promise<Object>} Promise resolving to object containing stdout, stderr, and exitCode
 */
export async function execCLIAsync(args, options = {}) {
  const defaultOptions = {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NO_COLOR: '1'
    },
    timeout: 10000
  };

  const execOptions = {
    ...defaultOptions,
    ...options
  };

  try {
    const { stdout, stderr } = await execPromise(`node ${CLI_PATH} ${args.join(' ')}`, {
      ...execOptions
    });

    return {
      stdout,
      stderr,
      exitCode: 0
    };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1
    };
  }
}

/**
 * Test runner for CLI commands that returns a formatted result
 */
export class CLITestRunner {
  constructor(options = {}) {
    this.options = {
      cwd: process.cwd(),
      env: { NODE_ENV: 'test', NO_COLOR: '1' },
      ...options
    };
  }

  /**
   * Run a CLI command
   * 
   * @param {string} command The command to run
   * @returns {Promise<Object>} The result of the command execution
   */
  async run(command) {
    const args = command.split(' ');
    return execCLIAsync(args, this.options);
  }

  /**
   * Run a CLI command synchronously
   * 
   * @param {string} command The command to run
   * @returns {Object} The result of the command execution
   */
  runSync(command) {
    const args = command.split(' ');
    return execCLI(args, this.options);
  }
}