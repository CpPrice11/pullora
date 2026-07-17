import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/DesignSystem.css'
import './App.css'
import './styles/PulloraShell.css'
import { SettingsProvider } from './hooks/useSettings.ts'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>,
)
