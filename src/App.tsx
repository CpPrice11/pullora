import { useEffect, useState } from 'react'
import './App.css'
import Layout from './components/Layout/Layout'
import SearchPage from './pages/SearchPage'
import InstalledPage from './pages/InstalledPage'
import FavoritesPage from './pages/FavoritesPage'
import SettingsPage from './pages/SettingsPage'
import InstallationPathModal from './components/Modal/InstallationPathModal'
import { useSettings } from './hooks/useSettings'

type Tab = 'search' | 'installed' | 'favorites' | 'settings'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('search')
  const { isFirstLaunch, setInstallationPath } = useSettings()
  const [showPathModal, setShowPathModal] = useState(isFirstLaunch)

  useEffect(() => {
    setShowPathModal(isFirstLaunch)
  }, [isFirstLaunch])

  const handlePathSelected = async (path: string) => {
    await setInstallationPath(path)
    setShowPathModal(false)
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'search':
        return <SearchPage />
      case 'installed':
        return <InstalledPage />
      case 'favorites':
        return <FavoritesPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <SearchPage />
    }
  }

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
      {showPathModal && (
        <InstallationPathModal onPathSelected={handlePathSelected} />
      )}
    </Layout>
  )
}

export default App
