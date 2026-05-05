import { useEffect, useState } from 'react'
import './App.css'
import Layout from './components/Layout/Layout'
import SearchPage from './pages/SearchPage'
import InstalledPage from './pages/InstalledPage'
import FavoritesPage from './pages/FavoritesPage'
import SettingsPage from './pages/SettingsPage'
import InstallationPathModal from './components/Modal/InstallationPathModal'
import UpdateBanner from './components/UpdateBanner/UpdateBanner'
import ReleaseSelector from './components/Search/ReleaseSelector'
import { useSettings } from './hooks/useSettings'
import { useAutoUpdate } from './hooks/useAutoUpdate'
import type { UpdateAvailable } from './types'

type Tab = 'search' | 'installed' | 'favorites' | 'settings'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('search')
  const { settings, isFirstLaunch, setInstallationPath } = useSettings()
  const [showPathModal, setShowPathModal] = useState(false)

  // Start auto-update after settings are loaded
  const { updates, checking, check, dismiss } = useAutoUpdate(
    settings.checkIntervalHours,
    settings.autoUpdateCheck,
  )

  // Repo open from update banner
  const [updateTarget, setUpdateTarget] = useState<UpdateAvailable | null>(null)

  useEffect(() => {
    setShowPathModal(isFirstLaunch)
  }, [isFirstLaunch])

  const handlePathSelected = async (path: string) => {
    await setInstallationPath(path)
    setShowPathModal(false)
  }

  const handleInstallUpdate = (update: UpdateAvailable) => {
    dismiss(update.owner, update.repo)
    setUpdateTarget(update)
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'search':    return <SearchPage />
      case 'installed': return <InstalledPage />
      case 'favorites': return <FavoritesPage />
      case 'settings':  return <SettingsPage />
      default:          return <SearchPage />
    }
  }

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      updatesCount={updates.length}
      checking={checking}
      onCheckUpdates={check}
    >
      {updates.length > 0 && (
        <UpdateBanner
          updates={updates}
          onDismiss={dismiss}
          onInstall={handleInstallUpdate}
        />
      )}

      {renderContent()}

      {showPathModal && (
        <InstallationPathModal onPathSelected={handlePathSelected} />
      )}

      {updateTarget && (
        <ReleaseSelector
          owner={updateTarget.owner}
          repo={updateTarget.repo}
          displayName={updateTarget.appName}
          onClose={() => setUpdateTarget(null)}
        />
      )}
    </Layout>
  )
}

export default App
