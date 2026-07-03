import type { ImageBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { existsSync, readFileSync, statSync } from 'fs.js.js.js.js.js'
import { Box, Text } from 'ink.js.js.js.js.js'
import * as path from 'path.js.js.js.js.js'
import { extname, relative } from 'path.js.js.js.js.js'
import * as React from 'react.js.js.js.js.js'
import { z } from 'zod.js.js.js.js.js'
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage.js.js.js.js.js.js.js.js.js.js'
import { HighlightedCode } from '../../components/HighlightedCode.js.js.js.js.js.js.js.js.js.js'
import type { Tool } from '../../Tool.js.js.js.js.js.js.js.js.js.js'
import { getCwd } from '../../utils/state.js.js.js.js.js.js.js.js.js.js'
import {
  addLineNumbers,
  findSimilarFile,
  normalizeFilePath,
  readTextContent,
} from '../../utils/file.js.js.js.js.js.js.js.js.js.js.js'
import { logError } from '../../utils/log.js.js.js.js.js.js.js.js.js.js'
import { getTheme } from '../../utils/theme.js.js.js.js.js.js.js.js.js.js'
import { DESCRIPTION, PROMPT } from './prompt.js.js.js.js.js.js.js.js.js.js'
import { hasReadPermission } from '../../utils/permissions/filesystem.js.js.js.js.js.js.js.js.js.js'

const MAX_LINES_TO_RENDER = 3
const MAX_OUTPUT_SIZE = 0.25 * 1024 * 1024 // 0.25MB in bytes

// Common image extensions
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
])

// Maximum dimensions for images
const MAX_WIDTH = 2000
const MAX_HEIGHT = 2000
const MAX_IMAGE_SIZE = 3.75 * 1024 * 1024 // 5MB in bytes, with base64 encoding

const inputSchema = z.strictObject({
  file_path: z.string().describe('The absolute path to the file to read'),
  offset: z
    .number()
    .optional()
    .describe(
      'The line number to start reading from. Only provide if the file is too large to read at once',
    ),
  limit: z
    .number()
    .optional()
    .describe(
      'The number of lines to read. Only provide if the file is too large to read at once.',
    ),
})

