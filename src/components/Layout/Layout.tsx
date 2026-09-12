import React, { useEffect, useRef, useState } from 'react'
import Header from './Header'
import Sidebar, { type NavigationInput } from './Sidebar'
import { useI18n } from '../../i18n'
import './Layout.css'

type Tab = 'library' | 'settings' | 'about'

interface LayoutProps {
  children: React.ReactNode
  activeTab: Tab
  mainRef?: React.Ref<HTMLElement>
  onTabChange: (tab: Tab, input: NavigationInput) => void
  backgroundImage?: string | null
  backgroundCropStyle?: React.CSSProperties
  settingsOpen?: boolean
}

function toCssUrl(value: string) {
  return `url(${JSON.stringify(value)})`
}

interface BackgroundLayer {
  image: string | null
  cropStyle?: React.CSSProperties
}

function Layout({
  children,
  activeTab,
  mainRef,
  onTabChange,
  backgroundImage,
  backgroundCropStyle,
  settingsOpen = false,
}: LayoutProps) {
  const { t } = useI18n()
  const backgroundSignature = JSON.stringify([backgroundImage ?? null, backgroundCropStyle ?? null])
  const appliedBackgroundSignature = useRef(backgroundSignature)
  const activeBackgroundLayerRef = useRef(0)
  const [activeBackgroundLayer, setActiveBackgroundLayer] = useState(0)
  const [backgroundLayers, setBackgroundLayers] = useState<[BackgroundLayer, BackgroundLayer]>([
    { image: backgroundImage ?? null, cropStyle: backgroundCropStyle },
    { image: null },
  ])

  useEffect(() => {
    if (appliedBackgroundSignature.current === backgroundSignature) return
    appliedBackgroundSignature.current = backgroundSignature
    const nextLayer = activeBackgroundLayerRef.current === 0 ? 1 : 0
    setBackgroundLayers((current) => {
      const next = [...current] as [BackgroundLayer, BackgroundLayer]
      next[nextLayer] = { image: backgroundImage ?? null, cropStyle: backgroundCropStyle }
      return next
    })
    const frame = window.requestAnimationFrame(() => {
      activeBackgroundLayerRef.current = nextLayer
      setActiveBackgroundLayer(nextLayer)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [backgroundCropStyle, backgroundImage, backgroundSignature])

  return (
    <div
      className={`layout cinematic-shell ${backgroundImage ? 'has-custom-background' : ''} ${settingsOpen ? 'settings-open' : ''}`}
    >
      <a className="skip-link" href="#main-content">{t('nav.skipToContent')}</a>
      {backgroundLayers.map((layer, index) => (
        <div
          className={`cinematic-background ${index === activeBackgroundLayer ? 'is-active' : ''} ${
            index === activeBackgroundLayer && layer.image ? 'is-visible' : ''
          }`}
          style={layer.image
            ? { ...layer.cropStyle, backgroundImage: toCssUrl(layer.image) }
            : undefined}
          aria-hidden="true"
          key={index}
        />
      ))}
      <div className="cinematic-backdrop" aria-hidden="true" />
      <Header>
        <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
      </Header>
      <div className="layout-container">
        <main id="main-content" className={`layout-content layout-content--${activeTab}`} ref={mainRef}>
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
