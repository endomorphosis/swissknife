import { Box, Text, useInput } from 'ink'
import React from 'react'
import { Select } from './CustomSelect/select.js'
import { getTheme } from '../utils/theme'
import Link from './Link.js'

interface Props {
  onDone: () => void
}

export function CostThresholdDialog({ onDone }: Props): React.ReactNode {
  // Handle Ctrl+C, Ctrl+D and Esc
  useInput((input, key) => {
    if ((key.ctrl && (input === 'c' || input === 'd')) || key.escape) {
      onDone()
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      padding={1}
      borderColor={getTheme().secondaryBorder}
    >
      <Box marginBottom={1} flexDirection="column">
        <Text bold>
          You&apos;ve spent $5 on the Anthropic API this session.
        </Text>
        <Text>Learn more about how to monitor your spending:</Text>
        <Link url="https://docs.anthropic.com/s/claude-code-cost" />
      </Box>
      <Box>
        <Select
          options={[
            {
              value: 'ok',
              label: 'Got it, thanks!',
            },
          ]}
          onChange={onDone}
        />
      </Box>
    </Box>
  )
}
