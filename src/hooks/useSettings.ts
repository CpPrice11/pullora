import { useState, useEffect } from 'react'
import type { AppSettings } from '../types'
import {
  getSettings,
  setInstallationPath as saveInstallationPath,
  updateSettings as saveSettings,
  checkIsFirstLaunch,
} from '../services/settings'

const DEFAULT_SETTINGS: AppSettings = {
  installationPath: '',
  autoUpdateCheck: true,
  checkIntervalHours: 24,
  githubOwner: 'CpPrice11',
  theme: 'auto',
  language: 'uk',
}

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    githubOwner: settings.githubOwner?.trim() || DEFAULT_SETTINGS.githubOwner,
    language: settings.language || DEFAULT_SETTINGS.language,
  }
}

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
    const next = { ...settings, ...partial }
    await saveSettings(next)
    setSettings(next)
  }

  return { settings, isFirstLaunch, loading, setInstallationPath, updateSettings }
}
