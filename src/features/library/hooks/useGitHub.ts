import { useState, useCallback } from 'react'
import type { GitHubSearchResult, GitHubRelease } from '../../../types'
import {
  listOwnerRepositories,
  getReleases,
} from '../../../services/github'

interface OwnerRepositoriesState {
  repositories: GitHubSearchResult[]
  loading: boolean
  error: string | null
  page: number
  hasMore: boolean
  lastLoadedAt: Date | null
  lastRefreshAt: Date | null
  lastErrorAt: Date | null
  isStale: boolean
}

export function useOwnerRepositories(owner: string | undefined, releasesOnly = false) {
  const [state, setState] = useState<OwnerRepositoriesState>({
    repositories: [],
    loading: false,
    error: null,
    page: 1,
    hasMore: false,
    lastLoadedAt: null,
    lastRefreshAt: null,
    lastErrorAt: null,
    isStale: false,
  })

  const loadRepositories = useCallback(
    async (page = 1, forceRefresh = false): Promise<GitHubSearchResult[] | null> => {
      const normalizedOwner = owner?.trim()

      if (!normalizedOwner) {
        setState({
          repositories: [],
          loading: false,
          error: null,
          page: 1,
          hasMore: false,
          lastLoadedAt: null,
          lastRefreshAt: null,
          lastErrorAt: null,
          isStale: false,
        })
        return []
      }

      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const data = await listOwnerRepositories(
          normalizedOwner,
          page,
          releasesOnly,
          forceRefresh,
        )
        const loadedAt = new Date()
        setState((prev) => ({
          repositories:
            page === 1
              ? data.items
              : [...prev.repositories, ...data.items],
          loading: false,
          error: null,
          page: data.page,
          hasMore: data.has_more,
          lastLoadedAt: loadedAt,
          lastRefreshAt: forceRefresh ? loadedAt : prev.lastRefreshAt,
          lastErrorAt: null,
          isStale: false,
        }))
        return data.items
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to load repositories',
          lastErrorAt: new Date(),
          isStale: prev.repositories.length > 0,
        }))
        return null
      }
    },
    [owner, releasesOnly],
  )

  const refreshRepositories = useCallback(() => {
    return loadRepositories(1, true)
  }, [loadRepositories])

  const loadMore = useCallback(() => {
    if (!state.hasMore || state.loading) return
    loadRepositories(state.page + 1)
  }, [state.hasMore, state.loading, state.page, loadRepositories])

  return { state, loadRepositories, refreshRepositories, loadMore }
}

export function useReleases(owner: string, repo: string) {
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReleases = useCallback(async (forceRefresh = false) => {
    if (!owner || !repo) return
    setLoading(true)
    setError(null)
    try {
      const data = await getReleases(owner, repo, forceRefresh)
      setReleases(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch releases')
    } finally {
      setLoading(false)
    }
  }, [owner, repo])

  return { releases, loading, error, fetchReleases }
}
