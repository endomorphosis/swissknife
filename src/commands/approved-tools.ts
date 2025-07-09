import type { Command, LocalCommand, CommandOption } from '../../types/command';
import {
  handleListApprovedTools,
  handleRemoveApprovedTool,
} from './approvedTools.js'; // Import handlers from the original file
import { getCwd } from '../utils/state'; // Assuming getCwd exists

const listSubCommand: LocalCommand = {
  type: 'local',
  name: 'list',
  description: 'List currently approved tools for the project',
  options: [],
  isEnabled: true,
  isHidden: false,
  async handler(args, context) {
    const cwd = await getCwd(); // Need current working directory
    return handleListApprovedTools(cwd);
  },
  userFacingName() { return 'list'; },
};

const removeSubCommand: LocalCommand = {
  type: 'local',
  name: 'remove',
  description: 'Remove a tool from the approved list',
  options: [
    {
      name: 'tool',
      type: 'string',
      description: 'The name of the tool to remove',
      required: true,
    } as CommandOption,
  ],
  isEnabled: true,
  isHidden: false,
  async handler(args, context) {
    const toolToRemove = args.tool as string;
    if (!toolToRemove) {
      return 'Error: Tool name is required.'; // Basic validation
    }
    const result = handleRemoveApprovedTool(toolToRemove);
    return result.message; // Return the message from the handler
  },
  userFacingName() { return 'remove'; },
};

const approvedToolsCommand: LocalCommand = {
  type: 'local',
  name: 'approved-tools',
  description: 'Manage the list of approved tools for the current project',
  options: [], // Options are defined in subcommands
  isEnabled: true, // Or based on project context?
  isHidden: false,
  subcommands: [listSubCommand, removeSubCommand],
  async handler(args, context) {
    // If no subcommand is specified, show help for this command
    // TODO: Integrate with CommandRegistry's help generation
    return `Usage: swissknife approved-tools <subcommand> [options]

Subcommands:
  list    List currently approved tools
  remove  Remove a tool from the approved list

Run 'swissknife approved-tools <subcommand> --help' for more details.`;
  },
  userFacingName() {
    return 'approved-tools';
  },
};

export default approvedToolsCommand;
