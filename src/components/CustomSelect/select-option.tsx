import figures from 'figures'
import { Box, Text } from 'ink'
import React, { type ReactNode } from 'react'
import { type Theme } from './theme.js'
import { useComponentTheme } from '@inkjs/ui'

export type SelectOptionProps = {
  /**
   * Determines if option is focused.
   */
  readonly isFocused: boolean

  /**
   * Determines if option is selected.
   */
  readonly isSelected: boolean

  /**
   * Determines if pointer is shown when selected
   */
  readonly smallPointer?: boolean

  /**
   * Option label.
   */
  readonly children: ReactNode
}

export function SelectOption({
  isFocused,
  isSelected,
  smallPointer,
  children,
}: SelectOptionProps) {
  const { styles } = useComponentTheme<Theme>('Select')

  return (
    <Box {...styles.option({ isFocused })}>
      {isFocused && (
        <Text {...styles.focusIndicator()}>
          {smallPointer ? figures.triangleDownSmall : figures.pointer}
        </Text>
      )}

      <Text {...styles.label({ isFocused, isSelected })}>{children}</Text>

      {isSelected && (
        <Text {...styles.selectedIndicator()}>{figures.tick}</Text>
      )}
    </Box>
  )
}
