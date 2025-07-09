import * as React from 'react';
import type { Command, LocalJSXCommand } from '../../types/command'; // Updated import path
import { ConsoleOAuthFlow } from '../components/ConsoleOAuthFlow'; // Assuming .js extension
import { clearTerminal } from '../utils/terminal'; // Assuming .js extension
import { isLoggedInToAnthropic } from '../utils/auth'; // Assuming .js extension
import { useExitOnCtrlCD } from '../hooks/useExitOnCtrlCD'; // Assuming .js extension
import { Box, Text } from 'ink';
import { clearConversation } from './clear.js'; // Assuming .js extension

const loginCommand: LocalJSXCommand = {
  type: 'local-jsx',
  name: 'login',
  description: isLoggedInToAnthropic()
    ? 'Switch Anthropic accounts'
    : 'Sign in with your Anthropic account',
  options: [], // No options for this command
  isEnabled: true,
  isHidden: false,
  async handler(args, onDone, context) { // Renamed call to handler, args is unused
    await clearTerminal();
    return (
      <Login
        onDone={async () => {
          // Pass the correct context structure if clearConversation expects it
          // Assuming clearConversation needs the setForkConvo... part of the context
          await clearConversation(context);
          onDone();
        }}
      />
    );
  },
  userFacingName() {
    return 'login';
  },
};


// Login component remains the same
function Login(props: { onDone: () => void }) {
  const exitState = useExitOnCtrlCD(props.onDone);
  return (
    <Box flexDirection="column">
      <ConsoleOAuthFlow onDone={props.onDone} />
      <Box marginLeft={3}>
        <Text dimColor>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : (
            ''
          )}
        </Text>
      </Box>
    </Box>
  );
}

export default loginCommand;
