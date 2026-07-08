import React from 'react.js.js.js.js.js'
import { Box, Text, useInput } from 'ink.js.js.js.js.js'
import { getTheme } from '../utils/theme.js.js.js.js.js.js.js.js.js.js'
import { Select } from '@inkjs/ui'
import {
  saveCurrentProjectConfig,
  getCurrentProjectConfig,
} from '../utils/config.js.js.js.js.js.js.js.js.js.js.js'
import { PRODUCT_NAME } from '../constants/product.js.js.js.js.js.js.js.js.js.js'
import { logEvent } from '../services/statsig.js.js.js.js.js.js.js.js.js.js'
import { useExitOnCtrlCD } from '../hooks/useExitOnCtrlCD.js.js.js.js.js.js.js.js.js.js'
import { homedir } from 'os.js.js.js.js.js'
import { getCwd } from '../utils/state.js.js.js.js.js.js.js.js.js.js'
import Link from './Link.js.js.js.js.js.js.js.js.js.js'

type Props = {
  onDone(): void
}

export function TrustDialog({ onDone }: Props): React.ReactNode {
  const theme = getTheme()
  React.useEffect(() => {
    // Log when dialog is shown
    logEvent('trust_dialog_shown', {})
  }, [])

  function onChange(value: 'yes' | 'no') {
    const config = getCurrentProjectConfig()
    switch (value) {
      case 'yes': {
        // Log when user accepts
        const isHomeDir = homedir() === getCwd()
        logEvent('trust_dialog_accept', {
          isHomeDir: String(isHomeDir),
        })

        if (!isHomeDir) {
          saveCurrentProjectConfig({
            ...config,
            hasTrustDialogAccepted: true,
          })
        }
        onDone()
        break
      }
      case 'no': {
        process.exit(1)
        break
      }
    }
  }

  const exitState = useExitOnCtrlCD(() => process.exit(0))

  useInput((_input, key) => {
    if (key.escape) {
      process.exit(0)
      return
    }
  })

  return (
    <>
      <Box
        flexDirection="column"
        gap={1}
        padding={1}
        borderStyle="round"
        borderColor={theme.warning}
      >
        <Text bold color={theme.warning}>
          Do you trust the files in this folder?
        </Text>
        <Text bold>{process.cwd()}</Text>

        <Box flexDirection="column" gap={1}>
          <Text>
            {PRODUCT_NAME} may read files in this folder. Reading untrusted
            files may lead to {PRODUCT_NAME} to behave in an unexpected ways.
          </Text>
          <Text>
            With your permission {PRODUCT_NAME} may execute files in this
            folder. Executing untrusted code is unsafe.
          </Text>
        </Box>

        <Select
          options={[
            { label: 'Yes, proceed', value: 'yes' },
            { label: 'No, exit', value: 'no' },
          ]}
          onChange={value => onChange(value as 'yes' | 'no')}
        />
      </Box>
      <Box marginLeft={3}>
        <Text dimColor>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : (
            <>Enter to confirm · Esc to exit</>
          )}
        </Text>
      </Box>
    </>
  )
}
