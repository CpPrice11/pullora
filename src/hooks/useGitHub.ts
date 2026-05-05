import { useState, useCallback } from 'react'
import type { GitHubSearchResult, GitHubRelease } from '../types'
import {
  searchRepositories,
  listOwnerRepositories,
  getReleases,
} from '../services/github'

interface SearchState {
  results: GitHubSearchResult[]
  totalCount: number
  loading: boolean
  error: string | null
  page: number
  hasMore: boolean
}

interface OwnerRepositoriesState {
  repositories: GitHubSearchResult[]
  loading: boolean
  error: string | null
  page: number
  hasMore: boolean
}

export function useGitHubSearch() {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState>({
    results: [],
    totalCount: 0,
    loading: false,
    error: null,
    page: 1,
    hasMore: false,
  })

  const search = useCallback(async (q: string, page = 1) => {
    if (!q.trim()) return

    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const data = await searchRepositories(q, page)
      setState((prev) => ({
        results: page === 1 ? data.items : [...prev.results, ...data.items],
        totalCount: data.total_count,
        loading: false,
        error: null,
        page,
        hasMore: data.items.length === 20,
      }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Search failed',
      }))
    }
  }, [])

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q)
      search(q, 1)
    },
    [search],
  )

  const loadMore = useCallback(() => {
    if (!state.hasMore || state.loading) return
    search(query, state.page + 1)
  }, [state.hasMore, state.loading, state.page, query, search])

  return { query, state, handleSearch, loadMore }
}

export function useOwnerRepositories(owner: string | undefined) {
  const [state, setState] = useState<OwnerRepositoriesState>({
    repositories: [],
    loading: false,
    error: null,
    page: 1,
    hasMore: false,
  })

  const loadRepositories = useCallback(
    async (page = 1) => {
      const normalizedOwner = owner?.trim()

      if (!normalizedOwner) {
        setState({
          repositories: [],
          loading: false,
          error: null,
          page: 1,
          hasMore: false,
        })
        return
      }

      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const data = await listOwnerRepositories(normalizedOwner, page, true)
        setState((prev) => ({
          repositories:
            page === 1
              ? data.items
              : [...prev.repositories, ...data.items],
          loading: false,
          error: null,
          page: data.page,
          hasMore: data.has_more,
        }))
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to load repositories',
        }))
      }
    },
    [owner],
  )

  const loadMore = useCallback(() => {
    if (!state.hasMore || state.loading) return
    loadRepositories(state.page + 1)
  }, [state.hasMore, state.loading, state.page, loadRepositories])

  return { state, loadRepositories, loadMore }
}

export function useReleases(owner: string, repo: string) {
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReleases = useCallback(async () => {
    if (!owner || !repo) return
    setLoading(true)
    setError(null)
    try {
      const data = await getReleases(owner, repo)
      setReleases(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch releases')
    } finally {
      setLoading(false)
    }
  }, [owner, repo])

  return { releases, loading, error, fetchReleases }
}
