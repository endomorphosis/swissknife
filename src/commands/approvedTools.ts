import {
  ProjectConfig,
  getCurrentProjectConfig as getCurrentProjectConfigDefault,
  saveCurrentProjectConfig as saveCurrentProjectConfigDefault,
} from '../utils/config'

export type ProjectConfigHandler = {
  getCurrentProjectConfig: () => Promise<ProjectConfig>
  saveCurrentProjectConfig: (config: ProjectConfig) => void
}

// Default config handler using the real implementation
const defaultConfigHandler: ProjectConfigHandler = {
  getCurrentProjectConfig: getCurrentProjectConfigDefault,
  saveCurrentProjectConfig: saveCurrentProjectConfigDefault,
}

/**
 * Handler for the 'approved-tools list' command
 */
export async function handleListApprovedTools(
  cwd: string,
  projectConfigHandler: ProjectConfigHandler = defaultConfigHandler,
): Promise<string> {
  const projectConfig = await projectConfigHandler.getCurrentProjectConfig()
  return `Allowed tools for ${cwd}:\n${projectConfig.allowedTools.join('\n')}`
}

/**
 * Handler for the 'approved-tools remove' command
 */
export async function handleRemoveApprovedTool(
  tool: string,
  projectConfigHandler: ProjectConfigHandler = defaultConfigHandler,
): Promise<{ success: boolean; message: string }> {
  const projectConfig = await projectConfigHandler.getCurrentProjectConfig()
  const originalToolCount = projectConfig.allowedTools.length
  const updatedAllowedTools = projectConfig.allowedTools.filter(t => t !== tool)

  if (originalToolCount !== updatedAllowedTools.length) {
    projectConfig.allowedTools = updatedAllowedTools
    projectConfigHandler.saveCurrentProjectConfig(projectConfig)
    return {
      success: true,
      message: `Removed ${tool} from the list of approved tools`,
    }
  } else {
    return {
      success: false,
      message: `${tool} was not in the list of approved tools`,
    }
  }
}
