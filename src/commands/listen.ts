import type { Command, LocalCommand } from '../types/command'; // Updated import path
import { logError } from '../utils/log'; // Assuming .js extension
import { execFileNoThrow } from '../utils/execFileNoThrow'; // Assuming .js extension

const isEnabled =
  process.platform === 'darwin' &&
  ['iTerm.app', 'Apple_Terminal'].includes(process.env.TERM_PROGRAM || '');

const listenCommand: LocalCommand = {
  type: 'local',
  name: 'listen',
  description: 'Activates speech recognition and transcribes speech to text',
  options: [], // No options for this command
  isEnabled: isEnabled,
  isHidden: isEnabled,
  userFacingName() {
    return 'listen';
  },
  async handler(args, { abortController }) { // Renamed call to handler, args is unused
    // Start dictation using AppleScript
    const script = `tell application "System Events" to tell ¬
(the first process whose frontmost is true) to tell ¬
menu bar 1 to tell ¬
menu bar item "Edit" to tell ¬
menu "Edit" to tell ¬
menu item "Start Dictation" to ¬
if exists then click it`

    const { stderr, code } = await execFileNoThrow(
      'osascript',
      ['-e', script],
      abortController.signal,
    )

    if (code !== 0) {
      logError(`Failed to start dictation: ${stderr}`)
      return 'Failed to start dictation'
    }
    return 'Dictation started. Press esc to stop.';
  },
};

export default listenCommand;
