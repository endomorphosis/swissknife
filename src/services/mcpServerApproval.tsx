import React from 'react.js.js.js.js.js'
import { render } from 'ink.js.js.js.js.js'
import { MCPServerMultiselectDialog } from '../components/MCPServerMultiselectDialog.js.js.js.js.js.js.js.js.js.js.js'
import { MCPServerApprovalDialog } from '../components/MCPServerApprovalDialog.js.js.js.js.js.js.js.js.js.js.js'
import { getMcprcServerStatus } from './mcpClient.js.js.js.js.js.js.js.js.js.js.js'
import { getMcprcConfig } from '../utils/config.js.js.js.js.js.js.js.js.js.js.js'

export async function handleMcprcServerApprovals(): Promise<void> {
  const mcprcServers = getMcprcConfig()
  const pendingServers = Object.keys(mcprcServers).filter(
    serverName => getMcprcServerStatus(serverName) === 'pending',
  )

  if (pendingServers.length === 0) {
    return
  }

  await new Promise<void>(resolve => {
    const clearScreenAndResolve = () => {
      // Clear screen after dialog
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H', () => {
        resolve()
      })
    }

    if (pendingServers.length === 1 && pendingServers[0] !== undefined) {
      const result = render(
        <MCPServerApprovalDialog
          serverName={pendingServers[0]}
          onDone={() => {
            result.unmount?.()
            clearScreenAndResolve()
          }}
        />,
        { exitOnCtrlC: false },
      )
    } else {
      const result = render(
        <MCPServerMultiselectDialog
          serverNames={pendingServers}
          onDone={() => {
            result.unmount?.()
            clearScreenAndResolve()
          }}
        />,
        { exitOnCtrlC: false },
      )
    }
  })
}