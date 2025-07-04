import { Box, Text } from 'ink'
import React, { type ReactNode } from 'react'
import { SelectOption } from './select-option.js'
import { type Theme } from './theme.js'
import { useSelectState } from './use-select-state.js'
import { useSelect } from './use-select.js'
import { Option, useComponentTheme } from '@inkjs/ui'

export type OptionSubtree = {
  /**
   * Header to show above sub-options.
   */
  readonly header?: string

  /**
   * Options.
   */
  readonly options: (Option | OptionSubtree)[]
}

export type OptionHeader = {
  readonly header: string

  readonly optionValues: string[]
}

export const optionHeaderKey = (optionHeader: OptionHeader): string =>
  `HEADER-${optionHeader.optionValues.join(',')}`

export type SelectProps = {
  /**
   * When disabled, user input is ignored.
   *
   * @default false
   */
  readonly isDisabled?: boolean

  /**
   * Number of visible options.
   *
   * @default 5
   */
  readonly visibleOptionCount?: number

  /**
   * Highlight text in option labels.
   */
  readonly highlightText?: string

  /**
   * Options.
   */
  readonly options: (Option | OptionSubtree)[]

  /**
   * Default value.
   */
  readonly defaultValue?: string

  /**
   * Callback when selected option changes.
   */
  readonly onChange?: (value: string) => void

  /**
   * Callback when focused option changes.
   */
  readonly onFocus?: (value: string) => void

  /**
   * Value to focus
   */
  readonly focusValue?: string
}

export function Select({
  isDisabled = false,
  visibleOptionCount = 5,
  highlightText,
  options,
  defaultValue,
  onChange,
  onFocus,
  focusValue,
}: SelectProps) {
  const state = useSelectState({
    visibleOptionCount,
    options,
    defaultValue,
    onChange,
    onFocus,
    focusValue,
  })

  useSelect({ isDisabled, state })

  const { styles } = useComponentTheme<Theme>('Select')

  return (
    <Box {...styles.container()}>
      {state.visibleOptions.map(option => {
        const key = 'value' in option ? option.value : optionHeaderKey(option)
        const isFocused =
          !isDisabled &&
          state.focusedValue !== undefined &&
          ('value' in option
            ? state.focusedValue === option.value
            : option.optionValues.includes(state.focusedValue))
        const isSelected =
          !!state.value &&
          ('value' in option
            ? state.value === option.value
            : option.optionValues.includes(state.value))
        const smallPointer = 'header' in option
        const labelText = 'label' in option ? option.label : option.header
        let label: ReactNode = labelText

        if (highlightText && labelText.includes(highlightText)) {
          const index = labelText.indexOf(highlightText)

          label = (
            <>
              {labelText.slice(0, index)}
              <Text {...styles.highlightedText()}>{highlightText}</Text>
              {labelText.slice(index + highlightText.length)}
            </>
          )
        }

        return (
          <SelectOption
            key={key}
            isFocused={isFocused}
            isSelected={isSelected}
            smallPointer={smallPointer}
          >
            {label}
          </SelectOption>
        )
      })}
    </Box>
  )
}
