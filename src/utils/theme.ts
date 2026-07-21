import type { AppSettings } from '../types'
import { normalizeAppearance } from './settingsDefaults'

export type ThemePreference = AppSettings['theme']
export type ResolvedTheme = 'light' | 'dark'

export function resolveThemePreference(theme: ThemePreference): ResolvedTheme {
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return theme
}

export function applyThemePreference(theme: ThemePreference, animate = false) {
  const root = document.documentElement
  const resolvedTheme = resolveThemePreference(theme)

  if (animate) {
    root.classList.add('theme-transition')
    window.setTimeout(() => root.classList.remove('theme-transition'), 280)
  }

  root.dataset.theme = resolvedTheme
  root.dataset.themePreference = theme
  return resolvedTheme
}

const THEME_PALETTES = {
  dark: {
    accent: '#60cdff',
    accentHover: '#4cc2ff',
    background: '#070b10',
    surface: '#111820',
    surface2: '#18222d',
    sidebar: '#0b1118',
    text: '#f4f6f8',
    muted: '#a8b4c0',
    border: '#334455',
  },
  light: {
    accent: '#0067c0',
    accentHover: '#005a9e',
    background: '#dfe8f2',
    surface: '#f8fafc',
    surface2: '#e7eef6',
    sidebar: '#e8eff7',
    text: '#111827',
    muted: '#40536a',
    border: '#9fb0c3',
  },
} as const

export function appearanceCssVariables(
  appearance: AppSettings['appearance'] | undefined,
  theme: ResolvedTheme = 'dark',
) {
  const normalized = normalizeAppearance(appearance)
  const palette = THEME_PALETTES[theme]
  const isLight = theme === 'light'
  const densityScale = normalized.density === 'compact' ? 0.86 : normalized.density === 'spacious' ? 1.12 : 1
  const surfaceOpacity = 100 - normalized.surfaceTransparency
  const shellOpacity = isLight ? Math.min(92, surfaceOpacity + 8) : surfaceOpacity
  const nestedOpacity = Math.round(shellOpacity * (isLight ? 0.68 : 0.55))
  const insetOpacity = Math.round(shellOpacity * (isLight ? 0.82 : 0.72))
  const strongOpacity = Math.min(100, shellOpacity + 12)
  const backgroundScrimOpacity = Math.max(
    isLight ? 34 : 28,
    Math.min(isLight ? 70 : 66, shellOpacity - 8),
  )

  return {
    '--color-primary': palette.accent,
    '--color-primary-dark': palette.accentHover,
    '--color-primary-light': `${palette.accent}24`,
    '--color-bg': isLight ? palette.background : `color-mix(in srgb, ${palette.background} 58%, transparent)`,
    '--color-bg-elevated': isLight ? palette.surface : `color-mix(in srgb, ${palette.surface} 52%, transparent)`,
    '--color-bg-secondary': isLight ? palette.surface2 : `color-mix(in srgb, ${palette.surface2} 42%, transparent)`,
    '--color-mica': isLight ? `color-mix(in srgb, ${palette.surface} 94%, transparent)` : `color-mix(in srgb, ${palette.surface} 42%, transparent)`,
    '--color-sidebar': isLight ? `color-mix(in srgb, ${palette.sidebar} 94%, transparent)` : `color-mix(in srgb, ${palette.sidebar} 48%, transparent)`,
    '--color-control': isLight ? palette.surface : `color-mix(in srgb, ${palette.surface2} 34%, transparent)`,
    '--color-control-hover': isLight ? palette.surface2 : `color-mix(in srgb, ${palette.surface2} 52%, transparent)`,
    '--color-text': palette.text,
    '--color-text-secondary': palette.muted,
    '--color-text-tertiary': isLight ? palette.muted : `${palette.muted}cc`,
    '--color-border': palette.border,
    '--color-border-subtle': isLight ? palette.border : `${palette.border}99`,
    '--font-family': 'Segoe UI Variable, Segoe UI, Arial, sans-serif',
    '--font-size-base': '14px',
    '--border-radius': '8px',
    '--border-radius-lg': '14px',
    '--density-scale': String(densityScale),
    '--surface-opacity': `${surfaceOpacity}%`,
    '--surface-opacity-strong': `${strongOpacity}%`,
    '--surface-blur': `${normalized.surfaceBlur}px`,
    '--surface-canvas': palette.background,
    '--launcher-background-scrim': `color-mix(in srgb, ${palette.background} ${backgroundScrimOpacity}%, transparent)`,
    '--surface-1': `color-mix(in srgb, ${palette.surface} ${shellOpacity}%, transparent)`,
    '--surface-2': `color-mix(in srgb, ${palette.surface2} ${nestedOpacity}%, transparent)`,
    '--surface-3': `color-mix(in srgb, ${palette.background} ${insetOpacity}%, transparent)`,
    '--surface-border': `color-mix(in srgb, ${palette.border} ${isLight ? 82 : 58}%, transparent)`,
    '--surface-border-strong': `color-mix(in srgb, ${palette.border} ${isLight ? 100 : 78}%, transparent)`,
    '--surface-shadow': isLight
      ? `0 18px 48px color-mix(in srgb, ${palette.border} 24%, transparent)`
      : `0 18px 48px color-mix(in srgb, ${palette.background} 58%, transparent)`,
    '--surface-material': 'var(--surface-1)',
    '--surface-material-strong': `color-mix(in srgb, ${palette.surface} ${strongOpacity}%, transparent)`,
    '--material-mica': 'var(--surface-1)',
    '--material-mica-strong': 'var(--surface-material-strong)',
    '--material-acrylic': 'linear-gradient(180deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.024)), var(--surface-1)',
    '--material-acrylic-strong': 'linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.034)), var(--surface-material-strong)',
    '--material-acrylic-subtle': 'linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.014)), var(--surface-2)',
    '--material-border': 'var(--surface-border)',
    '--material-border-strong': 'var(--surface-border-strong)',
  }
}

export function applyAppearanceSettings(
  appearance: AppSettings['appearance'] | undefined,
  theme: ResolvedTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
) {
  const root = document.documentElement
  const normalized = normalizeAppearance(appearance)
  const variables = appearanceCssVariables(normalized, theme)

  Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value))
}
