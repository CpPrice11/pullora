import { useState, useCallback } from 'react'
import type { UpdateAvailable } from '../types'
import { checkForUpdates } from '../services/updates'

export function useAutoUpdate(_intervalHours: number, enabled: boolean) {
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])

  const check = useCallback(async () => {
    if (!enabled) return []

    try {
      const found = await checkForUpdates()
      setUpdates(found)
      return found
    } catch {
      // Manual Library checks surface update errors. Startup should stay quiet.
      return []
    }
  }, [enabled])

  const dismiss = useCallback((owner: string, repo: string) => {
    setUpdates((prev) => prev.filter((u) => !(u.owner === owner && u.repo === repo)))
  }, [])

  return { updates, dismiss, check }
}
