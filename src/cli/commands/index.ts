// src/cli/commands/index.ts
// Register and export all CLI commands

import { Command } from 'commander';
import performanceCommand from './performanceCommand.js';
import releaseCommand from './releaseCommand.js';
import testCommand from './testCommand.js';
import documentationCommand from './documentationCommand.js';
import benchmarkCommand from './benchmarkCommand.js';

// Function to register all Phase 5 commands with a commander instance
export function registerPhase5Commands(program: Command): void {
  program.addCommand(performanceCommand);
  program.addCommand(releaseCommand);
  program.addCommand(testCommand);
  program.addCommand(documentationCommand);
  program.addCommand(benchmarkCommand);
}

export {
  performanceCommand,
  releaseCommand,
  testCommand,
  documentationCommand,
  benchmarkCommand
};
