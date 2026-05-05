import { useState, useEffect } from 'react'
import { AppSettings } from '../types'

const DEFAULT_SETTINGS: AppSettings = {
  installationPath: '',
  autoUpdateCheck: true,
  checkIntervalHours: 24,
  theme: 'auto',
  language: 'en',
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isFirstLaunch, setIsFirstLaunch] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Load settings from storage using Tauri
    // For now, simulate loading
    setTimeout(() => {
      setLoading(false)
    }, 100)
  }, [])

  const setInstallationPath = async (path: string): Promise<void> => {
    // TODO: Save to storage using Tauri
    setSettings({
      ...settings,
      installationPath: path,
    })
    setIsFirstLaunch(false)
  }

  const updateSettings = async (newSettings: Partial<AppSettings>): Promise<void> => {
    // TODO: Save to storage using Tauri
    setSettings({
      ...settings,
      ...newSettings,
    })
  }

  return {
    settings,
    isFirstLaunch,
    loading,
    setInstallationPath,
    updateSettings,
  }
}
