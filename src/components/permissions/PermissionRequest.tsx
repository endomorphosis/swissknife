import { useInput } from 'ink.js.js.js.js.js'
import * as React from 'react.js.js.js.js.js'
import { Tool } from '../../Tool.js.js.js.js.js.js.js.js.js.js'
import { AssistantMessage } from '../../query.js.js.js.js.js.js.js.js.js.js'
import { FileEditTool } from '../../tools/FileEditTool/FileEditTool.js.js.js.js.js.js.js.js.js.js'
import { FileWriteTool } from '../../tools/FileWriteTool/FileWriteTool.js.js.js.js.js.js.js.js.js.js'
import { BashTool } from '../../tools/BashTool/BashTool.js.js.js.js.js.js.js.js.js.js'
import { FileEditPermissionRequest } from './FileEditPermissionRequest/FileEditPermissionRequest.js.js.js.js.js.js.js.js.js.js'
import { BashPermissionRequest } from './BashPermissionRequest/BashPermissionRequest.js.js.js.js.js.js.js.js.js.js'
import { FallbackPermissionRequest } from './FallbackPermissionRequest.js.js.js.js.js.js.js.js.js.js'
import { useNotifyAfterTimeout } from '../../hooks/useNotifyAfterTimeout.js.js.js.js.js.js.js.js.js.js'
import { FileWritePermissionRequest } from './FileWritePermissionRequest/FileWritePermissionRequest.js.js.js.js.js.js.js.js.js.js'
import { type CommandSubcommandPrefixResult } from '../../utils/commands.js.js.js.js.js.js.js.js.js.js'
import { FilesystemPermissionRequest } from './FilesystemPermissionRequest/FilesystemPermissionRequest.js.js.js.js.js.js.js.js.js.js'
import { NotebookEditTool } from '../../tools/NotebookEditTool/NotebookEditTool.js.js.js.js.js.js.js.js.js.js'
import { GlobTool } from '../../tools/GlobTool/GlobTool.js.js.js.js.js.js.js.js.js.js'
import { GrepTool } from '../../tools/GrepTool/GrepTool.js.js.js.js.js.js.js.js.js.js'
import { LSTool } from '../../tools/lsTool/lsTool.js.js.js.js.js.js.js.js.js.js'
import { FileReadTool } from '../../tools/FileReadTool/FileReadTool.js.js.js.js.js.js.js.js.js.js'
import { NotebookReadTool } from '../../tools/NotebookReadTool/NotebookReadTool.js.js.js.js.js.js.js.js.js.js'
import { PRODUCT_NAME } from '../../constants/product.js.js.js.js.js.js.js.js.js.js'

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
  // riskScore is retained for compatibility; future work to move this to Tool.riskScore
  riskScore: number | null
  onAbort(): void
  onAllow(type: 'permanent' | 'temporary'): void
  onReject(): void
}

// Note: ideally this moves to Tool.renderPermissionRequest for per-tool customization
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
