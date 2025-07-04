import * as React from 'react'; // Import React explicitly
import type { Command, LocalJSXCommand, CommandOption } from '../types/command'; // Updated import path and types
import { Help } from '../components/Help'; // Assuming .js extension is needed

const helpCommand: LocalJSXCommand = {
  type: 'local-jsx',
  name: 'help',
  description: 'Show help and available commands',
  options: [
    {
      name: 'commandName',
      type: 'string',
      description: 'Show help for a specific command',
      required: false,
    } as CommandOption, // Added type assertion for clarity if needed
  ],
  isEnabled: true, // Assuming default behavior
  isHidden: false, // Assuming default behavior
  async handler(args, onDone, context) {
    // TODO: Refine context type if needed.
    // TODO: Fetch commands from commandRegistry instead of context.options.commands
    const commandNameArg = args.commandName as string | undefined;
    // The Help component might need updating to accept a specific command name later.
    // For now, pass an empty array or handle fetching commands differently.
    // Let's assume Help component can handle an empty array for now.
    const commandsToShow: Command[] = []; // Placeholder - Fetch from registry later
    return <Help commands={commandsToShow} onClose={onDone} />;
  },
  userFacingName() {
    return 'help'
  },
} satisfies Command

export default helpCommand;
