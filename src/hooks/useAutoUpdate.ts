import { useState, useCallback, useEffect, useRef } from 'react'
import type { UpdateAvailable } from '../types'
import { checkForUpdates } from '../services/updates'

export function useAutoUpdate(_intervalHours: number, enabled: boolean) {
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])
  const hasCheckedOnStartupRef = useRef(false)

  const check = useCallback(async () => {
    try {
      const found = await checkForUpdates()
      setUpdates(found)
    } catch {
      // Ignore — could be no installed apps or no network
    }
  }, [])

  // Startup-only auto-check. Manual update checks live in Library.
  useEffect(() => {
    if (!enabled || hasCheckedOnStartupRef.current) return
    hasCheckedOnStartupRef.current = true
    void check()
  }, [enabled, check])

  const dismiss = useCallback((owner: string, repo: string) => {
    setUpdates((prev) => prev.filter((u) => !(u.owner === owner && u.repo === repo)))
  }, [])

  return { updates, dismiss }
}
