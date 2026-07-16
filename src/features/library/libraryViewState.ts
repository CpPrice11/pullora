import type { LibraryDensity } from './components/LibrarySidebar'
import type { LibraryFilter, LibrarySort } from './hooks/useLibraryFiltering'

const storageKey = 'pullora-library-view-v1'

export interface LibraryViewState {
  version: 1
  query: string
  filter: LibraryFilter
  sort: LibrarySort
  density: LibraryDensity
  featuredRepoKey: string | null
  sidebarScrollTop: number
  detailsScrollTop: number
}

const defaults: LibraryViewState = {
  version: 1,
  query: '',
  filter: 'all',
  sort: 'updated',
  density: 'normal',
  featuredRepoKey: null,
  sidebarScrollTop: 0,
  detailsScrollTop: 0,
}

const filters = new Set<LibraryFilter>(['all', 'installed', 'updates', 'favorites'])
const sorts = new Set<LibrarySort>(['name', 'launched', 'installed', 'updated'])
const densities = new Set<LibraryDensity>(['normal', 'compact'])

function scrollTop(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

export function parseLibraryViewState(raw: string | null): LibraryViewState {
  if (!raw) return { ...defaults }

  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!value || value.version !== 1) return { ...defaults }

    return {
      version: 1,
      query: typeof value.query === 'string' ? value.query.slice(0, 500) : '',
      filter: filters.has(value.filter as LibraryFilter) ? value.filter as LibraryFilter : 'all',
      sort: sorts.has(value.sort as LibrarySort) ? value.sort as LibrarySort : 'updated',
      density: densities.has(value.density as LibraryDensity)
        ? value.density as LibraryDensity
        : 'normal',
      featuredRepoKey: typeof value.featuredRepoKey === 'string'
        ? value.featuredRepoKey.slice(0, 500)
        : null,
      sidebarScrollTop: scrollTop(value.sidebarScrollTop),
      detailsScrollTop: scrollTop(value.detailsScrollTop),
    }
  } catch {
    return { ...defaults }
  }
}

export function loadLibraryViewState() {
  if (typeof window === 'undefined') return { ...defaults }

  try {
    return parseLibraryViewState(window.localStorage.getItem(storageKey))
  } catch {
    return { ...defaults }
  }
}

export function saveLibraryViewState(state: LibraryViewState) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    // Бібліотека залишається доступною, навіть якщо локальне сховище вимкнене.
  }
}
