import { useCallback, useEffect, useState } from 'react'
import type { GitHubSearchResult } from '../../../types'

export type HeroPanel = 'overview' | 'details'

export function useLibrarySelection(visibleRepositories: GitHubSearchResult[]) {
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | null>(null)
  const [featuredRepo, setFeaturedRepo] = useState<GitHubSearchResult | null>(null)
  const [heroPanel, setHeroPanel] = useState<HeroPanel>('overview')

  const selectFeaturedRepo = useCallback((repo: GitHubSearchResult, panel: HeroPanel = 'overview') => {
    setFeaturedRepo(repo)
    setHeroPanel(panel)
  }, [])

  useEffect(() => {
    if (visibleRepositories.length === 0) {
      setFeaturedRepo(null)
      setHeroPanel('overview')
      return
    }

    if (!featuredRepo || !visibleRepositories.some((repo) => repo.id === featuredRepo.id)) {
      setFeaturedRepo(visibleRepositories[0])
      setHeroPanel('overview')
    }
  }, [featuredRepo, visibleRepositories])

  return {
    selectedRepo,
    setSelectedRepo,
    featuredRepo,
    heroPanel,
    setHeroPanel,
    selectFeaturedRepo,
  }
}
