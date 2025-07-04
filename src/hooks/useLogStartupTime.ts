import { useEffect } from 'react'
import { logEvent } from '../services/statsig'

export function useLogStartupTime(): void {
  useEffect(() => {
    const startupTimeMs = Math.round(process.uptime() * 1000)
    logEvent('tengu_timer', {
      event: 'startup',
      durationMs: String(startupTimeMs),
    })
  }, [])
}