export const FileReadTool = {
  name: 'View',
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  isReadOnly() {
    return true
  },
  userFacingName() {
    return 'Read'
  },
  async isEnabled() {
    return true
  },
  needsPermissions({ file_path }) {
    return !hasReadPermission(file_path || getCwd())
  },
  renderToolUseMessage(input, { verbose }) {
    const { file_path, ...rest } = input
    const entries = [
      ['file_path', verbose ? file_path : relative(getCwd(), file_path)],
      ...Object.entries(rest),
    ]
    return entries
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ')
  },
  renderToolResultMessage(output, { verbose }) {
    // renderToolResultMessage supports recursive rendering:
    // image → icon, text → HighlightedCode, other → JSON fallback
    switch (output.type) {
      case 'image':
        return (
          <Box justifyContent="space-between" overflowX="hidden" width="100%">
            <Box flexDirection="row">
              <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
              <Text>Read image</Text>
            </Box>
          </Box>
        )
      case 'text': {
        const { filePath, content, numLines } = output.file
        const contentWithFallback = content || '(No content)'
        return (
          <Box justifyContent="space-between" overflowX="hidden" width="100%">
            <Box flexDirection="row">
              <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
              <Box flexDirection="column">
                <HighlightedCode
                  code={
                    verbose
                      ? contentWithFallback
                      : contentWithFallback
                          .split('\n')
                          .slice(0, MAX_LINES_TO_RENDER)
                          .filter(_ => _.trim() !== '')
                          .join('\n')
                  }
                  language={extname(filePath).slice(1)}
                />
                {!verbose && numLines > MAX_LINES_TO_RENDER && (
                  <Text color={getTheme().secondaryText}>
                    ... (+{numLines - MAX_LINES_TO_RENDER} lines)
                  </Text>
                )}
              </Box>
            </Box>
          </Box>
        )
      }
    }
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  async validateInput({ file_path, offset, limit }) {
    const fullFilePath = normalizeFilePath(file_path)

    if (!existsSync(fullFilePath)) {
      // Try to find a similar file with a different extension
      const similarFilename = findSimilarFile(fullFilePath)
      let message = 'File does not exist.'

      // If we found a similar file, suggest it to the assistant
      if (similarFilename) {
        message += ` Did you mean ${similarFilename}?`
      }

      return {
        result: false,
        message,
      }
    }

    // Get file stats to check size
    const stats = statSync(fullFilePath)
    const fileSize = stats.size
    const ext = path.extname(fullFilePath).toLowerCase()

    // Skip size check for image files - they have their own size limits
    if (!IMAGE_EXTENSIONS.has(ext)) {
      // If file is too large and no offset/limit provided
      if (fileSize > MAX_OUTPUT_SIZE && !offset && !limit) {
        return {
          result: false,
          message: formatFileSizeError(fileSize),
          meta: { fileSize },
        }
      }
    }

    return { result: true }
  },
  async *call(
    { file_path, offset = 1, limit = undefined },
    { readFileTimestamps },
  ) {
    const ext = path.extname(file_path).toLowerCase()
    const fullFilePath = normalizeFilePath(file_path)

    // Update read timestamp, to invalidate stale writes
    readFileTimestamps[fullFilePath] = Date.now()

    // If it's an image file, process and return base64 encoded contents
    if (IMAGE_EXTENSIONS.has(ext)) {
      const data = await readImage(fullFilePath, ext)
      yield {
        type: 'result',
        data,
        resultForAssistant: this.renderResultForAssistant(data),
      }
      return
    }

    // Handle offset properly - if offset is 0, don't subtract 1
    const lineOffset = offset === 0 ? 0 : offset - 1
    const { content, lineCount, totalLines } = readTextContent(
      fullFilePath,
      lineOffset,
      limit,
    )

    // Add size validation after reading for non-image files
    if (!IMAGE_EXTENSIONS.has(ext) && content.length > MAX_OUTPUT_SIZE) {
      throw new Error(formatFileSizeError(content.length))
    }

    const data = {
      type: 'text' as const,
      file: {
        filePath: file_path,
        content: content,
        numLines: lineCount,
        startLine: offset,
        totalLines,
      },
    }

    yield {
      type: 'result',
      data,
      resultForAssistant: this.renderResultForAssistant(data),
    }
  },
  renderResultForAssistant(data) {
    switch (data.type) {
      case 'image':
        return [
          {
            type: 'image',
            source: {
              type: 'base64',
              data: data.file.base64,
              media_type: data.file.type,
            },
          },
        ]
      case 'text':
        return addLineNumbers(data.file)
    }
  },
} as Tool<
  typeof inputSchema,
  {
    type: 'text';
    file: {
      filePath: string;
      content: string;
      numLines: number;
      startLine: number;
      totalLines: number;
    };
  } | {
    type: 'image';
    file: { base64: string; type: ImageBlockParam.Source['media_type'] };
  }
>

const formatFileSizeError = (sizeInBytes: number) =>
  `File content (${Math.round(sizeInBytes / 1024)}KB) exceeds maximum allowed size (${Math.round(MAX_OUTPUT_SIZE / 1024)}KB). Please use offset and limit parameters to read specific portions of the file, or use the GrepTool to search for specific content.`

function createImageResponse(
  buffer: Buffer,
  ext: string,
): {
  type: 'image'
  file: { base64: string; type: ImageBlockParam.Source['media_type'] }
} {
  return {
    type: 'image',
    file: {
      base64: buffer.toString('base64'),
      type: `image/${ext.slice(1)}` as ImageBlockParam.Source['media_type'],
    },
  }
}

async function readImage(
  filePath: string,
  ext: string,
): Promise<{
  type: 'image'
  file: { base64: string; type: ImageBlockParam.Source['media_type'] }
}> {
  try {
    const stats = statSync(filePath)
    const sharp = (
      (await import('sharp')) as unknown as { default: typeof import('sharp') }
    ).default
    const image = sharp(readFileSync(filePath))
    const metadata = await image.metadata()

    if (!metadata.width || !metadata.height) {
      if (stats.size > MAX_IMAGE_SIZE) {
        const compressedBuffer = await image.jpeg({ quality: 80 }).toBuffer()
        return createImageResponse(compressedBuffer, 'jpeg')
      }
    }

    // Calculate dimensions while maintaining aspect ratio
    let width = metadata.width || 0
    let height = metadata.height || 0

    // Check if the original file just works
    if (
      stats.size <= MAX_IMAGE_SIZE &&
      width <= MAX_WIDTH &&
      height <= MAX_HEIGHT
    ) {
      return createImageResponse(readFileSync(filePath), ext)
    }

    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width)
      width = MAX_WIDTH
    }

    if (height > MAX_HEIGHT) {
      width = Math.round((width * MAX_HEIGHT) / height)
      height = MAX_HEIGHT
    }

    // Resize image and convert to buffer
    const resizedImageBuffer = await image
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer()

    // If still too large after resize, compress quality
    if (resizedImageBuffer.length > MAX_IMAGE_SIZE) {
      const compressedBuffer = await image.jpeg({ quality: 80 }).toBuffer()
      return createImageResponse(compressedBuffer, 'jpeg')
    }

    return createImageResponse(resizedImageBuffer, ext)
  } catch (e) {
    logError(e)
    // If any error occurs during processing, return original image
    return createImageResponse(readFileSync(filePath), ext)
  }
}
