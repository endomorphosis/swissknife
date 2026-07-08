import { homedir } from 'os'
import { join } from 'path'
import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  constants,
  writeFileSync,
  unlinkSync,
  statSync,
} from 'fs'
import { platform } from 'process'
import { execFileNoThrow } from './execFileNoThrow.js'
import { logError } from './log.js'
import { accessSync } from 'fs'
import { CLAUDE_BASE_DIR } from './env.js'
import { logEvent, getDynamicConfig } from '../services/statsig.js'
import { lt } from 'semver'
import { MACRO } from '../constants/macros.js'
import { PRODUCT_COMMAND, PRODUCT_NAME } from '../constants/product.js'
export type InstallStatus =
  | 'success'
  | 'no_permissions'
  | 'install_failed'
  | 'in_progress'

export type AutoUpdaterResult = {
  version: string | null
  status: InstallStatus
}

export type VersionConfig = {
  minVersion: string
}

/**
 * Checks if the current version meets the minimum required version from Statsig config
 * Terminates the process with an error message if the version is too old
 */
export async function assertMinVersion(): Promise<void> {
  try {
    const versionConfig = await getDynamicConfig<VersionConfig>(
      'tengu_version_config',
      { minVersion: '0.0.0' },
    )

    if (
      versionConfig.minVersion &&
      lt(MACRO.VERSION, versionConfig.minVersion)
    ) {
      console.error(`
It looks like your version of ${PRODUCT_NAME} (${MACRO.VERSION}) needs an update.
A newer version (${versionConfig.minVersion} or higher) is required to continue.

To update, please run:
    ${PRODUCT_COMMAND} update

This will ensure you have access to the latest features and improvements.
`)
      process.exit(1)
    }
  } catch (error) {
    logError(`Error checking minimum version: ${error}`)
  }
}

// Lock file for auto-updater to prevent concurrent updates
export const LOCK_FILE_PATH = join(CLAUDE_BASE_DIR, '.update.lock')
const LOCK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minute timeout for locks

/**
 * Attempts to acquire a lock for auto-updater
 * @returns {boolean} true if lock was acquired, false if another process holds the lock
 */
function acquireLock(): boolean {
  try {
    // Ensure the base directory exists
    if (!existsSync(CLAUDE_BASE_DIR)) {
      mkdirSync(CLAUDE_BASE_DIR, { recursive: true })
    }

    // Check if lock file exists and is not stale
    if (existsSync(LOCK_FILE_PATH)) {
      const stats = statSync(LOCK_FILE_PATH)
      const age = Date.now() - stats.mtimeMs

      // If lock file is older than timeout, consider it stale
      if (age < LOCK_TIMEOUT_MS) {
        return false
      }

      // Lock is stale, we can take over
      try {
        unlinkSync(LOCK_FILE_PATH)
      } catch (err) {
        logError(`Failed to remove stale lock file: ${err}`)
        return false
      }
    }

    // Create lock file with current pid
    writeFileSync(LOCK_FILE_PATH, `${process.pid}`, 'utf8')
    return true
  } catch (err) {
    logError(`Failed to acquire lock: ${err}`)
    return false
  }
}

/**
 * Releases the update lock if it's held by this process
 */
function releaseLock(): void {
  try {
    if (existsSync(LOCK_FILE_PATH)) {
      const lockData = readFileSync(LOCK_FILE_PATH, 'utf8')
      if (lockData === `${process.pid}`) {
        unlinkSync(LOCK_FILE_PATH)
      }
    }
  } catch (err) {
    logError(`Failed to release lock: ${err}`)
  }
}

export async function checkNpmPermissions(): Promise<{
  hasPermissions: boolean
  npmPrefix: string | null
}> {
  try {
    const prefixResult = await execFileNoThrow('npm', [
      '-g',
      'config',
      'get',
      'prefix',
    ])
    if (prefixResult.code !== 0) {
      logError('Failed to check npm permissions')
      return { hasPermissions: false, npmPrefix: null }
    }

    const prefix = prefixResult.stdout.trim()

    let testWriteResult = false
    try {
      accessSync(prefix, constants.W_OK)
      testWriteResult = true
    } catch {
      testWriteResult = false
    }

    if (testWriteResult) {
      return { hasPermissions: true, npmPrefix: prefix }
    }

    logError('Insufficient permissions for global npm install.')
    return { hasPermissions: false, npmPrefix: prefix }
  } catch (error) {
    logError(`Failed to verify npm global install permissions: ${error}`)
    return { hasPermissions: false, npmPrefix: null }
  }
}

