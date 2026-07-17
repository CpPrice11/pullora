import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/layers.css'
import './styles/base/Reset.css'
import App from './App.tsx'
import './App.css'
import './styles/Cinematic.css'
import './styles/features/LibraryLayout.css'
import './styles/features/LibraryDensity.css'
import { SettingsProvider } from './hooks/useSettings.ts'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>,
)
