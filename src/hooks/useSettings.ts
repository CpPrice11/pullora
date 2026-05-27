import { useState, useEffect } from 'react'
import type { AppSettings } from '../types'
import {
  getSettings,
  setInstallationPath as saveInstallationPath,
  checkIsFirstLaunch,
  SETTINGS_CHANGE_EVENT,
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

  useEffect(() => {
    const handleSettingsChange = (event: Event) => {
      const changedSettings = (event as CustomEvent<Partial<AppSettings>>).detail
      if (!changedSettings) return

      setSettings((previous) => normalizeSettings({ ...previous, ...changedSettings }))
      if (changedSettings.installationPath) {
        setIsFirstLaunch(false)
      }
    }

    window.addEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange)
    return () => window.removeEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange)
  }, [])

  const setInstallationPath = async (path: string) => {
    await saveInstallationPath(path)
    setSettings((prev) => ({ ...prev, installationPath: path }))
    setIsFirstLaunch(false)
  }

  return { settings, isFirstLaunch, loading, setInstallationPath }
}
