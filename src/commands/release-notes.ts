import { MACRO } from '../constants/macros';
import type { Command, LocalCommand, CommandOption } from '../../types/command'; // Updated import path
import { RELEASE_NOTES } from '../constants/releaseNotes'; // Assuming .js extension

const releaseNotesCommand: LocalCommand = {
  description: 'Show release notes for the current or specified version',
  options: [
    {
      name: 'version',
      type: 'string',
      description: 'Specify a version to show release notes for (defaults to current)',
      required: false,
    } as CommandOption,
  ],
  isEnabled: false, // Keep disabled for now
  isHidden: false,
  name: 'release-notes',
  userFacingName() {
    return 'release-notes';
  },
  type: 'local',
  async handler(args, context) { // Renamed call to handler, context is unused
    const currentVersion = MACRO.VERSION;

    // If a specific version is requested, show that version's notes
    const requestedVersion = args.version ? String(args.version).trim() : currentVersion;

    // Get the requested version's notes
    // Need to handle potential index signature issue if RELEASE_NOTES type is strict
    const notes = (RELEASE_NOTES as Record<string, string[]>)[requestedVersion];

    if (!notes || notes.length === 0) {
      return `No release notes available for version ${requestedVersion}.`
    }

    const header = `Release notes for version ${requestedVersion}:`
    const formattedNotes = notes.map(note => `• ${note}`).join('\n')

    return `${header}\n\n${formattedNotes}`;
  },
};

export default releaseNotesCommand;
