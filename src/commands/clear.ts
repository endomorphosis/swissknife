import type { Command, LocalCommand } from '../../types/command'; // Updated import path
import { getMessagesSetter } from '../messages';
import { getContext } from '../context';
import { getCodeStyle } from '../utils/style';
import { clearTerminal } from '../utils/terminal';
import { getOriginalCwd, setCwd } from '../utils/state';
import type { Message } from '../query';

export async function clearConversation(context: {
  setForkConvoWithMessagesOnTheNextRender: (
    forkConvoWithMessages: Message[],
  ) => void
}) {
  await clearTerminal()
  getMessagesSetter()([])
  context.setForkConvoWithMessagesOnTheNextRender([])
  getContext.cache.clear?.()
  getCodeStyle.cache.clear?.()
  await setCwd(getOriginalCwd());
}

const clearCommand: LocalCommand = {
  type: 'local',
  name: 'clear',
  description: 'Clear conversation history and free up context',
  options: [], // No options for this command
  isEnabled: true,
  isHidden: false,
  async handler(args, context) { // Renamed call to handler, args is unused but kept for signature
    await clearConversation(context);
    return 0; // Return 0 for success exit code
  },
  userFacingName() {
    return 'clear'
  },
};

export default clearCommand;
