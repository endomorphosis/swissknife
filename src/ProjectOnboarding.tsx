import * as React from 'react';
import { OrderedList } from '@inkjs/ui';
import { Box, Text } from 'ink';
import {
  getCurrentProjectConfig,
  getGlobalConfig,
  saveCurrentProjectConfig,
  saveGlobalConfig,
} from './utils/config.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import terminalSetup from './commands/terminalSetup.js';
import { getTheme } from './utils/theme.js';
import { RELEASE_NOTES } from './constants/releaseNotes.js';
import { gt } from 'semver';
import { isDirEmpty } from './utils/file.js';
import { MACRO } from './constants/macros.js';
import { PROJECT_FILE, PRODUCT_NAME } from './constants/product.js';

// Function to mark onboarding as complete
export function markProjectOnboardingComplete(): void {
  const projectConfig = getCurrentProjectConfig()
  if (!projectConfig.hasCompletedProjectOnboarding) {
    saveCurrentProjectConfig({
      ...projectConfig,
      hasCompletedProjectOnboarding: true,
    })
  }
}

function markReleaseNotesSeen(): void {
  const config = getGlobalConfig()
  saveGlobalConfig({
    ...config,
    lastReleaseNotesSeen: MACRO.VERSION,
  })
}

type Props = {
  workspaceDir: string
}

export default function ProjectOnboarding({
  workspaceDir,
}: Props): React.ReactNode {
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [hasReleaseNotes, setHasReleaseNotes] = React.useState(false);
  const [releaseNotesToShow, setReleaseNotesToShow] = React.useState<string[]>([]);

  React.useEffect(() => {
    const loadOnboardingData = async () => {
      const projectConfig = await getCurrentProjectConfig();
      setShowOnboarding(!projectConfig.hasCompletedProjectOnboarding);

      const config = await getGlobalConfig();
      const previousVersion = config.lastReleaseNotesSeen;

      let notes: string[] = [];
      if (!previousVersion || gt(MACRO.VERSION, previousVersion)) {
        notes = RELEASE_NOTES[MACRO.VERSION] || [];
      }
      setHasReleaseNotes(notes.length > 0);
      setReleaseNotesToShow(notes);

      if (notes.length > 0 && !showOnboarding) {
        markReleaseNotesSeen();
      }
    };
    loadOnboardingData();
  }, [showOnboarding]);

  // We only want to show either onboarding OR release notes (with preference for onboarding)
  // If there's no onboarding to show and no release notes, return null
  if (!showOnboarding && !hasReleaseNotes) {
    return null
  }

  // Load what we need for onboarding
  // NOTE: This whole component is statically rendered Once
  const hasClaudeMd = existsSync(join(workspaceDir, PROJECT_FILE))
  const isWorkspaceDirEmpty = isDirEmpty(workspaceDir)
  const needsClaudeMd = !hasClaudeMd && !isWorkspaceDirEmpty
  const showTerminalTip =
    terminalSetup.isEnabled && !getGlobalConfig().shiftEnterKeyBindingInstalled

  const theme = getTheme()

  return (
    <Box flexDirection="column" gap={1} padding={1} paddingBottom={0}>
      {showOnboarding && (
        <>
          <Text color={theme.secondaryText}>Tips for getting started:</Text>
          <OrderedList>
            {/* Collect all the items that should be displayed */}
            {(() => {
              const items = []

              if (isWorkspaceDirEmpty) {
                items.push(
                  <OrderedList.Item key="workspace">
                    <Text color={theme.secondaryText}>
                      Ask {PRODUCT_NAME} to create a new app or clone a
                      repository.
                    </Text>
                  </OrderedList.Item>,
                )
              }
              if (needsClaudeMd) {
                items.push(
                  <OrderedList.Item key="claudemd">
                    <Text color={theme.secondaryText}>
                      Run <Text color={theme.text}>/init</Text> to create
                      a&nbsp;
                      {PROJECT_FILE} file with instructions for {PRODUCT_NAME}.
                    </Text>
                  </OrderedList.Item>,
                )
              }

              if (showTerminalTip) {
                items.push(
                  <OrderedList.Item key="terminal">
                    <Text color={theme.secondaryText}>
                      Run <Text color={theme.text}>/terminal-setup</Text>
                      <Text bold={false}> to set up terminal integration</Text>
                    </Text>
                  </OrderedList.Item>,
                )
              }

              items.push(
                <OrderedList.Item key="questions">
                  <Text color={theme.secondaryText}>
                    Ask {PRODUCT_NAME} questions about your codebase.
                  </Text>
                </OrderedList.Item>,
              )

              items.push(
                <OrderedList.Item key="changes">
                  <Text color={theme.secondaryText}>
                    Ask {PRODUCT_NAME} to implement changes to your codebase.
                  </Text>
                </OrderedList.Item>,
              )

              return items
            })()}
          </OrderedList>
        </>
      )}

      {!showOnboarding && hasReleaseNotes && (
        <Box
          borderColor={getTheme().secondaryBorder}
          flexDirection="column"
          marginRight={1}
        >
          <Box flexDirection="column" gap={0}>
            <Box marginBottom={1}>
              <Text>🆕 What&apos;s new in v{MACRO.VERSION}:</Text>
            </Box>
            <Box flexDirection="column" marginLeft={1}>
              {releaseNotesToShow.map((note, noteIndex) => (
                <Text key={noteIndex} color={getTheme().secondaryText}>
                  • {note}
                </Text>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      {workspaceDir === homedir() && (
        <Text color={getTheme().warning}>
          Note: You have launched <Text bold>anon-code</Text> in your home
          directory. For the best experience, launch it in a project directory
          instead.
        </Text>
      )}
    </Box>
  )
}
