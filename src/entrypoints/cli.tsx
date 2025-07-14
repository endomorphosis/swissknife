#!/usr/bin/env -S node --no-warnings=ExperimentalWarning --enable-source-maps
import { initSentry } from '../services/sentry'
import { PRODUCT_COMMAND, PRODUCT_NAME } from '../constants/product'
initSentry() // Initialize Sentry as early as possible

// XXX: Without this line (and the Object.keys, even though it seems like it does nothing!),
// there is a bug in Bun only on Win32 that causes this import to be removed, even though
// its use is solely because of its side-effects.
import * as dontcare from '@anthropic-ai/sdk/shims/node'
Object.keys(dontcare)

import React from 'react'
import { ReadStream } from 'tty'
import { openSync, existsSync } from 'fs'
import { render, RenderOptions } from 'ink'
import { REPL } from '../screens/REPL'
import { addToHistory } from '../history'
import { getContext, setContext, removeContext } from '../context'
import { ask } from '../utils/ask'
import { hasPermissionsToUseTool } from '../permissions'
import { getTools } from '../tools'
import {
  getGlobalConfig,
  getCurrentProjectConfig,
  saveGlobalConfig,
  saveCurrentProjectConfig,
  getCustomApiKeyStatus,
  normalizeApiKeyForConfig,
  setConfigForCLI,
  deleteConfigForCLI,
  getConfigForCLI,
  listConfigForCLI,
  enableConfigs,
} from '../utils/config'
import { cwd } from 'process'
import { dateToFilename, logError, parseLogFilename } from '../utils/log'
import { Onboarding } from '../components/Onboarding'
import { Doctor } from '../screens/Doctor'
import { ApproveApiKey } from '../components/ApproveApiKey'
import { TrustDialog } from '../components/TrustDialog'
import { checkHasTrustDialogAccepted } from '../utils/config'
import { isDefaultSlowAndCapableModel } from '../utils/model'
import { LogList } from '../screens/LogList'
import { ResumeConversation } from '../screens/ResumeConversation'
import { startMCPServer } from './mcp.js'
import { initIPFSNode, stopIPFSNode, addFile, getFile, resolveCID } from '../ipfs/index.ts'
import { env } from '../utils/env'
import { getCwd, setCwd, setOriginalCwd } from '../utils/state'
import { omit } from 'lodash-es'
import { getCommands } from '../commands'
import { getNextAvailableLogForkNumber, loadLogList } from '../utils/log'
import { loadMessagesFromLog } from '../utils/conversationRecovery'
import { cleanupOldMessageFilesInBackground } from '../utils/cleanup'
import {
  handleListApprovedTools,
  handleRemoveApprovedTool,
} from '../commands/approvedTools'
import {
  addMcpServer,
  getMcpServer,
  listMCPServers,
  parseEnvVars,
  removeMcpServer,
  getClients,
  ensureConfigScope,
} from '../services/mcpClient'
import { handleMcprcServerApprovals } from '../services/mcpServerApproval'
import { checkGate, initializeStatsig, logEvent } from '../services/statsig'
import { getExampleCommands } from '../utils/exampleCommands'
import { cursorShow } from 'ansi-escapes'
import ansiColors from 'ansi-colors'
import {
  getLatestVersion,
  installGlobalPackage,
  assertMinVersion,
} from '../utils/autoUpdater'
import { CACHE_PATHS } from '../utils/log'
import { PersistentShell } from '../utils/PersistentShell'
import { GATE_USE_EXTERNAL_UPDATER } from '../constants/betas'
import { clearTerminal } from '../utils/terminal'
import { showInvalidConfigDialog } from '../components/InvalidConfigDialog'
import { ConfigParseError } from '../utils/errors'
import { grantReadPermissionForOriginalDir } from '../utils/permissions/filesystem'
import { MACRO } from '../constants/macros'
import { CLI } from '../cli'; // Import the CLI class

export function completeOnboarding(): void {
  const config = getGlobalConfig()
  saveGlobalConfig({
    ...config,
    hasCompletedOnboarding: true,
    lastOnboardingVersion: MACRO.VERSION,
  })
}

async function showSetupScreens(
  dangerouslySkipPermissions?: boolean,
  print?: boolean,
): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  const config = getGlobalConfig()
  if (
    !config.theme ||
    !config.hasCompletedOnboarding // always show onboarding at least once
  ) {
    await clearTerminal()
    await new Promise<void>(resolve => {
      render(
        <Onboarding
          onDone={async () => {
            completeOnboarding()
            await clearTerminal()
            resolve()
          }}
        />,
        {
          exitOnCtrlC: false,
        },
      )
    })
  }

  // // Check for custom API key (only allowed for ants)
  // if (process.env.ANTHROPIC_API_KEY && process.env.USER_TYPE === 'ant') {
  //   const customApiKeyTruncated = normalizeApiKeyForConfig(
  //     process.env.ANTHROPIC_API_KEY!,
  //   )
  //   const keyStatus = getCustomApiKeyStatus(customApiKeyTruncated)
  //   if (keyStatus === 'new') {
  //     await new Promise<void>(resolve => {
  //       render(
  //         <ApproveApiKey
  //           customApiKeyTruncated={customApiKeyTruncated}
  //           onDone={async () => {
  //             await clearTerminal()
  //             resolve()
  //           }}
  //         />,
  //         {
  //           exitOnCtrlC: false,
  //         },
  //       )
  //     })
  //   }
  // }

  // In non-interactive or dangerously-skip-permissions mode, skip the trust dialog
  if (!print && !dangerouslySkipPermissions) {
    if (!checkHasTrustDialogAccepted()) {
      await new Promise<void>(resolve => {
        const onDone = () => {
          // Grant read permission to the current working directory
          grantReadPermissionForOriginalDir()
          resolve()
        }
        render(<TrustDialog onDone={onDone} />, {
          exitOnCtrlC: false,
        })
      })
    }

    // After trust dialog, check for any mcprc servers that need approval
    if (process.env.USER_TYPE === 'ant') {
      await handleMcprcServerApprovals()
    }
  }
}

