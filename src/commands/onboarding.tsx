import * as React from 'react';
import type { Command, LocalJSXCommand } from '../types/command';
import { Onboarding } from '../components/Onboarding';
import { clearTerminal } from '../utils/terminal';
import { getGlobalConfig, saveGlobalConfig } from '../utils/config';
import { clearConversation } from './clear.js';

const onboardingCommand: LocalJSXCommand = {
  type: 'local-jsx',
  name: 'onboarding',
  description: 'Run through the onboarding flow',
  options: [], // No options for this command
  isEnabled: true,
  isHidden: false,
  async handler(args, onDone, context) { // Renamed call to handler, args is unused
    await clearTerminal();
    const config = getGlobalConfig();
    saveGlobalConfig({
      ...config,
      theme: 'dark', // Force dark theme for onboarding?
    });

    return (
      <Onboarding
        onDone={async () => {
          // Pass the correct context structure if clearConversation expects it
          await clearConversation(context);
          onDone();
        }}
      />
    );
  },
  userFacingName() {
    return 'onboarding';
  },
};

export default onboardingCommand;
