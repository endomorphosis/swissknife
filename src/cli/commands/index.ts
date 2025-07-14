// src/cli/commands/index.ts
// Register and export all CLI commands

import { Command } from 'commander';
import performanceCommand from './performanceCommand.js';
import releaseCommand from './releaseCommand.js';
import testCommand from './testCommand.js';
import documentationCommand from './documentationCommand.js';
import benchmarkCommand from './benchmarkCommand.js';

export class CLI {
  private program: Command;

  private constructor() {
    this.program = new Command();
    this.program.name('swissknife').description('SwissKnife CLI').version('0.0.1');
    this.registerCommands();
  }

  public static async create(): Promise<CLI> {
    const cli = new CLI();
    return cli;
  }

  private registerCommands(): void {
    this.program.addCommand(performanceCommand);
    this.program.addCommand(releaseCommand);
    this.program.addCommand(testCommand);
    this.program.addCommand(documentationCommand);
    this.program.addCommand(benchmarkCommand);

    // Add a help command if not already present
    this.program.helpOption('-h, --help', 'Display help for command');
  }

  public async run(argv: string[]): Promise<void> {
    await this.program.parseAsync(argv, { from: 'node' });
  }

  public renderHelp(): void {
    this.program.outputHelp();
  }

  public getCommands(): string[] {
    const commands: string[] = [];
    this.program.commands.forEach(cmd => {
      commands.push(cmd.name());
      cmd.aliases().forEach(alias => commands.push(alias));
    });
    return commands;
  }
}

export {
  performanceCommand,
  releaseCommand,
  testCommand,
  documentationCommand,
  benchmarkCommand
};