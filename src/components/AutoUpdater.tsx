import { Box, Text } from 'ink.js.js.js.js.js'
import * as React from 'react.js.js.js.js.js'
import { getTheme } from '../utils/theme.js.js.js.js.js.js.js.js.js.js'
import { gte } from 'semver.js.js.js.js.js'
import { useEffect, useState } from 'react.js.js.js.js.js'
import { isAutoUpdaterDisabled } from '../utils/config.js.js.js.js.js.js.js.js.js.js'
import {
  AutoUpdaterResult,
  getLatestVersion,
  installGlobalPackage,
} from '../utils/autoUpdater.js.js.js.js.js.js.js.js.js.js.js'
import { useInterval } from '../hooks/useInterval.js.js.js.js.js.js.js.js.js.js'
import { logEvent } from '../services/statsig.js.js.js.js.js.js.js.js.js.js'
import { MACRO } from '../constants/macros.js.js.js.js.js.js.js.js.js.js'
import { PRODUCT_COMMAND } from '../constants/product.js.js.js.js.js.js.js.js.js.js'
type Props = {
  debug: boolean
  isUpdating: boolean
  onChangeIsUpdating: (isUpdating: boolean) => void
  onAutoUpdaterResult: (autoUpdaterResult: AutoUpdaterResult) => void
  autoUpdaterResult: AutoUpdaterResult | null
}

export function AutoUpdater({
  debug,
  isUpdating,
  onChangeIsUpdating,
  onAutoUpdaterResult,
  autoUpdaterResult,
}: Props): React.ReactNode {
  const theme = getTheme()
  const [versions, setVersions] = useState<{
    global?: string | null
    latest?: string | null
  }>({})
  const checkForUpdates = React.useCallback(async () => {
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'dev') {
      return
    }

    if (isUpdating) {
      return
    }

    // Get versions
    const globalVersion = MACRO.VERSION
    const latestVersion = await getLatestVersion()
    const isDisabled = true //await isAutoUpdaterDisabled()

    setVersions({ global: globalVersion, latest: latestVersion })

    // Check if update needed and perform update
    if (
      !isDisabled &&
      globalVersion &&
      latestVersion &&
      !gte(globalVersion, latestVersion)
    ) {
      const startTime = Date.now()
      onChangeIsUpdating(true)
      const installStatus = await installGlobalPackage()
      onChangeIsUpdating(false)

      if (installStatus === 'success') {
        logEvent('tengu_auto_updater_success', {
          fromVersion: globalVersion,
          toVersion: latestVersion,
          durationMs: String(Date.now() - startTime),
        })
      } else {
        logEvent('tengu_auto_updater_fail', {
          fromVersion: globalVersion,
          attemptedVersion: latestVersion,
          status: installStatus,
          durationMs: String(Date.now() - startTime),
        })
      }

      onAutoUpdaterResult({
        version: latestVersion!,
        status: installStatus,
      })
    }
    // Don't re-render when isUpdating changes
    // TODO: Find a cleaner way to do this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAutoUpdaterResult])

  // Initial check
  useEffect(() => {
    // checkForUpdates()
  }, [checkForUpdates])

  // Check every 30 minutes
  // useInterval(checkForUpdates, 30 * 60 * 1000)

  if (debug) {
    return (
      <Box flexDirection="row">
        <Text dimColor>
          globalVersion: {versions.global} &middot; latestVersion:{' '}
          {versions.latest}
        </Text>
      </Box>
    )
  }

  if (!autoUpdaterResult?.version && (!versions.global || !versions.latest)) {
    return null
  }

  if (!autoUpdaterResult?.version && !isUpdating) {
    return null
  }

  return (
    <Box flexDirection="row">
      {debug && (
        <Text dimColor>
          globalVersion: {versions.global} &middot; latestVersion:{' '}
          {versions.latest}
        </Text>
      )}
      {isUpdating && (
        <>
          <Box>
            <Text color={theme.secondaryText} dimColor wrap="end">
              Auto-updating to v{versions.latest}…
            </Text>
          </Box>
        </>
      )}
      {autoUpdaterResult?.status === 'success' && autoUpdaterResult?.version ? (
        <Text color={theme.success}>
          ✓ Update installed &middot; Restart to apply
        </Text>
      ) : null}
      {(autoUpdaterResult?.status === 'install_failed' ||
        autoUpdaterResult?.status === 'no_permissions') && (
        <Text color={theme.error}>
          ✗ Auto-update failed &middot; Try{' '}
          <Text bold>{PRODUCT_COMMAND} doctor</Text> or{' '}
          <Text bold>npm i -g {MACRO.PACKAGE_URL}</Text>
        </Text>
      )}
    </Box>
  )
}
