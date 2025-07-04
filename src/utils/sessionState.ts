import { logEvent } from '../services/statsig'
type SessionState = {
  modelErrors: Record<string, unknown>
  currentError: string | null
  currentApiKeyIndex: Record<'small' | 'large', number>
  failedApiKeys: Record<'small' | 'large', string[]>
}

const isDebug =
  process.argv.includes('--debug') ||
  process.argv.includes('-d') ||
  process.env.DEBUG === 'true'

const sessionState: SessionState = {
  modelErrors: {},
  currentError: null,
  currentApiKeyIndex: { small: -1, large: -1 },
  failedApiKeys: { small: [], large: [] },
} as const

function setSessionState<K extends keyof SessionState>(
  key: K,
  value: SessionState[K],
): void
function setSessionState(partialState: Partial<SessionState>): void
function setSessionState(
  keyOrState: keyof SessionState | Partial<SessionState>,
  value?: any,
): void {
  if (typeof keyOrState === 'string') {
    logEvent('session_state_set', {
      key: keyOrState,
      value: JSON.stringify(value),
    })
    sessionState[keyOrState] = value
  } else {
    logEvent('session_state_set', {
      key: 'partial',
      value: JSON.stringify(keyOrState),
    })
    Object.assign(sessionState, keyOrState)
  }
}

function getSessionState(): SessionState
function getSessionState<K extends keyof SessionState>(key: K): SessionState[K]
function getSessionState<K extends keyof SessionState>(key?: K) {
  return key === undefined ? sessionState : sessionState[key]
}

export type { SessionState }
export { setSessionState, getSessionState }
export default sessionState
