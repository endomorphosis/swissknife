import { memoize } from 'lodash-es'
import { checkGate } from '../services/statsig'
import {
  GATE_TOKEN_EFFICIENT_TOOLS,
  BETA_HEADER_TOKEN_EFFICIENT_TOOLS,
  CLAUDE_CODE_20250219_BETA_HEADER,
} from '../constants/betas'

export const getBetas = memoize(async (): Promise<string[]> => {
  const betaHeaders = [CLAUDE_CODE_20250219_BETA_HEADER]

  if (process.env.USER_TYPE === 'ant' || process.env.SWE_BENCH) {
    const useTokenEfficientTools = await checkGate(GATE_TOKEN_EFFICIENT_TOOLS)
    if (useTokenEfficientTools) {
      betaHeaders.push(BETA_HEADER_TOKEN_EFFICIENT_TOOLS)
    }
  }

  return betaHeaders
})