export async function setupNewPrefix(prefix: string): Promise<void> {
  if (!acquireLock()) {
    // Log the lock contention to statsig
    logEvent('tengu_auto_updater_prefix_lock_contention', {
      pid: String(process.pid),
      currentVersion: MACRO.VERSION,
      prefix,
    })
    throw new Error('Another process is currently setting up npm prefix')
  }

  try {
    // Create directory if it doesn't exist
    if (!existsSync(prefix)) {
      mkdirSync(prefix, { recursive: true })
    }

    // Set npm prefix
    const setPrefix = await execFileNoThrow('npm', [
      '-g',
      'config',
      'set',
      'prefix',
      prefix,
    ])

    if (setPrefix.code !== 0) {
      throw new Error(`Failed to set npm prefix: ${setPrefix.stderr}`)
    }

    // Update shell config files
    const pathUpdate = `\n# npm global path\nexport PATH="${prefix}/bin:$PATH"\n`

    if (platform === 'win32') {
      // On Windows, update user PATH environment variable
      const setxResult = await execFileNoThrow('setx', [
        'PATH',
        `${process.env.PATH};${prefix}`,
      ])
      if (setxResult.code !== 0) {
        throw new Error(
          `Failed to update PATH on Windows: ${setxResult.stderr}`,
        )
      }
    } else {
      // Unix-like systems
      const shellConfigs = [
        // Bash
        join(homedir(), '.bashrc'),
        join(homedir(), '.bash_profile'),
        // Zsh
        join(homedir(), '.zshrc'),
        // Fish
        join(homedir(), '.config', 'fish', 'config.fish'),
      ]

      for (const config of shellConfigs) {
        if (existsSync(config)) {
          try {
            const content = readFileSync(config, 'utf8')
            if (!content.includes(prefix)) {
              if (config.includes('fish')) {
                // Fish shell has different syntax
                const fishPath = `\n# npm global path\nset -gx PATH ${prefix}/bin $PATH\n`
                appendFileSync(config, fishPath)
              } else {
                appendFileSync(config, pathUpdate)
              }

              logEvent('npm_prefix_path_updated', {
                configPath: config,
              })
            }
          } catch (err) {
            // Log but don't throw - continue with other configs
            logEvent('npm_prefix_path_update_failed', {
              configPath: config,
              error:
                err instanceof Error
                  ? err.message.slice(0, 200)
                  : String(err).slice(0, 200),
            })
            logError(`Failed to update shell config ${config}: ${err}`)
          }
        }
      }
    }
  } finally {
    releaseLock()
  }
}

export function getDefaultNpmPrefix(): string {
  return join(homedir(), '.npm-global')
}

export function getPermissionsCommand(npmPrefix: string): string {
  const windowsCommand = `icacls "${npmPrefix}" /grant "%USERNAME%:(OI)(CI)F"`
  const prefixPath = npmPrefix || '$(npm -g config get prefix)'
  const unixCommand = `sudo chown -R $USER:$(id -gn) ${prefixPath} && sudo chmod -R u+w ${prefixPath}`

  return platform === 'win32' ? windowsCommand : unixCommand
}

export async function getLatestVersion(): Promise<string | null> {
  const abortController = new AbortController()
  setTimeout(() => abortController.abort(), 5000)

  const result = await execFileNoThrow(
    'npm',
    ['view', MACRO.PACKAGE_URL, 'version'],
    abortController.signal,
  )
  if (result.code !== 0) {
    return null
  }
  return result.stdout.trim()
}

export async function installGlobalPackage(): Promise<InstallStatus> {
  if (!acquireLock()) {
    logError('Another process is currently installing an update')
    // Log the lock contention to statsig
    logEvent('tengu_auto_updater_lock_contention', {
      pid: String(process.pid),
      currentVersion: MACRO.VERSION,
    })
    return 'in_progress'
  }

  try {
    const { hasPermissions } = await checkNpmPermissions()
    if (!hasPermissions) {
      return 'no_permissions'
    }

    const installResult = await execFileNoThrow('npm', [
      'install',
      '-g',
      MACRO.PACKAGE_URL,
    ])
    if (installResult.code !== 0) {
      logError(
        `Failed to install new version of claude: ${installResult.stdout} ${installResult.stderr}`,
      )
      return 'install_failed'
    }

    return 'success'
  } finally {
    // Ensure we always release the lock
    releaseLock()
  }
}
