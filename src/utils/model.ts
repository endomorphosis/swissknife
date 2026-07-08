import { memoize } from 'lodash-es'
import { getDynamicConfig, getExperimentValue } from '../services/statsig.js'
import { logError } from './log.js'
import { getGlobalConfig } from './config.js'

export const USE_BEDROCK = !!process.env.CLAUDE_CODE_USE_BEDROCK
export const USE_VERTEX = !!process.env.CLAUDE_CODE_USE_VERTEX

export interface ModelConfig {
  bedrock: string
  vertex: string
  firstParty: string
}

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  bedrock: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
  vertex: 'claude-3-7-sonnet@20250219',
  // firstParty: 'claude-3-7-sonnet-20250219',
  firstParty: 'deepseek-chat',
}

// export const SMALL_FAST_MODEL = USE_BEDROCK
//   ? 'us.anthropic.claude-3-5-haiku-20241022-v1:0'
//   : USE_VERTEX
//     ? 'claude-3-5-haiku@20241022'
//     : 'claude-3-5-haiku-20241022'

export const SMALL_FAST_MODEL = 'deepseek-chat'
/**
 * Helper to get the model config from statsig or defaults
 * Relies on the built-in caching from StatsigClient
 */
async function getModelConfig(): Promise<ModelConfig> {
  try {
    return await getDynamicConfig<ModelConfig>(
      'tengu-capable-model-config',
      DEFAULT_MODEL_CONFIG,
    )
  } catch (error) {
    logError(error)
    return DEFAULT_MODEL_CONFIG
  }
}

export const getSlowAndCapableModel = memoize(async (): Promise<string> => {
  const config = await getGlobalConfig()
  return config.smallModelName
})

export async function isDefaultSlowAndCapableModel(): Promise<boolean> {
  return (
    !process.env.ANTHROPIC_MODEL ||
    process.env.ANTHROPIC_MODEL === (await getSlowAndCapableModel())
  )
}

/**
 * Get the region for a specific Vertex model
 * Checks for hardcoded model-specific environment variables first,
 * then falls back to CLOUD_ML_REGION env var or default region
 */
export function getVertexRegionForModel(
  model: string | undefined,
): string | undefined {
  if (model?.startsWith('claude-3-5-haiku')) {
    return process.env.VERTEX_REGION_CLAUDE_3_5_HAIKU
  } else if (model?.startsWith('claude-3-5-sonnet')) {
    return process.env.VERTEX_REGION_CLAUDE_3_5_SONNET
  } else if (model?.startsWith('claude-3-7-sonnet')) {
    return process.env.VERTEX_REGION_CLAUDE_3_7_SONNET
  }
}