function logStartup(): void {
  const config = getGlobalConfig()
  saveGlobalConfig({
    ...config,
    numStartups: (config.numStartups ?? 0) + 1,
  })
}

async function setup(
  cwd: string,
  dangerouslySkipPermissions?: boolean,
): Promise<void> {
  // Set both current and original working directory if --cwd was provided
  if (cwd !== process.cwd()) {
    setOriginalCwd(cwd)
  }
  await setCwd(cwd)

  // Always grant read permissions for original working dir
  grantReadPermissionForOriginalDir()

  // If --dangerously-skip-permissions is set, verify we're in a safe environment
  if (dangerouslySkipPermissions) {
    // Check if running as root/sudo on Unix-like systems
    if (
      process.platform !== 'win32' &&
      typeof process.getuid === 'function' &&
      process.getuid() === 0
    ) {
      console.error(
        `--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons`,
      )
      process.exit(1)
    }

    // Only await if --dangerously-skip-permissions is set
    const [isDocker, hasInternet] = await Promise.all([
      env.getIsDocker(),
      env.hasInternetAccess(),
    ])

    if (!isDocker || hasInternet) {
      console.error(
        `--dangerously-skip-permissions can only be used in Docker containers with no internet access but got Docker: ${isDocker} and hasInternet: ${hasInternet}`,
      )
      process.exit(1)
    }
  }

  if (process.env.NODE_ENV === 'test') {
    return
  }

  cleanupOldMessageFilesInBackground()
  // getExampleCommands() // Pre-fetch example commands
  getContext() // Pre-fetch all context data at once
  // initializeStatsig() // Kick off statsig initialization

  // Migrate old iterm2KeyBindingInstalled config to new shiftEnterKeyBindingInstalled
  const globalConfig = getGlobalConfig()
  if (
    globalConfig.iterm2KeyBindingInstalled === true &&
    globalConfig.shiftEnterKeyBindingInstalled !== true
  ) {
    const updatedConfig = {
      ...globalConfig,
      shiftEnterKeyBindingInstalled: true,
    }
    // Remove the old config property
    delete updatedConfig.iterm2KeyBindingInstalled
    saveGlobalConfig(updatedConfig)
  }

  // Check for last session's cost and duration
  const projectConfig = getCurrentProjectConfig()
  if (
    projectConfig.lastCost !== undefined &&
    projectConfig.lastDuration !== undefined
  ) {
    logEvent('tengu_exit', {
      last_session_cost: String(projectConfig.lastCost),
      last_session_api_duration: String(projectConfig.lastAPIDuration),
      last_session_duration: String(projectConfig.lastDuration),
      last_session_id: projectConfig.lastSessionId,
    })
    // Clear the values after logging
    // saveCurrentProjectConfig({
    //   ...projectConfig,
    //   lastCost: undefined,
    //   lastAPIDuration: undefined,
    //   lastDuration: undefined,
    //   lastSessionId: undefined,
    // })
  }

  // Check auto-updater permissions
  const autoUpdaterStatus = globalConfig.autoUpdaterStatus ?? 'not_configured'
  if (autoUpdaterStatus === 'not_configured') {
    logEvent('tengu_setup_auto_updater_not_configured', {})
    await new Promise<void>(resolve => {
      render(<Doctor onDone={() => resolve()} />)
    })
  }
}

async function main() {
  // Validate configs are valid and enable configuration system
  try {
    enableConfigs()
  } catch (error: unknown) {
    if (error instanceof ConfigParseError) {
      // Show the invalid config dialog with the error object
      await showInvalidConfigDialog({ error })
      return // Exit after handling the config error
    }
  }

  let inputPrompt = ''
  let renderContext: RenderOptions | undefined = {
    exitOnCtrlC: false,
    onFlicker() {
      logEvent('tengu_flicker', {})
    },
  }

  if (
    !process.stdin.isTTY &&
    !process.env.CI &&
    // Input hijacking breaks MCP.
    !process.argv.includes('mcp')
  ) {
    inputPrompt = await stdin()
    if (process.platform !== 'win32') {
      try {
        const ttyFd = openSync('/dev/tty', 'r')
        renderContext = { ...renderContext, stdin: new ReadStream(ttyFd) }
      } catch (err) {
        logError(`Could not open /dev/tty: ${err}`)
      }
    }
  }
  await parseArgs(inputPrompt, renderContext)
}

async function parseArgs(
  stdinContent: string,
  renderContext: RenderOptions | undefined,
): Promise<void> {
  const cli = await CLI.create();
  const argv = process.argv.slice(2); // Remove 'node' and 'cli.tsx'

  if (argv.length === 0) {
    // If no arguments, show help or interactive REPL
    // This part needs to be carefully handled to integrate with the REPL component
    // For now, let's just show help
    cli.renderHelp();
    return;
  }

  await cli.run(argv);
}

// TODO: stream?
async function stdin() {
  if (process.stdin.isTTY) {
    return ''
  }

  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data
}

process.on('exit', () => {
  resetCursor()
  PersistentShell.getInstance().close()
})

process.on('SIGINT', () => {
  console.log('SIGINT')
  process.exit(0)
})

function resetCursor() {
  const terminal = process.stderr.isTTY
    ? process.stderr
    : process.stdout.isTTY
      ? process.stdout
      : undefined
  terminal?.write(`\u001B[?25h${cursorShow}`)
}

main()