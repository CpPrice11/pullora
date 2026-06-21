import type { GitHubSearchResult } from '../../types'

export type StoreProjectType =
  | 'application'
  | 'cli'
  | 'game'
  | 'library'
  | 'template'
  | 'resource-list'
  | 'other'

const resourceListSignals = [
  'awesome-list',
  'awesome list',
  'curated-list',
  'curated list',
  'resource-list',
  'resource list',
  'collection of',
]

const templateSignals = [
  'template',
  'boilerplate',
  'starter',
  'scaffold',
  'skeleton',
  'example project',
]

const librarySignals = [
  'library',
  'framework',
  'sdk',
  'package',
  'component library',
  'npm-package',
  'crate',
  'dependency',
]

const cliSignals = [
  'cli',
  'command-line',
  'command line',
  'terminal',
  'console application',
]

const gameSignals = [
  'game',
  'gaming',
  'game-engine',
  'game engine',
]

const strongApplicationSignals = [
  'desktop-application',
  'desktop application',
  'windows-app',
  'native-app',
  'gui',
  'electron',
  'tauri',
  'wails',
  'appimage',
  'portable',
]

const broadApplicationSignals = [
  'productivity',
  'client',
  'interface',
  'web app',
  'web application',
  'utility',
  'developer-tools',
]

function classifierText(repo: GitHubSearchResult) {
  return [
    repo.name,
    repo.full_name,
    repo.description ?? '',
    repo.language ?? '',
    ...(repo.topics ?? []),
  ].join(' ').toLowerCase().replace(/[_/]+/g, ' ')
}

function hasSignal(text: string, signals: string[]) {
  return signals.some((signal) => {
    const escaped = signal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)
  })
}

export function classifyStoreProject(repo: GitHubSearchResult): StoreProjectType {
  const text = classifierText(repo)
  const normalizedName = repo.name.toLowerCase()

  if (
    normalizedName.startsWith('awesome-')
    || normalizedName === 'awesome'
    || hasSignal(text, resourceListSignals)
  ) {
    return 'resource-list'
  }

  if (hasSignal(text, templateSignals)) return 'template'
  if (hasSignal(text, gameSignals)) return 'game'
  if (hasSignal(text, cliSignals)) return 'cli'
  if (hasSignal(text, strongApplicationSignals)) return 'application'
  if (hasSignal(text, librarySignals)) return 'library'
  if (hasSignal(text, broadApplicationSignals)) return 'application'

  return 'other'
}

export function isStoreApplicationProject(repo: GitHubSearchResult) {
  const type = classifyStoreProject(repo)
  return type === 'application' || type === 'cli' || type === 'game'
}

export function storeProjectTypeLabelKey(type: StoreProjectType) {
  return `store.projectType.${type}`
}
