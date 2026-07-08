import { spawn, type SpawnOptions } from 'node:child_process';
import process from 'node:process';
import * as filesystem from 'node:fs/promises';
import * as path from 'node:path';

export interface HostCommandExecution {
  command: string;
  args?: string[];
  options?: SpawnOptions;
}

export interface HostCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: NodeJS.Signals | null;
}

export const hostProcess = process;
export const hostFilesystem = filesystem;
export const hostPath = path;

export async function runHostCommand({
  command,
  args = [],
  options = {},
}: HostCommandExecution): Promise<HostCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (exitCode, signal) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 0,
        signal,
      });
    });
  });
}

export async function loadHostCommands(): Promise<typeof import('../commands.js')> {
  return import('../commands.js');
}

export async function loadHostCommandRegistry(): Promise<typeof import('../command-registry.js')> {
  return import('../command-registry.js');
}

export async function loadHostCliEntrypoint(): Promise<typeof import('../entrypoints/cli.js')> {
  return import('../entrypoints/cli.js');
}

export async function loadHostMcpEntrypoint(): Promise<typeof import('../entrypoints/mcp.js')> {
  return import('../entrypoints/mcp.js');
}

export function assertHostRuntime(): void {
  if (typeof process === 'undefined' || process.release?.name !== 'node') {
    throw new Error('SwissKnife host platform APIs require a Node.js process runtime.');
  }
}
