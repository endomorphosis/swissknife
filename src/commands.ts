// Import the new Command type and the registry
import type { Command } from './types/command';
import { CommandRegistry } from './command-registry.js';

// Import refactored command objects
import approvedToolsCommand from './commands/approved-tools.js';
import bugCommand from './commands/bug.js';
import clearCommand from './commands/clear.js';
import compactCommand from './commands/compact.js';
import { configCommand } from './commands/config.js'; // Changed to named import
import costCommand from './commands/cost.js';
import ctxVizCommand from './commands/ctx_viz.js';
import doctorCommand from './commands/doctor.js';
import { helpCommand } from './commands/help.js'; // Changed to named import
import initCommand from './commands/init.js';
import listenCommand from './commands/listen.js';
import loginCommand from './commands/login.js';
import logoutCommand from './commands/logout.js';
import mcpCommand from './commands/mcp.js';
import { modelCommand } from './commands/model.js'; // Changed to named import
import onboardingCommand from './commands/onboarding.js';
import prCommentsCommand from './commands/pr_comments.js';
import releaseNotesCommand from './commands/release-notes.js';
import resumeCommand from './commands/resume.js';
import reviewCommand from './commands/review.js';
import terminalSetupCommand from './commands/terminalSetup.js';

// Import MCP version management commands
import { mcpVersionCommands } from './commands/mcp-version-commands.js';

// Import Phase 1 integration commands
import gotCommand from './commands/got.js';
import schedulerCommand from './commands/scheduler.js';
import gooseCommand from './commands/goose.js';

// Import utilities
import { getMCPCommands } from './services/mcpClient.js';
import { memoize } from 'lodash-es';
import { isAnthropicAuthEnabled } from './utils/auth.js';

// Register all built-in commands
// Note: login() was previously a function call, now it's just the command object
const builtInCommands = [
  approvedToolsCommand,
  bugCommand,
  clearCommand,
  compactCommand,
  configCommand,
  costCommand,
  ctxVizCommand, // Was internal
  doctorCommand,
  helpCommand,
  initCommand,
  listenCommand, // Was internal
  mcpCommand,
  modelCommand,
  onboardingCommand,
  prCommentsCommand,
  releaseNotesCommand,
  resumeCommand, // Was internal
  reviewCommand,
  terminalSetupCommand,
  ...(isAnthropicAuthEnabled() ? [logoutCommand, loginCommand] : []),
  
  // MCP version management commands
  ...mcpVersionCommands,
  
  // Phase 1 integration commands
  gotCommand,
  schedulerCommand,
  gooseCommand,
];

CommandRegistry.getInstance().register(builtInCommands);


// --- Updated Functions ---

// Keep memoization for potentially expensive MCP command fetching
export const getCommands = memoize(async (): Promise<Command[]> => {
  // Fetch MCP commands and combine with registered built-in commands
  const mcpCommands = await getMCPCommands();
  CommandRegistry.getInstance().register(mcpCommands); // Register MCP commands too

  // Return all enabled commands from the registry
  return CommandRegistry.getInstance().listCommands().filter((cmd: Command) => cmd.isEnabled !== false); // Check explicitly for false
});

export async function hasCommand(commandName: string): Promise<boolean> {
  // Check against the registry after ensuring commands are loaded
  await getCommands(); // Ensure registry is populated
  return !!CommandRegistry.getInstance().getCommand(commandName);
}

export async function getCommand(commandName: string): Promise<Command> {
  // Get from the registry after ensuring commands are loaded
  await getCommands(); // Ensure registry is populated
  const command = CommandRegistry.getInstance().getCommand(commandName);
  if (!command) {
    // Generate error message based on currently available commands in registry
    const availableCommands = CommandRegistry.getInstance().listCommands()
      .filter((cmd: Command) => cmd.isEnabled !== false && cmd.isHidden !== true) // Filter enabled and not hidden
      .map((cmd: Command) => {
        const name = cmd.userFacingName();
        return cmd.aliases ? `${name} (aliases: ${cmd.aliases.join(', ')})` : name;
      })
      .join(', ');
    throw ReferenceError(
      `Command "${commandName}" not found. Available commands: ${availableCommands || 'None'}`,
    );
  }
  return command;
}

// Re-export the Command type from the new location
export type { Command };
