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
  githubOwner: '',
  theme: 'auto',
  language: 'en',
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isFirstLaunch, setIsFirstLaunch] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [s, first] = await Promise.all([getSettings(), checkIsFirstLaunch()])
        setSettings(s)
        setIsFirstLaunch(first)
      } catch {
        // Running in browser without Tauri — treat as first launch
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
