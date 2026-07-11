import type { AppAppearanceSettings, AppSettings } from '../types'

export const APPEARANCE_PRESETS: Record<AppAppearanceSettings['preset'], AppAppearanceSettings> = {
  github: {
    preset: 'github',
    accent: '#60cdff',
    accentHover: '#4cc2ff',
    background: '#202020',
    surface: '#2b2b2b',
    surface2: '#252525',
    sidebar: '#202020',
    text: '#ffffff',
    muted: '#c8c8c8',
    border: '#454545',
    fontFamily: 'Segoe UI Variable, Segoe UI, Arial, sans-serif',
    fontSize: 14,
    radius: 8,
    density: 'comfortable',
    customCss: '',
  },
  githubLight: {
    preset: 'githubLight',
    accent: '#0067c0',
    accentHover: '#005a9e',
    background: '#f3f3f3',
    surface: '#ffffff',
    surface2: '#f7f7f7',
    sidebar: '#f3f3f3',
    text: '#1f1f1f',
    muted: '#5d5d5d',
    border: '#d1d1d1',
    fontFamily: 'Segoe UI Variable, Segoe UI, Arial, sans-serif',
    fontSize: 14,
    radius: 8,
    density: 'comfortable',
    customCss: '',
  },
  midnight: {
    preset: 'midnight',
    accent: '#5bd7ff',
    accentHover: '#38bdf8',
    background: '#0c1016',
    surface: '#1c1e23',
    surface2: '#242832',
    sidebar: '#10141b',
    text: '#ffffff',
    muted: '#b8c4d4',
    border: '#334155',
    fontFamily: 'Segoe UI Variable, Segoe UI, sans-serif',
    fontSize: 14,
    radius: 12,
    density: 'comfortable',
    customCss: '',
  },
  custom: {
    preset: 'custom',
    accent: '#66c0f4',
    accentHover: '#8fd3ff',
    background: '#1b2838',
    surface: '#1e2a38',
    surface2: '#2a475e',
    sidebar: '#171a21',
    text: '#c7d5e0',
    muted: '#8ba3b5',
    border: '#2a475e',
    fontFamily: 'Motiva Sans, Segoe UI, Arial, sans-serif',
    fontSize: 13,
    radius: 3,
    density: 'compact',
    customCss: '',
  },
}

const DEFAULT_APPEARANCE = APPEARANCE_PRESETS.github

function normalizeColor(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

function normalizePreset(value: unknown): AppAppearanceSettings['preset'] {
  if (value === 'steam') return 'github'
  if (value === 'steamLight') return 'githubLight'
  return typeof value === 'string' && value in APPEARANCE_PRESETS
    ? value as AppAppearanceSettings['preset']
    : DEFAULT_APPEARANCE.preset
}

export function normalizeAppearance(value: Partial<AppAppearanceSettings> | null | undefined): AppAppearanceSettings {
  const presetKey = normalizePreset(value?.preset)
  const base = APPEARANCE_PRESETS[presetKey]

  return {
    ...base,
    ...value,
    preset: presetKey,
    accent: normalizeColor(value?.accent, base.accent),
    accentHover: normalizeColor(value?.accentHover, base.accentHover),
    background: normalizeColor(value?.background, base.background),
    surface: normalizeColor(value?.surface, base.surface),
    surface2: normalizeColor(value?.surface2, base.surface2),
    sidebar: normalizeColor(value?.sidebar, base.sidebar),
    text: normalizeColor(value?.text, base.text),
    muted: normalizeColor(value?.muted, base.muted),
    border: normalizeColor(value?.border, base.border),
    fontFamily: typeof value?.fontFamily === 'string' && value.fontFamily.trim() ? value.fontFamily.trim() : base.fontFamily,
    fontSize: normalizeNumber(value?.fontSize, base.fontSize, 11, 18),
    radius: normalizeNumber(value?.radius, base.radius, 0, 20),
    density: value?.density === 'compact' || value?.density === 'comfortable' || value?.density === 'spacious' ? value.density : base.density,
    customCss: typeof value?.customCss === 'string' ? value.customCss : '',
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 2,
  installationPath: '',
  includePrereleases: false,
  assetStrategy: 'portableFirst',
  githubOwner: 'CpPrice11',
  githubToken: null,
  theme: 'auto',
  language: 'uk',
  appearance: DEFAULT_APPEARANCE,
}

export function normalizeSettings(settings: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    version: settings?.version || DEFAULT_SETTINGS.version,
    installationPath: settings?.installationPath || DEFAULT_SETTINGS.installationPath,
    includePrereleases: settings?.includePrereleases ?? DEFAULT_SETTINGS.includePrereleases,
    assetStrategy: settings?.assetStrategy || DEFAULT_SETTINGS.assetStrategy,
    githubOwner: settings?.githubOwner ?? DEFAULT_SETTINGS.githubOwner,
    githubToken: settings?.githubToken ?? DEFAULT_SETTINGS.githubToken,
    theme: settings?.theme || DEFAULT_SETTINGS.theme,
    language: settings?.language === 'en' ? 'en' : DEFAULT_SETTINGS.language,
    appearance: normalizeAppearance(settings?.appearance),
  }
}
