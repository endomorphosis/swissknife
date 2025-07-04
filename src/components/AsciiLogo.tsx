import { Box, Text } from 'ink'
import React from 'react'
import { getTheme } from '../utils/theme'
import { ASCII_LOGO } from '../constants/product'
import chalk from 'chalk'

export function AsciiLogo(): React.ReactNode {
  const theme = getTheme()
  // Use chalk to color the logo red
  const coloredLogo = chalk.rgb(226, 6, 18)(ASCII_LOGO)
  
  return (
    <Box flexDirection="column" alignItems="flex-start">
      <Text>{coloredLogo}</Text>
    </Box>
  )
}
