import { useState, useCallback, useEffect } from 'react'
import type { UpdateAvailable } from '../types'
import { checkForUpdates } from '../services/updates'

export function useAutoUpdate(intervalHours: number, enabled: boolean) {
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const check = useCallback(async () => {
    setChecking(true)
    try {
      const found = await checkForUpdates()
      setUpdates(found)
      setLastChecked(new Date())
    } catch {
      // Ignore — could be no installed apps or no network
    } finally {
      setChecking(false)
    }
  }, [])

  // Periodic auto-check
  useEffect(() => {
    if (!enabled) return
    check() // check immediately on mount
    const ms = intervalHours * 60 * 60 * 1000
    const id = setInterval(check, ms)
    return () => clearInterval(id)
  }, [enabled, intervalHours, check])

  const dismiss = useCallback((owner: string, repo: string) => {
    setUpdates((prev) => prev.filter((u) => !(u.owner === owner && u.repo === repo)))
  }, [])

  return { updates, checking, lastChecked, check, dismiss }
}
