import * as React from 'react.js.js.js.js.js';
import type { LocalJSXCommand } from '../types/command.js.js.js.js.js.js.js.js.js.js.js'; // Updated import path
import { ResumeConversation } from '../screens/ResumeConversation.js.js.js.js.js.js.js.js.js.js.js'; // Assuming .js extension
import { CACHE_PATHS, loadLogList } from '../utils/log.js.js.js.js.js.js.js.js.js.js.js'; // Assuming .js extension
import { getCommands } from '../commands.js.js.js.js.js.js.js.js.js.js.js';
import { getTools } from '../tools.js.js.js.js.js.js.js.js.js.js.js';

const resumeCommand: LocalJSXCommand = {
  type: 'local-jsx',
  name: 'resume',
  description: 'Resume a previous conversation',
  options: [], // No options for this command
  isEnabled: true,
  isHidden: false,
  userFacingName() {
    return 'resume';
  },
  async handler(args, onDone, context) { // Renamed call to handler, args is unused
    const [logs, commands, tools] = await Promise.all([
      loadLogList(CACHE_PATHS.messages()),
      getCommands(),
      getTools(false),
    ]);
    const verbose: boolean = false; // verbose mode not yet surfaced in command context

    // Return the element to be rendered by the main loop
    return (
      <ResumeConversation
        commands={commands}
        context={{ unmount: onDone }} // Pass onDone as unmount callback
        logs={logs}
        tools={tools}
        verbose={verbose}
      />
    );
  },
};

export default resumeCommand;
