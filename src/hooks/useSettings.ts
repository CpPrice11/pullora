import { useState, useEffect } from 'react'
import type { AppSettings } from '../types'
import {
  getSettings,
  setInstallationPath as saveInstallationPath,
  updateSettings as saveSettings,
  checkIsFirstLaunch,
} from '../services/settings'
import { DEFAULT_SETTINGS, normalizeSettings } from '../utils/settingsDefaults'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isFirstLaunch, setIsFirstLaunch] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [loadedSettings, first] = await Promise.all([
          getSettings(),
          checkIsFirstLaunch(),
        ])
        setSettings(normalizeSettings(loadedSettings))
        setIsFirstLaunch(first)
      } catch {
        // Browser preview fallback.
        setIsFirstLaunch(true)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const setInstallationPath = async (path: string) => {
    await saveInstallationPath(path)
    setSettings((prev) => ({ ...prev, installationPath: path }))
    setIsFirstLaunch(false)
  }

  const updateSettings = async (partial: Partial<AppSettings>) => {
    const next = normalizeSettings({ ...settings, ...partial })
    await saveSettings(next)
    setSettings(next)
  }

  return { settings, isFirstLaunch, loading, setInstallationPath, updateSettings }
}
