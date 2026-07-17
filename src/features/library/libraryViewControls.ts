export const LIBRARY_FILTERS = ['all', 'installed', 'updates', 'favorites'] as const
export const LIBRARY_SORTS = ['name', 'launched', 'installed', 'updated'] as const
export const LIBRARY_DENSITIES = ['normal', 'compact'] as const

export type LibraryFilter = typeof LIBRARY_FILTERS[number]
export type LibrarySort = typeof LIBRARY_SORTS[number]
export type LibraryDensity = typeof LIBRARY_DENSITIES[number]
