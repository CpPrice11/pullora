import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppSettings } from '../types'
import {
  getSettings,
  setInstallationPath as saveInstallationPath,
  checkIsFirstLaunch,
  SETTINGS_CHANGE_EVENT,
} from '../services/settings'
import { DEFAULT_SETTINGS, normalizeSettings } from '../utils/settingsDefaults'

interface SettingsContextValue {
  settings: AppSettings
  isFirstLaunch: boolean
  loading: boolean
  setInstallationPath: (path: string) => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
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

  const setInstallationPath = useCallback(async (path: string) => {
    await saveInstallationPath(path)
    setSettings((prev) => ({ ...prev, installationPath: path }))
    setIsFirstLaunch(false)
  }, [])

  const value = useMemo(() => ({
    settings,
    isFirstLaunch,
    loading,
    setInstallationPath,
  }), [isFirstLaunch, loading, setInstallationPath, settings])

  return createElement(SettingsContext.Provider, { value }, children)
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used inside SettingsProvider')
  }

  return context
}
