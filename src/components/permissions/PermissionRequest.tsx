import { useInput } from 'ink'
import * as React from 'react'
import { Tool } from '../Tool'
import { AssistantMessage } from '../query'
import { FileEditTool } from '@/tools/FileEditTool/FileEditTool.tsx'
import { FileWriteTool } from '@/tools/FileWriteTool/FileWriteTool'
import { BashTool } from '@/tools/BashTool/BashTool'
import { FileEditPermissionRequest } from './FileEditPermissionRequest/FileEditPermissionRequest.js'
import { BashPermissionRequest } from './BashPermissionRequest/BashPermissionRequest.js'
import { FallbackPermissionRequest } from './FallbackPermissionRequest.js'
import { useNotifyAfterTimeout } from '@/hooks/useNotifyAfterTimeout'
import { FileWritePermissionRequest } from './FileWritePermissionRequest/FileWritePermissionRequest.js'
import { type CommandSubcommandPrefixResult } from '@/utils/commands'
import { FilesystemPermissionRequest } from './FilesystemPermissionRequest/FilesystemPermissionRequest.js'
import { NotebookEditTool } from '@/tools/NotebookEditTool/NotebookEditTool'
import { GlobTool } from '@/tools/GlobTool/GlobTool'
import { GrepTool } from '@/tools/GrepTool/GrepTool'
import { LSTool } from '@/tools/lsTool/lsTool'
import { FileReadTool } from '@/tools/FileReadTool/FileReadTool'
import { NotebookReadTool } from '@/tools/NotebookReadTool/NotebookReadTool'
import { PRODUCT_NAME } from '@/constants/product'

function permissionComponentForTool(tool: Tool) {
  switch (tool) {
    case FileEditTool:
      return FileEditPermissionRequest
    case FileWriteTool:
      return FileWritePermissionRequest
    case BashTool:
      return BashPermissionRequest
    case GlobTool:
    case GrepTool:
    case LSTool:
    case FileReadTool:
    case NotebookReadTool:
    case NotebookEditTool:
      return FilesystemPermissionRequest
    default:
      return FallbackPermissionRequest
  }
}

export type PermissionRequestProps = {
  toolUseConfirm: ToolUseConfirm
  onDone(): void
  verbose: boolean
}

export function toolUseConfirmGetPrefix(
  toolUseConfirm: ToolUseConfirm,
): string | null {
  return (
    (toolUseConfirm.commandPrefix &&
      !toolUseConfirm.commandPrefix.commandInjectionDetected &&
      toolUseConfirm.commandPrefix.commandPrefix) ||
    null
  )
}

export type ToolUseConfirm = {
  assistantMessage: AssistantMessage
  tool: Tool
  description: string
  input: { [key: string]: unknown }
  commandPrefix: CommandSubcommandPrefixResult | null
  // TODO: remove riskScore from ToolUseConfirm
  riskScore: number | null
  onAbort(): void
  onAllow(type: 'permanent' | 'temporary'): void
  onReject(): void
}

// TODO: Move this to Tool.renderPermissionRequest
export function PermissionRequest({
  toolUseConfirm,
  onDone,
  verbose,
}: PermissionRequestProps): React.ReactNode {
  // Handle Ctrl+C
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onDone()
      toolUseConfirm.onReject()
    }
  })

  const toolName = toolUseConfirm.tool.userFacingName(
    toolUseConfirm.input as never,
  )
  useNotifyAfterTimeout(
    `${PRODUCT_NAME} needs your permission to use ${toolName}`,
  )

  const PermissionComponent = permissionComponentForTool(toolUseConfirm.tool)

  return (
    <PermissionComponent
      toolUseConfirm={toolUseConfirm}
      onDone={onDone}
      verbose={verbose}
    />
  )
}
