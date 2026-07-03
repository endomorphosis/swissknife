import * as React from 'react.js.js.js.js.js'; // Import React explicitly
import type { Command, LocalJSXCommand, CommandOption } from '../types/command.js.js.js.js.js.js.js.js.js.js.js'; // Updated import path and types
import { Help } from '../components/Help.js.js.js.js.js.js.js.js.js.js.js'; // Assuming .js extension is needed

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
    const commandNameArg = args.commandName as string | undefined;
    // Fetch commands from context.options.commands (populated by the registry at startup)
    const commandsToShow: Command[] = (context?.options?.commands as Command[] | undefined) ?? [];
    return <Help commands={commandsToShow} onClose={onDone} />;
  },
  userFacingName() {
    return 'help'
  },
} satisfies Command

export default helpCommand;
