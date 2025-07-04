import { getGlobalConfig, getOrCreateUserID } from './config.js'
import { memoize } from 'lodash-es'
import { env } from './env.js'
import { type StatsigUser } from '@statsig/js-client'
import { execFileNoThrow } from './execFileNoThrow.js'
import { logError, SESSION_ID } from './log.js'
import { MACRO } from '../constants/macros'
export const getGitEmail = memoize(async (): Promise<string | undefined> => {
  const result = await execFileNoThrow('git', ['config', 'user.email'])
  if (result.code !== 0) {
    logError(`Failed to get git email: ${result.stdout} ${result.stderr}`)
    return undefined
  }
  return result.stdout.trim() || undefined
})

export const getUser = memoize(async (): Promise<StatsigUser> => {
  const userID = getOrCreateUserID()
  const config = getGlobalConfig()
  const email = undefined
  return {
    customIDs: {
      // for session level tests
      sessionId: SESSION_ID,
    },
    userID,
    appVersion: MACRO.VERSION,
    userAgent: env.platform,
    email,
    custom: {
      nodeVersion: env.nodeVersion,
      userType: process.env.USER_TYPE,
      organizationUuid: config.oauthAccount?.organizationUuid,
      accountUuid: config.oauthAccount?.accountUuid,
    },
  }
})
