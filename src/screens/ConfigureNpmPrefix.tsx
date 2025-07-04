import React, { useState } from 'react'
import { Box, Text } from 'ink'
import { Select } from '@inkjs/ui'
import TextInput from '../components/TextInput'
import { SimpleSpinner } from '../components/Spinner'
import { getTheme } from '../utils/theme'
import { useTerminalSize } from '../hooks/useTerminalSize'
import { PRODUCT_NAME } from '../constants/product'
import { setupNewPrefix, installGlobalPackage } from '../utils/autoUpdater'
import { logError } from '../utils/log'
import { logEvent } from '../services/statsig'
import { MACRO } from '../constants/macros'
type Props = {
  customPrefix: string
  onCustomPrefixChange: (value: string) => void
  onSuccess: () => void
  onCancel: () => void
}

export function ConfigureNpmPrefix({
  customPrefix,
  onCustomPrefixChange,
  onSuccess,
  onCancel,
}: Props): React.ReactNode {
  const [cursorOffset, setCursorOffset] = useState(customPrefix.length)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [isSettingUpPrefix, setIsSettingUpPrefix] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stepsStatus, setStepsStatus] = useState<{
    completeSteps: boolean[]
    inProgressStep: number | null
  }>({
    completeSteps: [false, false, false, false],
    inProgressStep: null,
  })
  const textInputColumns = useTerminalSize().columns - 6
  const theme = getTheme()

  async function handleSetupNewPrefix(prefix: string) {
    setIsSettingUpPrefix(true)
    setError(null)

    try {
      // Reset status
      setStepsStatus({
        completeSteps: [false, false, false, false],
        inProgressStep: 0,
      })

      // Start first three steps
      await setupNewPrefix(prefix)
      setStepsStatus({
        completeSteps: [true, true, true, false],
        inProgressStep: 3,
      })

      // Start install step
      await installGlobalPackage()
      setStepsStatus({
        completeSteps: [true, true, true, true],
        inProgressStep: null,
      })

      logEvent('tengu_auto_updater_config_complete', {
        finalStatus: 'enabled',
        method: 'prefix',
        success: 'true',
      })

      onSuccess()
    } catch (err) {
      logError(err)
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to setup npm prefix'
      setError(errorMessage)
      setIsSettingUpPrefix(false)

      logEvent('tengu_auto_updater_config_complete', {
        finalStatus: 'not_configured',
        method: 'prefix',
        success: 'false',
        error: errorMessage,
      })
    }
  }

  const installSteps = [
    {
      label: 'Create new directory for npm global packages',
      command: `mkdir -p ${customPrefix}`,
    },
    {
      label: 'Configure npm to use new location',
      command: `npm -g config set prefix ${customPrefix}`,
    },
    {
      label: 'Update shell PATH configuration',
      command: `export PATH=${customPrefix}/bin:$PATH`,
    },
    {
      label: `Reinstall ${PRODUCT_NAME} globally`,
      command: `npm install -g ${MACRO.PACKAGE_URL}`,
    },
  ]

  return (
    <Box marginLeft={2} flexDirection="column">
      <Box flexDirection="column" gap={1}>
        <Text>
          ⚠️ Warning: This will modify your global npm configuration and can be
          dangerous. The following changes will be made:
        </Text>
        {installSteps.map((step, index) => (
          <Box key={index} flexDirection="column">
            <Box flexDirection="row">
              <Text
                color={
                  stepsStatus.completeSteps[index] ? theme.success : undefined
                }
              >
                {isSettingUpPrefix
                  ? stepsStatus.completeSteps[index]
                    ? '✓'
                    : ' '
                  : `${index + 1}.`}
              </Text>
              <Box width={2}>
                {stepsStatus.inProgressStep === index && <SimpleSpinner />}
              </Box>
              <Text
                color={
                  stepsStatus.completeSteps[index] ? theme.success : undefined
                }
              >
                {step.label}
              </Text>
            </Box>
            {step.command && (
              <Box marginLeft={2}>
                <Text color={theme.suggestion} dimColor>
                  $ {step.command}
                </Text>
              </Box>
            )}
          </Box>
        ))}

        <Text color={theme.suggestion}>
          Note: You&apos;ll need to restart your terminal after this change
        </Text>
        <Text color={theme.warning}>
          Important: Any existing global npm packages may need to be reinstalled
        </Text>
      </Box>
      {!isSettingUpPrefix && (
        <Box marginTop={1} flexDirection="column">
          <Text>Enter prefix path:</Text>
          <Box flexDirection="row" gap={1}>
            <Text>&gt;</Text>
            <TextInput
              placeholder={customPrefix}
              value={customPrefix}
              onChange={onCustomPrefixChange}
              onSubmit={() => setShowConfirmation(true)}
              columns={textInputColumns}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
            />
          </Box>
          {showConfirmation && (
            <Box marginTop={1} flexDirection="column">
              <Text>
                Are you sure you want to continue with prefix: {customPrefix}?
              </Text>
              <Select
                options={[
                  { label: 'Yes', value: 'yes' },
                  { label: 'No', value: 'no' },
                ]}
                onChange={(value: string) => {
                  setShowConfirmation(false)
                  if (value === 'yes') {
                    handleSetupNewPrefix(customPrefix)
                  } else {
                    onCancel()
                  }
                }}
              />
            </Box>
          )}
        </Box>
      )}
      {error && <Text color={theme.error}>Error: {error}</Text>}
    </Box>
  )
}
