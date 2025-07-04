import * as React from 'react'
import { existsSync, readFileSync } from 'fs'
import { useMemo } from 'react'
import { StructuredDiff } from '../StructuredDiff'
import { Box, Text } from 'ink'
import { getTheme } from '../utils/theme'
import { intersperse } from '../utils/array'
import { getCwd } from '../utils/state'
import { extname, relative } from 'path'
import { detectFileEncoding } from '../utils/file'
import { HighlightedCode } from '../HighlightedCode'
import { getPatch } from '../utils/diff'

type Props = {
  file_path: string
  content: string
  verbose: boolean
  width: number
}

export function FileWriteToolDiff({
  file_path,
  content,
  verbose,
  width,
}: Props): React.ReactNode {
  const fileExists = useMemo(() => existsSync(file_path), [file_path])
  const oldContent = useMemo(() => {
    if (!fileExists) {
      return ''
    }
    const enc = detectFileEncoding(file_path)
    return readFileSync(file_path, enc)
  }, [file_path, fileExists])
  const hunks = useMemo(() => {
    if (!fileExists) {
      return null
    }
    return getPatch({
      filePath: file_path,
      fileContents: oldContent,
      oldStr: oldContent,
      newStr: content,
    })
  }, [fileExists, file_path, oldContent, content])

  return (
    <Box
      borderColor={getTheme().secondaryBorder}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
    >
      <Box paddingBottom={1}>
        <Text bold>{verbose ? file_path : relative(getCwd(), file_path)}</Text>
      </Box>
      {hunks ? (
        intersperse(
          hunks.map(_ => (
            <StructuredDiff
              key={_.newStart}
              patch={_}
              dim={false}
              width={width}
            />
          )),
          i => (
            <Text color={getTheme().secondaryText} key={`ellipsis-${i}`}>
              ...
            </Text>
          ),
        )
      ) : (
        <HighlightedCode
          code={content || '(No content)'}
          language={extname(file_path).slice(1)}
        />
      )}
    </Box>
  )
}
