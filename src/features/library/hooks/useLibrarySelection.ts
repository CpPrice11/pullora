import { useCallback, useEffect, useRef, useState } from 'react'
import { projectArtKey } from '../../../services/projectArt'
import type { GitHubSearchResult } from '../../../types'

export type HeroPanel = 'overview' | 'details'

export function useLibrarySelection(
  visibleRepositories: GitHubSearchResult[],
  initialFeaturedRepoKey?: string | null,
) {
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | null>(null)
  const [featuredRepo, setFeaturedRepo] = useState<GitHubSearchResult | null>(null)
  const [heroPanel, setHeroPanel] = useState<HeroPanel>('overview')
  const initialFeaturedRepoKeyRef = useRef(initialFeaturedRepoKey)

  const selectFeaturedRepo = useCallback((repo: GitHubSearchResult, panel: HeroPanel = 'overview') => {
    initialFeaturedRepoKeyRef.current = null
    setFeaturedRepo(repo)
    setHeroPanel(panel)
  }, [])

  useEffect(() => {
    if (visibleRepositories.length === 0) {
      setFeaturedRepo(null)
      setHeroPanel('overview')
      return
    }

    const rememberedRepo = initialFeaturedRepoKeyRef.current
      ? visibleRepositories.find((repo) => projectArtKey(repo.owner.login, repo.name) === initialFeaturedRepoKeyRef.current)
      : undefined
    if (rememberedRepo) {
      initialFeaturedRepoKeyRef.current = null
      if (featuredRepo?.id !== rememberedRepo.id) setFeaturedRepo(rememberedRepo)
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
