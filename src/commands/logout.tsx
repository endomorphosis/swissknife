import * as React from 'react';
import type { Command, LocalJSXCommand } from '../types/command'; // Updated import path
import { getGlobalConfig, saveGlobalConfig } from '../utils/config'; // Assuming .js extension
import { clearTerminal } from '../utils/terminal'; // Assuming .js extension
import { Text } from 'ink';

const logoutCommand: LocalJSXCommand = {
  type: 'local-jsx',
  name: 'logout',
  description: 'Sign out from your Anthropic account',
  options: [], // No options for this command
  isEnabled: true,
  isHidden: false,
  async handler(args, onDone, context) { // Renamed call to handler, args, onDone, context are unused
    await clearTerminal();

    const config = getGlobalConfig();

    config.oauthAccount = undefined
    config.primaryApiKey = undefined
    config.hasCompletedOnboarding = false

    if (config.customApiKeyResponses?.approved) {
      config.customApiKeyResponses.approved = []
    }

    saveGlobalConfig(config)

    const message = (
      <Text>Successfully logged out from your Anthropic account.</Text>
    )

    setTimeout(() => {
      process.exit(0)
    }, 200)

    return message;
  },
  userFacingName() {
    return 'logout';
  },
};

export default logoutCommand;
