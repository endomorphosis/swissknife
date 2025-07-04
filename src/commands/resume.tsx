import * as React from 'react';
import type { Command, LocalJSXCommand } from '../types/command';
import { ResumeConversation } from '../screens/ResumeConversation';
// import { render } from 'ink'; // Rendering should happen outside the handler
import { CACHE_PATHS, loadLogList } from '../utils/log';
import type { Tool } from '../Tool';

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
    const logs = await loadLogList(CACHE_PATHS.messages());
    // TODO: Fetch commands, tools, and verbose flag from appropriate context/config
    const commands: Command[] = []; // Placeholder
    const tools: Tool[] = []; // Placeholder
    const verbose: boolean = false; // Placeholder

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
